/**
 * compiler.ts — Pure TypeScript Ren'Py script generator.
 *
 * Converts a {@link VNProject} in-memory object into a valid `.rpy` Ren'Py
 * script that can be dropped directly into a Ren'Py `game/` directory.
 *
 * ## Pipeline
 * 1. Write banner comment + resolution `init python:` block.
 * 2. Auto-discover story variables via {@link extractVars} and emit `default` lines.
 * 3. Emit one `define vnc_<id> = Character(...)` per character.
 * 4. Compile each scene as a `label vns_scene_<id>:` block via {@link compileScene}.
 *    Exports keep an imported game's own labels and character variables
 *    instead (see `exportNames`), so its translations still match.
 * 5. Emit an entry-point label that `jump`s to the start scene.
 *
 * ## Known limitations / design choices
 * - ATL blocks are passed through verbatim (no validation).
 * - `auto-advance` (`ev.duration`) appends a `pause` after *any* non-wait event.
 * - `effect` type emits Ren'Py built-in transition calls; unknown kinds fall
 *   back to a bare `with <kind>` statement.
 * - This module has **no side effects** and is safe to call from a web worker.
 *
 * Full port of `vn_compile.rpy` from the legacy Ren'Py VNVMaker.
 * No Rust/Tauri required — pure string generation from VNProject JSON.
 */

import type { VNProject, VNEvent, VNScene, VNCharacter, VNKeyframe } from "./types";
import { characterSprite, extractVars, findChar, findScene } from "./types";
import { replayTo, type ReplayStep } from "./routeReplay";

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Escape a string for use inside Ren'Py double-quoted string literals.
 *
 * Handles backslash, double-quote, and newline characters.
 * @param s - Raw string value from the project data.
 * @returns Escaped string safe for embedding in `"..."` Ren'Py literals.
 */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Python single-quoted string literal for `s` (used for Character() arguments).
 */
function pyStr(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
}

/** Colors Ren'Py accepts: #rgb, #rgba, #rrggbb or #rrggbbaa. */
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Words the Ren'Py parser won't accept as part of an image name. */
const IMAGE_NAME_KEYWORDS = new Set([
  "as", "at", "behind", "call", "expression", "hide", "if", "in", "image", "init",
  "jump", "menu", "onlayer", "python", "return", "scene", "show", "with", "while",
  "zorder", "transform",
]);

/**
 * Turn free text (a character or pose name) into one Ren'Py image-name
 * component: letters, digits and underscores, never a statement keyword.
 * `"Dr. O'Brien"` → `"Dr_O_Brien"`. Returns `""` if nothing usable is left.
 */
export function imageNameComponent(text: string): string {
  const cleaned = text
    .trim()
    .replace(/[^0-9A-Za-z_\u00c0-\ud7ff\ue000-\uffef]/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return IMAGE_NAME_KEYWORDS.has(cleaned) ? `${cleaned}_` : cleaned;
}

/** Image tag for a character's sprites and side images (`show <tag> <pose>`). */
export function charImageTag(char: VNCharacter): string {
  return imageNameComponent(char.name ?? "") || `char_${imageNameComponent(char.id) || "unnamed"}`;
}

/** A position for `at`: the given transform name, or `center` if it isn't a valid name. */
function atPosition(side: string | undefined): string {
  return side && /^[A-Za-z_][A-Za-z0-9_]*$/.test(side) ? side : "center";
}

/**
 * Normalizes built-in transitions to lowercase so they don't crash Ren'Py.
 * e.g., "Fade" becomes "fade", preventing "with Fade" from emitting the class.
 */
function safeTrans(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "fade" || lower === "dissolve" || lower === "flash" || lower === "pixellate") return lower;
  return t;
}

/** What generated code calls each scene (its label) and character (its variable). */
export interface Names {
  label(sceneId: string): string;
  character(charId: string): string;
}

/** The generated names, `vns_scene_<id>` and `vnc_<id>`, which can't clash with a game's own. */
const GENERATED_NAMES: Names = {
  label: id => `vns_scene_${id}`,
  character: id => `vnc_${id}`,
};

const PY_KEYWORDS = new Set([
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass", "raise",
  "return", "try", "while", "with", "yield",
]);

/** The label and variable names an export gives scenes and characters, for showing in the editor. */
export function exportedNames(proj: VNProject): Names {
  return exportNames(proj, {});
}

/**
 * Whether a name from an imported game can be reused: a plain identifier that
 * isn't a Python keyword, isn't reserved by Ren'Py (a leading underscore) and
 * can't clash with generated names (`vns_…`, `vnc_…`, `vnv_…`).
 */
function isReusableName(name: string | undefined): name is string {
  return !!name && /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !PY_KEYWORDS.has(name) && !/^vn[a-z]_/.test(name);
}

/**
 * Names for scripts that replace an imported game's story (exports). Scenes and
 * characters keep the label and variable they had in that game, because Ren'Py
 * finds a line's translation by its label and speaker. Names already taken, by
 * another scene or character or by the scripts the export keeps, fall back to
 * generated ones, and only the start scene may be called `start`.
 */
function exportNames(proj: VNProject, opts: ExportOptions): Names {
  const startId = proj.start ?? proj.scenes[0]?.id;
  const labels = new Map<string, string>();
  const takenLabels = new Set(opts.labelsElsewhere);
  // The start scene goes first, so it can claim its name.
  const scenes = [...proj.scenes].sort((a, b) => Number(b.id === startId) - Number(a.id === startId));
  for (const sc of scenes) {
    const name = sc.renpy_label;
    if (isReusableName(name) && !takenLabels.has(name) && (name !== "start" || sc.id === startId)) {
      labels.set(sc.id, name);
      takenLabels.add(name);
    }
  }
  const chars = new Map<string, string>();
  const takenVars = new Set([...(opts.declaredElsewhere ?? []), ...extractVars(proj).map(v => v.name)]);
  for (const ch of proj.characters) {
    const name = ch.renpy_name;
    if (isReusableName(name) && !takenVars.has(name)) {
      chars.set(ch.id, name);
      takenVars.add(name);
    }
  }
  return {
    label: id => labels.get(id) ?? GENERATED_NAMES.label(id),
    character: id => chars.get(id) ?? GENERATED_NAMES.character(id),
  };
}

/**
 * Append an ATL (Animation and Transform Language) code block to `lines`,
 * indenting each non-empty line with `prefix`.
 *
 * ATL content is passed through verbatim — no syntax validation is performed.
 * Empty lines within the block are silently dropped.
 *
 * @param atl    - Raw multi-line ATL string from `ev.atl_code`.
 * @param lines  - Output line buffer to append to.
 * @param prefix - Indentation prefix (e.g. `"        "` for 8 spaces).
 */
function compileAtl(atl: string, lines: string[], prefix: string): void {
  for (const line of atl.split("\n")) {
    if (line.trim()) lines.push(`${prefix}${line}`);
  }
}

/** A background image filling the screen, for `scene expression`. */
function bgTransform(bg: string): string {
  return `Transform("${esc(bg)}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
}

/** The `scene` statement (and ATL block) for a bg event, without its transition. */
function bgScene(ev: VNEvent): string[] {
  if (!ev.bg) return [];
  const head = `scene expression ${bgTransform(ev.bg)}`;
  if (!ev.atl_code) return [head];
  const block: string[] = [];
  compileAtl(ev.atl_code, block, "    ");
  return [`${head}:`, ...block];
}

/** The `show` statement (and ATL block) for an image event, without its transition. */
function imageShow(ev: VNEvent): string[] {
  const img = esc(ev.image ?? "");
  if (!img) return [];
  const side = ev.side ?? "center";
  if (ev.atl_code) {
    const block: string[] = [];
    compileAtl(ev.atl_code, block, "    ");
    return [`show expression "${img}" at ${atPosition(side)}:`, ...block];
  }
  const at = ["left", "center", "right"].includes(side) ? ` at ${side}` : "";
  return [`show expression "${img}"${at}`];
}

/** The `show <character> <pose>` a dialogue line starts with, or null if its speaker has no sprite. */
function speakerShow(ev: VNEvent, proj: VNProject): string | null {
  const char = findChar(proj, ev.char_id);
  const sprite = char ? characterSprite(char, ev.pose) : null;
  const poseAttr = sprite ? imageNameComponent(sprite.pose) : "";
  return char && poseAttr ? `show ${charImageTag(char)} ${poseAttr} at ${atPosition(ev.side)}` : null;
}

/** An animation keyframe's properties as ATL (`xalign 0.5 zoom 1.2 …`). */
function keyframeProps(p: VNKeyframe["props"]): string {
  const props = [];
  if (p.xalign !== undefined) props.push(`xalign ${p.xalign}`);
  if (p.yalign !== undefined) props.push(`yalign ${p.yalign}`);
  if (p.xpos !== undefined) props.push(`xpos ${p.xpos}`);
  if (p.ypos !== undefined) props.push(`ypos ${p.ypos}`);
  if (p.xanchor !== undefined) props.push(`xanchor ${p.xanchor}`);
  if (p.yanchor !== undefined) props.push(`yanchor ${p.yanchor}`);
  if (p.zoom !== undefined) props.push(`zoom ${p.zoom}`);
  if (p.xzoom !== undefined) props.push(`xzoom ${p.xzoom}`);
  if (p.yzoom !== undefined) props.push(`yzoom ${p.yzoom}`);
  if (p.rotate !== undefined) props.push(`rotate ${p.rotate}`);
  if (p.alpha !== undefined) props.push(`alpha ${p.alpha}`);
  if (p.additive !== undefined) props.push(`additive ${p.additive}`);
  if (p.blur !== undefined) props.push(`blur ${p.blur}`);

  // Crop
  if (p.cropX !== undefined || p.cropY !== undefined || p.cropW !== undefined || p.cropH !== undefined) {
    props.push(`crop (${p.cropX ?? 0}, ${p.cropY ?? 0}, ${p.cropW ?? 1920}, ${p.cropH ?? 1080})`);
  }

  // MatrixColor
  if (p.hue !== undefined || p.contrast !== undefined || p.saturate !== undefined || p.bright !== undefined || p.invert !== undefined) {
    const matrices = [];
    if (p.invert !== undefined && p.invert !== 0) matrices.push(`InvertMatrix(${p.invert})`);
    if (p.contrast !== undefined && p.contrast !== 1.0) matrices.push(`ContrastMatrix(${p.contrast})`);
    if (p.saturate !== undefined && p.saturate !== 1.0) matrices.push(`SaturationMatrix(${p.saturate})`);
    if (p.bright !== undefined && p.bright !== 0) matrices.push(`BrightnessMatrix(${p.bright})`);
    if (p.hue !== undefined && p.hue !== 0) matrices.push(`HueMatrix(${p.hue})`);

    if (matrices.length > 0) {
      props.push(`matrixcolor ${matrices.join(" * ")}`);
    }
  }

  return props.join(" ");
}

/** The camera statement for a camera event: easing to its position, or already there. */
function cameraLines(ev: VNEvent, animate: boolean): string[] {
  const x = ev.camera_x ?? 0;
  const y = ev.camera_y ?? 0;
  const z = ev.camera_z ?? 0;
  const zoom = ev.camera_zoom ?? 1.0;
  const pitch = ev.camera_pitch ?? 0;
  const yaw = ev.camera_yaw ?? 0;
  const roll = ev.camera_roll ?? 0;
  const dur = ev.camera_dur ?? 1.0;

  // Pitch/yaw/roll rotate the camera around the x/y/z axes (Ren'Py 8 3D stage).
  const rotation = [
    pitch ? ` xrotate ${pitch}` : "",
    yaw ? ` yrotate ${yaw}` : "",
    roll ? ` zrotate ${roll}` : "",
  ].join("");

  const move = `xpos ${x} ypos ${y} zpos ${z} zoom ${zoom}${rotation}`;
  return [`camera:`, `    perspective True`, animate ? `    ease ${dur} ${move}` : `    ${move}`];
}

/** `play music` for a music event with a track. */
function musicPlay(ev: VNEvent): string {
  const parts = [`play music "${esc(ev.music ?? "")}"`];
  if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
  if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
  if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
  if (ev.loop === false) parts.push(`noloop`); // 'loop' is default for music, so we use 'noloop' if false
  else if (ev.loop === true) parts.push(`loop`);
  return parts.join(" ");
}

/** `play sound` for an sfx event with a file. */
function soundPlay(ev: VNEvent): string {
  const parts = [`play sound "${esc(ev.sfx ?? "")}"`];
  if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
  if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
  if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
  if (ev.loop === true) parts.push(`loop`); // 'noloop' is default for sound
  return parts.join(" ");
}

// ─── Per-event code generator ─────────────────────────────────────────────────
// Mirrors _vn_compile_events() in vn_compile.rpy

/**
 * Compile a single {@link VNEvent} into one or more lines of Ren'Py script
 * and push them onto `lines`.
 *
 * Events with an empty `type` string are silently skipped.
 * If `ev.duration` is set and non-zero on any non-`wait` event, an extra
 * `pause <duration>` line is appended after the event body.
 *
 * @param ev     - The event to compile.
 * @param proj   - The parent project (used to resolve character/scene lookups).
 * @param lines  - Output line buffer.
 * @param prefix - Indentation string prepended to every emitted line.
 * @param names  - Labels and character variables to use.
 */
function compileEvent(
  ev: VNEvent,
  proj: VNProject,
  lines: string[],
  prefix: string,
  names: Names,
): void {
  const t = ev.type;
  if (!t) return;

  // ── Background ──────────────────────────────────────────────────────────────
  if (t === "bg") {
    const scene = bgScene(ev);
    if (!scene.length) return;
    for (const line of scene) lines.push(`${prefix}${line}`);
    if (ev.transition) {
      lines.push(`${prefix}with ${safeTrans(ev.transition)}`);
    }
  }

  // ── Sprite / image ──────────────────────────────────────────────────────────
  else if (t === "image") {
    const show = imageShow(ev);
    if (!show.length) return;
    for (const line of show) lines.push(`${prefix}${line}`);
    if (ev.transition) {
      lines.push(`${prefix}with ${safeTrans(ev.transition)}`);
    }
  }

  // ── Animation (ActionEditor style) ──────────────────────────────────────────
  else if (t === "animation") {
    const img = esc(ev.image ?? "");
    if (!img) return;
    
    const kfs = ev.animation_keyframes;
    if (!kfs || !kfs.length) {
      lines.push(`${prefix}show expression "${img}"`);
      return;
    }
    
    lines.push(`${prefix}show expression "${img}":`);

    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      const propStr = keyframeProps(kf.props);
      if (i === 0) {
        lines.push(`${prefix}    ${propStr || "pass"}`);
      } else {
        const dur = kf.duration ?? 1.0;
        const ease = kf.easing && kf.easing !== "none" ? kf.easing : "linear";
        lines.push(`${prefix}    ${ease} ${dur} ${propStr || "pass"}`);
      }
    }
  }

  // ── Music ───────────────────────────────────────────────────────────────────
  else if (t === "music") {
    if (ev.music) {
      lines.push(`${prefix}${musicPlay(ev)}`);
    } else {
      // Stopping music
      const fo = ev.fadeout ? ` fadeout ${ev.fadeout}` : ` fadeout 0.5`;
      lines.push(`${prefix}stop music${fo}`);
    }
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  else if (t === "sfx") {
    if (ev.sfx) {
      lines.push(`${prefix}${soundPlay(ev)}`);
    }
  }

  // ── Dialogue ────────────────────────────────────────────────────────────────
  else if (t === "dialogue") {
    const char = findChar(proj, ev.char_id);
    const cRef = char ? names.character(char.id) : "narrator";

    // Show character sprite if available
    const show = speakerShow(ev, proj);
    if (show) lines.push(`${prefix}${show}`);

    if (ev.voice) {
      lines.push(`${prefix}voice "${esc(ev.voice)}"`);
    }

    lines.push(`${prefix}${cRef} "${esc(ev.text ?? "")}"`);
  }

  // ── Narration ───────────────────────────────────────────────────────────────
  else if (t === "narration") {
    if (ev.voice) {
      lines.push(`${prefix}voice "${esc(ev.voice)}"`);
    }
    lines.push(`${prefix}"${esc(ev.text ?? "")}"`);
  }

  // ── Choice / menu ───────────────────────────────────────────────────────────
  else if (t === "choice") {
    const opts = ev.opts ?? [];
    const prompt = esc(ev.prompt ?? "");
    const speaker = ev.char_id && findChar(proj, ev.char_id) ? `${names.character(ev.char_id)} ` : "";
    if (!opts.length) {
      if (prompt) lines.push(`${prefix}${speaker}"${prompt}"`);
      return;
    }
    lines.push(`${prefix}menu:`);
    if (prompt) lines.push(`${prefix}    ${speaker}"${prompt}"`);
    for (const opt of opts) {
      // Optional per-option condition  →  "Label" if condition:
      const cond = opt.condition?.trim();
      const condStr = cond ? ` if ${cond}` : "";
      lines.push(`${prefix}    "${esc(opt.text)}"${condStr}:`);
      const targetScene = findScene(proj, opt.scene);
      if (targetScene) {
        lines.push(`${prefix}        jump ${names.label(targetScene.id)}`);
      } else {
        lines.push(`${prefix}        pass`);
      }
    }
  }

  // ── Jump ────────────────────────────────────────────────────────────────────
  else if (t === "jump") {
    const target = ev.scene_id;
    const trans = ev.transition ? safeTrans(ev.transition) : "dissolve";
    if (target) {
      if (trans && trans !== "none") lines.push(`${prefix}with ${trans}`);
      lines.push(`${prefix}jump ${names.label(target)}`);
    }
  }

  // ── Wait ────────────────────────────────────────────────────────────────────
  else if (t === "wait") {
    lines.push(`${prefix}pause ${ev.dur ?? 1.0}`);
  }

  // ── Effect / transition ─────────────────────────────────────────────────────
  else if (t === "effect") {
    // Optional narration text before the transition
    const txt = (ev.text ?? "").trim();
    if (txt) lines.push(`${prefix}"${esc(txt)}"`);

    const kind = ev.kind ? safeTrans(ev.kind) : "dissolve";
    const dur = ev.dur ?? 0.5;
    switch (kind) {
      case "dissolve": lines.push(`${prefix}with Dissolve(${dur})`); break;
      case "fade":     lines.push(`${prefix}with Fade(${dur}, 0.0, ${dur})`); break;
      case "flash":    lines.push(`${prefix}with Fade(0.1, 0.0, ${dur}, color='#fff')`); break;
      case "pixellate": lines.push(`${prefix}with Pixellate(${dur}, 10)`); break;
      case "none":     break; // explicit no-transition
      default:         lines.push(`${prefix}with ${kind}`); break;
    }
  }

  // ── Set Variable ────────────────────────────────────────────────────────────
  else if (t === "setvar") {
    const name = ev.var_name?.trim() || "var";
    const val = ev.var_val ?? "False";
    lines.push(`${prefix}$ ${name} = ${val}`);
  }

  // ── If / Conditional Jump ───────────────────────────────────────────────────
  else if (t === "if") {
    const cond = ev.condition?.trim() || "True";
    lines.push(`${prefix}if ${cond}:`);
    if (ev.scene_true) {
      lines.push(`${prefix}    jump ${names.label(ev.scene_true)}`);
    } else {
      lines.push(`${prefix}    pass`);
    }
    if (ev.scene_false) {
      lines.push(`${prefix}else:`);
      lines.push(`${prefix}    jump ${names.label(ev.scene_false)}`);
    }
  }

  // ── Auto-advance pause ──────────────────────────────────────────────────────
  else if (t === "movie") {
    const m = esc(ev.movie ?? "");
    if (m) lines.push(`${prefix}$ renpy.movie_cutscene("${m}")`);
  }

  // ── Camera (3D Stage) ───────────────────────────────────────────────────────
  else if (t === "camera") {
    for (const line of cameraLines(ev, true)) lines.push(`${prefix}${line}`);
  }

  // ── Achievement grant ─────────────────────────────────────────────────────
  else if (t === "achievement") {
    const achId = (ev.achievement_id ?? "").trim();
    if (achId) {
      lines.push(`${prefix}$ achievement.grant("${esc(achId)}")`);
    }
  }

  // ── Random Branch ─────────────────────────────────────────────────────────
  else if (t === "random") {
    const rawIds = ev.random_scenes ?? [];
    const rawWeights = ev.random_weights;
    const pairs: Array<{ sc: ReturnType<typeof findScene>; w: number }> = rawIds
      .map((id, i) => ({ sc: findScene(proj, id), w: rawWeights?.[i] ?? 1 }))
      .filter(p => !!p.sc && p.w > 0);

    if (pairs.length > 0) {
      const isWeighted = pairs.some(p => p.w !== pairs[0].w);
      if (isWeighted) {
        // Expand into a weighted pool: each label repeated `weight` times
        const poolItems = pairs.flatMap(({ sc, w }) =>
          Array(w).fill(`"${names.label(sc!.id)}"`)
        ).join(", ");
        lines.push(`${prefix}$ _rnd = renpy.random.choice([${poolItems}])`);
      } else {
        const labelList = pairs.map(({ sc }) => `"${names.label(sc!.id)}"`).join(", ");
        lines.push(`${prefix}$ _rnd = renpy.random.choice([${labelList}])`);
      }
      lines.push(`${prefix}jump expression _rnd`);
    } else {
      lines.push(`${prefix}# random branch (no targets set)`);
    }
  }

  // ── Raw Code ────────────────────────────────────────────────────────────────
  else if (t === "raw") {
    const raw = ev.raw_code ?? "";
    if (raw.trim()) {
      for (const line of raw.split("\n")) {
        lines.push(`${prefix}${line}`);
      }
    }
  }

  // ── Auto-advance pause ──────────────────────────────────────────────────────
  if (t !== "wait" && t !== "camera" && t !== "raw") {
    const dur = parseFloat(String(ev.duration ?? 0));
    if (!isNaN(dur) && dur > 0) lines.push(`${prefix}pause ${dur}`);
  }
}

// ─── Character definitions ────────────────────────────────────────────────────

/**
 * Append a `define <variable> = Character(...)` line for every character, plus the
 * side images and the pose images that dialogue events `show`.
 *
 * Strings go through {@link pyStr} (so names like O'Brien stay valid Python) and
 * image names through {@link charImageTag} / {@link imageNameComponent}.
 */
function compileCharacters(proj: VNProject, lines: string[], names: Names): void {
  if (!proj.characters.length) return;
  lines.push(`## Characters`);
  for (const char of proj.characters) {
    const tag = charImageTag(char);
    const sideImages = Object.entries(char.side_images ?? {}).filter(([, img]) => img);

    const args: string[] = [pyStr(char.display ?? "")];
    if (char.color && HEX_COLOR.test(char.color)) args.push(`color=${pyStr(char.color)}`);
    if (char.name_prefix)     args.push(`who_prefix=${pyStr(char.name_prefix)}`);
    if (char.name_suffix)     args.push(`who_suffix=${pyStr(char.name_suffix)}`);
    if (char.dialogue_prefix) args.push(`what_prefix=${pyStr(char.dialogue_prefix)}`);
    if (char.dialogue_suffix) args.push(`what_suffix=${pyStr(char.dialogue_suffix)}`);
    if (sideImages.length > 0) args.push(`image=${pyStr(tag)}`);
    lines.push(`define ${names.character(char.id)} = Character(${args.join(', ')})`);

    for (const [pose, imgPath] of sideImages) {
      const attr = imageNameComponent(pose);
      const poseSuffix = pose === 'neutral' || !attr ? '' : ` ${attr}`;
      lines.push(`image side ${tag}${poseSuffix} = "${esc(imgPath)}"`);
    }

    for (const pose of char.poses ?? []) {
      const attr = imageNameComponent(pose);
      if (!attr) continue;
      if (char.is_layered && char.layered_sprites && char.layer_order) {
        const poseLayers = char.layered_sprites[pose] || {};
        const activeLayers = char.layer_order.map(l => poseLayers[l]).filter(Boolean);
        if (activeLayers.length === 1) {
          lines.push(`image ${tag} ${attr} = "${esc(activeLayers[0])}"`);
        } else if (activeLayers.length > 1) {
          lines.push(`image ${tag} ${attr} = Fixed(`);
          for (const file of activeLayers) {
            lines.push(`    "${esc(file)}",`);
          }
          lines.push(`    fit_first=True`);
          lines.push(`)`);
        }
      } else if (char.sprites?.[pose]) {
        lines.push(`image ${tag} ${attr} = "${esc(char.sprites[pose])}"`);
      }
    }
  }
  lines.push(``);
}

// ─── Scene compiler ───────────────────────────────────────────────────────────

/**
 * Compile one {@link VNScene} into a Ren'Py `label` block, named by `names`.
 *
 * - If the scene has a `bg`, emits a `scene expression Transform(...)` at the
 *   top of the label body.
 * - If the scene has `music`, emits `play music` immediately after the BG.
 * - An empty event list emits a bare `pass` to keep the label valid.
 * - Always ends with `return` so Ren'Py can fall through correctly.
 *
 * @param sc    - Scene to compile.
 * @param proj  - Parent project.
 * @param lines - Output line buffer.
 * @param names - Labels and character variables to use.
 */
function compileScene(sc: VNScene, proj: VNProject, lines: string[], names: Names): void {
  lines.push(`label ${names.label(sc.id)}:`);

  // Scene-level background
  if (sc.bg) {
    const fill = `Transform("${esc(sc.bg)}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
    lines.push(`    scene expression ${fill}`);
  }
  // Scene-level music
  if (sc.music) {
    lines.push(`    play music "${esc(sc.music)}"`);
  }

  if (!sc.events.length) {
    lines.push(`    pass`);
  } else {
    for (const ev of sc.events) {
      if (!ev.type) continue; // skip empty slots
      compileEvent(ev, proj, lines, "    ", names);
    }
  }

  lines.push(`    return`);
  lines.push(``);
}

// ─── Story variables ──────────────────────────────────────────────────────────

/** Options for scripts that will sit next to other `.rpy` files in a game folder. */
export interface DefaultsOptions {
  /**
   * Variables the game's other scripts already declare with `default` or
   * `define` (see `declaredVarNames`). No `default` is emitted for these:
   * Ren'Py refuses to start if a variable gets a `default` twice.
   */
  declaredElsewhere?: ReadonlySet<string>;
}

/** Append a `default` line for each auto-discovered story variable. */
function compileDefaults(proj: VNProject, lines: string[], opts: DefaultsOptions = {}): void {
  const vars = extractVars(proj).filter(v => !opts.declaredElsewhere?.has(v.name));
  if (!vars.length) return;
  lines.push(`## Story Variables (auto-discovered)`);
  for (const v of vars) lines.push(`default ${v.name} = ${v.default_val}`);
  lines.push(``);
}

// ─── Main compiler ────────────────────────────────────────────────────────────

/** Options for scripts that replace an imported game's story (exports). */
export interface ExportOptions extends DefaultsOptions {
  /**
   * Labels the game's other scripts define (see `declaredLabelNames`). Scenes
   * don't reuse them: Ren'Py refuses to start if a label is defined twice.
   */
  labelsElsewhere?: ReadonlySet<string>;
}

/** Options that control how the top-level `compileProject` entry point is emitted. */
export interface CompileOptions extends ExportOptions {
  /**
   * When `true`, emits `label start:` as the Ren'Py entry point, which is
   * the convention for a standalone game. When `false` (default), a
   * project-scoped label like `label vns_<projectId>_start:` is used instead,
   * so multiple projects can coexist in the same Ren'Py game folder.
   */
  asExport?: boolean;
}

/**
 * Compile an entire {@link VNProject} into a single Ren'Py `.rpy` script string.
 *
 * The output is deterministic for a given project state and is safe to write
 * directly to disk. Use `opts.asExport = true` when generating a file for
 * a standalone Ren'Py distribution.
 *
 * @param proj - The project to compile.
 * @param opts - Optional compilation flags.
 * @returns A multi-line string containing valid Ren'Py script.
 *
 * @example
 * ```ts
 * const script = compileProject(myProject, { asExport: true });
 * await writeTextFile("game/script.rpy", script);
 * ```
 */
export function compileProject(proj: VNProject, opts: CompileOptions = {}): string {
  const lines: string[] = [
    `## ═══════════════════════════════════════════════`,
    `## AUTO-GENERATED SCRIPT: ${proj.title}`,
    `## AUTHOR: ${proj.author}`,
    `## Generated by VNVMaker`,
    `## ═══════════════════════════════════════════════`,
    ``,
  ];

  // ── Resolution ──────────────────────────────────────────────────────────────
  const [rw, rh] = proj.resolution;
  lines.push(`## Resolution`);
  lines.push(`init python:`);
  lines.push(`    config.screen_width  = ${rw}`);
  lines.push(`    config.screen_height = ${rh}`);
  lines.push(``);

  // ── Auto-discovered story variables ─────────────────────────────────────────
  compileDefaults(proj, lines, opts);

  // ── Achievements ────────────────────────────────────────────────────────────
  if (proj.achievements && proj.achievements.length) {
    lines.push(`## Achievements`);
    lines.push(`init python:`);
    for (const ach of proj.achievements) {
      lines.push(`    achievement.register("${esc(ach.name)}")`);
    }
    lines.push(``);
  }

  // An export replaces the game's story, so it can keep an imported game's names.
  const names = opts.asExport ? exportNames(proj, opts) : GENERATED_NAMES;

  // ── Character definitions ────────────────────────────────────────────────────────
  compileCharacters(proj, lines, names);

  // ── Scene labels ────────────────────────────────────────────────────────────
  lines.push(`## Scenes`);
  for (const sc of proj.scenes) {
    compileScene(sc, proj, lines, names);
  }

  // ── Entry point ─────────────────────────────────────────────────────────────
  const startScene = proj.start
    ? proj.scenes.find(s => s.id === proj.start)
    : proj.scenes[0];

  // (An imported start scene can be `label start:` itself.)
  if (startScene && names.label(startScene.id) !== "start") {
    lines.push(`## Entry Point`);
    if (opts.asExport) {
      lines.push(`label start:`);
    } else {
      const safeId = proj.id.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`label vns_${safeId}_start:`);
    }
    lines.push(`    jump ${names.label(startScene.id)}`);
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Compile an entire {@link VNProject} into an array of separate Ren'Py `.rpy` files.
 * 
 * - `script.rpy`: Contains the banner, `init python:` blocks, variable defaults,
 *   character definitions, achievements, and the `label start:` entry point.
 * - `scene_<id>.rpy`: A separate file for each scene in the graph.
 *
 * @param proj - The project to compile.
 * @param opts - Pass `declaredElsewhere` when other scripts stay next to these.
 * @returns Array of file objects with filename and string content.
 */
export function compileProjectToFiles(proj: VNProject, opts: ExportOptions = {}): { filename: string, content: string }[] {
  const files: { filename: string, content: string }[] = [];
  const names = exportNames(proj, opts);
  const scriptLines: string[] = [
    `## ═══════════════════════════════════════════════`,
    `## AUTO-GENERATED SCRIPT: ${proj.title}`,
    `## AUTHOR: ${proj.author}`,
    `## Generated by VNVMaker`,
    `## ═══════════════════════════════════════════════`,
    ``,
  ];

  // ── Resolution ──────────────────────────────────────────────────────────────
  const [rw, rh] = proj.resolution;
  scriptLines.push(`## Resolution`);
  scriptLines.push(`init python:`);
  scriptLines.push(`    config.screen_width  = ${rw}`);
  scriptLines.push(`    config.screen_height = ${rh}`);
  scriptLines.push(``);

  // ── Auto-discovered story variables ─────────────────────────────────────────
  compileDefaults(proj, scriptLines, opts);

  // ── Achievements ────────────────────────────────────────────────────────────
  if (proj.achievements && proj.achievements.length) {
    scriptLines.push(`## Achievements`);
    scriptLines.push(`init python:`);
    for (const ach of proj.achievements) {
      scriptLines.push(`    achievement.register("${esc(ach.name)}")`);
    }
    scriptLines.push(``);
  }

  // ── Character definitions ────────────────────────────────────────────────────────
  compileCharacters(proj, scriptLines, names);

  // ── Entry point ─────────────────────────────────────────────────────────────
  const startScene = proj.start
    ? proj.scenes.find(s => s.id === proj.start)
    : proj.scenes[0];

  // A standalone game starts at `label start:`, which an imported start scene can be itself.
  if (startScene && names.label(startScene.id) !== "start") {
    scriptLines.push(`## Entry Point`);
    scriptLines.push(`label start:`);
    scriptLines.push(`    jump ${names.label(startScene.id)}`);
    scriptLines.push(``);
  }

  files.push({ filename: "script.rpy", content: scriptLines.join("\n") });

  // ── Scenes ──────────────────────────────────────────────────────────────────
  for (const sc of proj.scenes) {
    const sceneLines: string[] = [
      `## ═══════════════════════════════════════════════`,
      `## Scene: ${sc.label || sc.id}`,
      `## ═══════════════════════════════════════════════`,
      ``,
    ];
    compileScene(sc, proj, sceneLines, names);
    files.push({ filename: `scene_${sc.id}.rpy`, content: sceneLines.join("\n") });
  }

  return files;
}

// ─── Route replay ─────────────────────────────────────────────────────────────

/** A statement the replay may run, and what it changes. */
interface ReplayStatement {
  lines: string[];
  /**
   * `display`: the images on the master layer. `audio:<channel>`: what that
   * channel plays. `camera`, `var` (a variable) or `keep` (screens and other
   * layers, which a `scene` statement doesn't clear).
   */
  target: string;
  /** A `scene` statement, which removes the images shown before it. */
  clears?: boolean;
  /** An audio statement: starts something still playing, queues a track, or leaves the channel silent. */
  audio?: "play" | "queue" | "silent";
}

/** `$ name = value`, `$ name += value`, `$ obj.attr[key] = value`… but not `$ name == value` or a call. */
const RAW_ASSIGNMENT = /^\$\s*[A-Za-z_][\w.]*(\[[^\]]*\])?\s*(\*\*|\/\/|<<|>>|[-+*/%&|^])?=(?!=)/;

/** A transition at the end of a scene/show/hide line, which would play while the replay runs. */
const WITH_CLAUSE = /\s+with\s+[A-Za-z_][\w.]*(\([^()"']*\))?(?=\s*:?\s*$)/;

/** Raw code's top-level statements, each with the lines of its block. */
function rawStatements(code: string): string[][] {
  const lines = code.split("\n").filter(l => l.trim());
  const indentOf = (l: string) => l.length - l.trimStart().length;
  const base = Math.min(...lines.map(indentOf));
  const statements: string[][] = [];
  for (const line of lines) {
    if (indentOf(line) === base) statements.push([line.slice(base)]);
    else statements[statements.length - 1]?.push(line.slice(base));
  }
  return statements;
}

/**
 * What raw code changes, statement by statement: images, audio, the camera and
 * assignments at its top level. Dialogue, menus, jumps, pauses and code inside
 * `if` or `python` blocks are left out.
 */
function rawReplay(code: string): ReplayStatement[] {
  return rawStatements(code).flatMap((block): ReplayStatement[] => {
    const [head, ...rest] = block;
    const words = head.trim().split(/\s+/);
    const keyword = words[0].replace(/:$/, "");
    if (keyword === "$") {
      return RAW_ASSIGNMENT.test(head.trim()) ? [{ target: "var", lines: block }] : [];
    }
    if (keyword === "scene" || keyword === "show" || keyword === "hide") {
      if (words[1] === "screen" || words.includes("onlayer")) return [{ target: "keep", lines: block }];
      return [{ target: "display", clears: keyword === "scene", lines: [head.replace(WITH_CLAUSE, ""), ...rest] }];
    }
    if ((keyword === "play" || keyword === "queue" || keyword === "stop") && words[1]) {
      const target = `audio:${words[1]}`;
      if (keyword === "stop") return [{ target, audio: "silent", lines: [] }];
      if (keyword === "queue") return [{ target, audio: "queue", lines: block }];
      const lasts = words[1] === "music" || /\bloop\b/.test(head);
      return [{ target, audio: lasts ? "play" : "silent", lines: block }];
    }
    if (keyword === "camera") return [{ target: "camera", lines: block }];
    return [];
  });
}

/** What one replayed step changes, as statements that run without waiting. */
function replayStatements(step: ReplayStep, proj: VNProject): ReplayStatement[] {
  if (step.kind === "enter") {
    // What compileScene puts at the top of the label.
    const { bg, music } = step.scene;
    const out: ReplayStatement[] = [];
    if (bg) out.push({ target: "display", clears: true, lines: [`scene expression ${bgTransform(bg)}`] });
    if (music) out.push({ target: "audio:music", audio: "play", lines: [`play music "${esc(music)}"`] });
    return out;
  }
  const ev = step.event;
  switch (ev.type) {
    case "bg": {
      const scene = bgScene(ev);
      return scene.length ? [{ target: "display", clears: true, lines: scene }] : [];
    }
    case "image": {
      const show = imageShow(ev);
      return show.length ? [{ target: "display", lines: show }] : [];
    }
    case "animation": {
      // Where the animation ends up, rather than playing it again.
      const img = esc(ev.image ?? "");
      if (!img) return [];
      const kfs = ev.animation_keyframes ?? [];
      if (!kfs.length) return [{ target: "display", lines: [`show expression "${img}"`] }];
      const end = Object.assign({}, ...kfs.map(kf => kf.props));
      return [{ target: "display", lines: [`show expression "${img}":`, `    ${keyframeProps(end) || "pass"}`] }];
    }
    case "dialogue": {
      const show = speakerShow(ev, proj);
      return show ? [{ target: "display", lines: [show] }] : [];
    }
    case "music":
      return [ev.music
        ? { target: "audio:music", audio: "play", lines: [musicPlay(ev)] }
        : { target: "audio:music", audio: "silent", lines: [] }];
    case "sfx":
      // Only a looping sound is still playing later on.
      return ev.sfx ? [{ target: "audio:sound", audio: ev.loop === true ? "play" : "silent", lines: [soundPlay(ev)] }] : [];
    case "setvar":
      return [{ target: "var", lines: [`$ ${ev.var_name?.trim() || "var"} = ${ev.var_val ?? "False"}`] }];
    case "camera":
      return [{ target: "camera", lines: cameraLines(ev, false) }];
    case "raw":
      return rawReplay(ev.raw_code ?? "");
    default:
      return [];
  }
}

/**
 * Statements that put the game where `steps` left it, in the order they ran:
 * every assignment, the background and images shown since the last `scene`,
 * the camera, and whatever each audio channel is still playing. Nothing in
 * them waits for the player or plays a transition, so they run instantly.
 */
function compileReplay(proj: VNProject, steps: ReplayStep[], prefix: string): string[] {
  const statements = steps.flatMap(step => replayStatements(step, proj));
  const lastIndex = (test: (s: ReplayStatement) => boolean) =>
    statements.reduce((last, s, i) => (test(s) ? i : last), -1);
  const lastScene = lastIndex(s => s.target === "display" && !!s.clears);
  const lastCamera = lastIndex(s => s.target === "camera");
  // Each channel plays from its last play or stop on.
  const channelStart = new Map<string, number>();
  statements.forEach((s, i) => { if (s.audio === "play" || s.audio === "silent") channelStart.set(s.target, i); });

  return statements
    .filter((s, i) => {
      if (s.target === "display") return i >= lastScene;
      if (s.target === "camera") return i === lastCamera;
      if (s.audio) return i >= (channelStart.get(s.target) ?? -1) && s.audio !== "silent";
      return true;
    })
    .flatMap(s => s.lines.map(line => `${prefix}${line}`));
}

// ─── Preview compiler ──────────────────────────────────────────────────────────

/** Options for {@link compilePreview}. */
export interface PreviewOptions extends DefaultsOptions {
  /** Start at this line (event id) of the target scene instead of its first. */
  startEventId?: string | null;
  /** Force the preview window to a size mode. */
  playMode?: 'windowed' | 'fullscreen';
}

/**
 * Compile a **live preview** script for a specific scene.
 *
 * The output is written to `game/vnv_preview.rpy` inside the project folder.
 * It contains all scene labels so cross-scene `call`/`jump` events resolve,
 * but sets `label start:` to jump directly to `targetSceneId` so Ren'Py
 * enters on exactly the scene you're editing.
 *
 * Before jumping there it replays the route that leads there (see
 * `replayTo`): the background, sprites, music, camera and variables a player
 * would have by then. Starting at a later line of the scene runs that scene's
 * earlier lines' changes too, then continues from a copy of its remaining lines.
 *
 * Unlike {@link compileProject} there is **no resolution `init python:` block**
 * because the project's existing `gui.rpy` / `options.rpy` already configure
 * screen dimensions — adding a second block would cause a redefinition error.
 *
 * @param proj          - The project to compile.
 * @param targetSceneId - Scene id to jump to on `label start:`.
 * @param opts          - `startEventId`, `playMode`, and `declaredElsewhere`:
 *                        variables the game's other scripts already declare
 *                        (the preview always sits next to them).
 * @returns Multi-line Ren'Py `.rpy` string.
 */
export function compilePreview(
  proj: VNProject,
  targetSceneId?: string,
  opts: PreviewOptions = {},
): string {
  const { playMode } = opts;
  if (!targetSceneId) {
    targetSceneId = proj.scenes[0]?.id ?? "start";
  }
  const targetScene = proj.scenes.find(s => s.id === targetSceneId);
  const lines: string[] = [
    `## ═══════════════════════════════════════════════`,
    `## VNV MAKER LIVE PREVIEW`,
    `## Scene: ${targetScene?.label ?? targetSceneId}`,
    `## Auto-generated by VNVMaker IDE — safe to delete`,
    `## ═══════════════════════════════════════════════`,
    ``,
  ];

  // The preview sits next to an imported game's own story, so it uses generated names.
  const names = GENERATED_NAMES;

  // Character definitions
  compileCharacters(proj, lines, names);

  // Auto-discovered story variables
  compileDefaults(proj, lines, opts);

  // All scene labels — same format as the full export so cross-scene jumps resolve
  lines.push(`## Scenes`);
  for (const sc of proj.scenes) {
    compileScene(sc, proj, lines, names);
  }

  if (playMode) {
    lines.push(`## Force ${playMode} for preview`);
    lines.push(`init python:`);
    lines.push(`    _preferences.fullscreen = ${playMode === 'fullscreen' ? 'True' : 'False'}`);
    lines.push(``);
  }

  if (targetSceneId === "main_menu") {
    lines.push(`## Preview Entry Point (Main Menu Mode)`);
    lines.push(`## We do not override splashscreen so the game starts normally at the main menu.`);
    lines.push(`## We override 'start' to ensure the 'Start' button launches the current VNV Maker graph.`);
    lines.push(`define config.label_overrides = {"start": "vnv_preview_entry"}`);
    lines.push(``);
    lines.push(`label vnv_preview_entry:`);
    if (proj.start) {
      lines.push(`    jump ${names.label(proj.start)}`);
    } else {
      lines.push(`    return`);
    }
    lines.push(``);
  } else {
    // Entry point — bypass the main menu completely by returning from it.
    // We override 'start' so Ren'Py jumps straight to the target scene on launch,
    // ensuring the game is properly initialized in a play context rather than a menu context.
    lines.push(`## Preview Entry Point`);
    lines.push(`## Bypasses the main menu so the game initializes properly into a play context.`);
    lines.push(`label main_menu:`);
    lines.push(`    return`);
    lines.push(``);
    lines.push(`define config.label_overrides = {"start": "vnv_preview_entry"}`);
    lines.push(``);
    lines.push(`label vnv_preview_entry:`);
    const startIdx = Math.max(0, targetScene?.events.findIndex(ev => ev.id === opts.startEventId) ?? 0);
    const sceneName = (sc: VNScene) => (sc.label || sc.id).replace(/\s+/g, " ");
    if (targetScene) {
      const replay = replayTo(proj, targetScene.id, startIdx);
      const setup = compileReplay(proj, replay.steps, "    ");
      if (setup.length) {
        lines.push(`    ## Set up as if played through ${[...replay.route, targetScene].map(sceneName).join(" → ")}`);
        lines.push(...setup);
      }
    }
    if (targetScene && startIdx > 0) {
      lines.push(`    jump vnv_preview_from`);
      lines.push(``);
      lines.push(`## ${sceneName(targetScene)}, from line ${startIdx + 1}`);
      lines.push(`label vnv_preview_from:`);
      for (const ev of targetScene.events.slice(startIdx)) {
        if (ev.type) compileEvent(ev, proj, lines, "    ", names);
      }
      lines.push(`    return`);
    } else {
      lines.push(`    jump ${names.label(targetSceneId)}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Compile a standalone preview script for a single Animation event.
 */
export function compileSingleAnimationPreview(
  proj: VNProject,
  ev: VNEvent,
  inheritedBg?: string
): string {
  const lines: string[] = [
    `## ═══════════════════════════════════════════════`,
    `## VNV MAKER ISOLATED ANIMATION PREVIEW`,
    `## ═══════════════════════════════════════════════`,
    ``,
    `init python:`,
    `    # Prevent config redefinition error if game already has it`,
    `    pass`,
    ``,
    `## Preview Entry Point`,
    `define config.label_overrides = {"splashscreen": "vnv_preview_entry", "start": "vnv_preview_entry"}`,
    ``,
    `label vnv_preview_entry:`,
  ];
  if (inheritedBg) {
    const fill = `Transform("${esc(inheritedBg)}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
    lines.push(`    scene expression ${fill}`);
  } else {
    lines.push(`    scene black`);
  }
  
  compileEvent({ ...ev, type: "animation" }, proj, lines, "    ", GENERATED_NAMES);
  lines.push(`    pause`);
  lines.push(`    return`);
  return lines.join("\n");
}

// ─── Quick stat counter ───────────────────────────────────────────────────────

/** Aggregated statistics for a compiled project, used by {@link StatsView}. */
export interface ProjectStats {
  scenes: number;
  events: number;
  dialogueLines: number;
  characters: number;
  choices: number;
  music: number;
}

/**
 * Count key authoring metrics for a project without compiling it.
 *
 * Iterates all scenes and events once; events with an empty `type` are skipped.
 *
 * @param proj - The project to analyse.
 * @returns A {@link ProjectStats} snapshot.
 */
export function getProjectStats(proj: VNProject): ProjectStats {
  let events = 0, dialogueLines = 0, choices = 0, music = 0;
  for (const sc of proj.scenes) {
    for (const ev of sc.events) {
      if (!ev.type) continue;
      events++;
      if (ev.type === "dialogue" || ev.type === "narration") dialogueLines++;
      if (ev.type === "choice") choices++;
      if (ev.type === "music") music++;
    }
  }
  return {
    scenes: proj.scenes.length,
    events,
    dialogueLines,
    characters: proj.characters.length,
    choices,
    music,
  };
}
