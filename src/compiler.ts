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

import type { VNProject, VNEvent, VNScene, VNCharacter } from "./types";
import { extractVars, findChar, findScene } from "./types";
import { routeTo, type RouteStep } from "./storyRoute";

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
 * {@link esc} for a file path, made relative to the game folder. Files picked in
 * the editor are stored relative to the project folder (`game/audio/door.ogg`),
 * but Ren'Py looks files up inside the game folder, so it would look for those
 * in `game/game/`. Paths already relative to the game folder are unchanged.
 */
function escFile(path: string): string {
  return esc(path.replace(/^game\//, ""));
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

// ─── Statements that change what's on screen or playing ───────────────────────
// Shared by compileEvent and the live preview, which replays them (see
// compileStorySoFar) to rebuild the screen when it starts partway through.

/** A background image scaled to fill the screen. */
function bgFill(bg: string): string {
  return `Transform("${escFile(bg)}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
}

/** The `scene` statement for a background event, with its ATL block. */
function bgLines(ev: VNEvent, prefix: string): string[] {
  const fill = bgFill(ev.bg ?? "");
  if (!ev.atl_code) return [`${prefix}scene expression ${fill}`];
  const lines = [`${prefix}scene expression ${fill}:`];
  compileAtl(ev.atl_code, lines, prefix + "    ");
  return lines;
}

/** The `show` statement for an image event, with its ATL block. */
function imageLines(ev: VNEvent, prefix: string): string[] {
  const img = escFile(ev.image ?? "");
  const side = ev.side ?? "center";
  if (!ev.atl_code) {
    const at = ["left", "center", "right"].includes(side) ? ` at ${side}` : "";
    return [`${prefix}show expression "${img}"${at}`];
  }
  const lines = [`${prefix}show expression "${img}" at ${atPosition(side)}:`];
  compileAtl(ev.atl_code, lines, prefix + "    ");
  return lines;
}

/** The `show` statement for an animation event: its image with the keyframes as ATL. */
function animationLines(ev: VNEvent, prefix: string): string[] {
  const img = escFile(ev.image ?? "");
  const kfs = ev.animation_keyframes;
  if (!kfs || !kfs.length) return [`${prefix}show expression "${img}"`];

  const lines = [`${prefix}show expression "${img}":`];
  for (let i = 0; i < kfs.length; i++) {
    const kf = kfs[i];
    const p = kf.props;
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

    const propStr = props.join(" ");
    if (i === 0) {
      lines.push(`${prefix}    ${propStr || "pass"}`);
    } else {
      const dur = kf.duration ?? 1.0;
      const ease = kf.easing && kf.easing !== "none" ? kf.easing : "linear";
      lines.push(`${prefix}    ${ease} ${dur} ${propStr || "pass"}`);
    }
  }
  return lines;
}

/** The `play music` statement for a music event, or `stop music` when it has no track. */
function musicStatement(ev: VNEvent): string {
  const m = escFile(ev.music ?? "");
  if (!m) return `stop music fadeout ${ev.fadeout || 0.5}`;
  const parts = [`play music "${m}"`];
  if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
  if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
  if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
  if (ev.loop === false) parts.push(`noloop`); // 'loop' is default for music, so we use 'noloop' if false
  else if (ev.loop === true) parts.push(`loop`);
  return parts.join(" ");
}

/** The `play music` statement for a scene's own music, which starts with the scene. */
function sceneMusicStatement(music: string): string {
  return `play music "${escFile(music)}"`;
}

/** The `play sound` statement for a sound effect event (which must have a file). */
function soundStatement(ev: VNEvent): string {
  const parts = [`play sound "${escFile(ev.sfx ?? "")}"`];
  if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
  if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
  if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
  if (ev.loop === true) parts.push(`loop`); // 'noloop' is default for sound
  return parts.join(" ");
}

/**
 * The `show` statement that puts a dialogue line's speaker on screen, and the
 * image tag it shows; null when the speaker has no sprite for the line's pose
 * (or a neutral one to fall back on).
 */
function dialogueSprite(ev: VNEvent, proj: VNProject): { tag: string; statement: string } | null {
  const char = findChar(proj, ev.char_id);
  if (!char) return null;
  let pose = ev.pose ?? "neutral";
  let hasSprite = false;

  if (char.is_layered) {
    if (char.layered_sprites && Object.keys(char.layered_sprites[pose] || {}).length > 0) {
      hasSprite = true;
    } else if (char.layered_sprites && Object.keys(char.layered_sprites["neutral"] || {}).length > 0) {
      pose = "neutral";
      hasSprite = true;
    }
  } else {
    if (char.sprites?.[pose]) {
      hasSprite = true;
    } else if (char.sprites?.["neutral"]) {
      pose = "neutral";
      hasSprite = true;
    }
  }

  const tag = charImageTag(char);
  const poseAttr = imageNameComponent(pose);
  return hasSprite && poseAttr ? { tag, statement: `show ${tag} ${poseAttr} at ${atPosition(ev.side)}` } : null;
}

/** The `$ name = value` statement for a set-variable event. */
function setvarStatement(ev: VNEvent): string {
  return `$ ${ev.var_name?.trim() || "var"} = ${ev.var_val ?? "False"}`;
}

/** The `camera` statement for a camera event: easing into place, or straight there. */
function cameraLines(ev: VNEvent, prefix: string, ease: boolean): string[] {
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

  return [
    `${prefix}camera:`,
    `${prefix}    perspective True`,
    `${prefix}    ${ease ? `ease ${dur} ` : ""}xpos ${x} ypos ${y} zpos ${z} zoom ${zoom}${rotation}`,
  ];
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
    if (!ev.bg) return;
    lines.push(...bgLines(ev, prefix));
    if (ev.transition) {
      lines.push(`${prefix}with ${safeTrans(ev.transition)}`);
    }
  }

  // ── Sprite / image ──────────────────────────────────────────────────────────
  else if (t === "image") {
    if (!ev.image) return;
    lines.push(...imageLines(ev, prefix));
    if (ev.transition) {
      lines.push(`${prefix}with ${safeTrans(ev.transition)}`);
    }
  }

  // ── Animation (ActionEditor style) ──────────────────────────────────────────
  else if (t === "animation") {
    if (!ev.image) return;
    lines.push(...animationLines(ev, prefix));
    if (!ev.animation_keyframes?.length) return; // (no auto-advance pause for a plain show)
  }

  // ── Music ───────────────────────────────────────────────────────────────────
  else if (t === "music") {
    lines.push(`${prefix}${musicStatement(ev)}`);
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  else if (t === "sfx") {
    if (ev.sfx) lines.push(`${prefix}${soundStatement(ev)}`);
  }

  // ── Dialogue ────────────────────────────────────────────────────────────────
  else if (t === "dialogue") {
    const char = findChar(proj, ev.char_id);
    const cRef = char ? names.character(char.id) : "narrator";

    // Show character sprite if available
    const sprite = dialogueSprite(ev, proj);
    if (sprite) lines.push(`${prefix}${sprite.statement}`);

    if (ev.voice) {
      lines.push(`${prefix}voice "${escFile(ev.voice)}"`);
    }

    lines.push(`${prefix}${cRef} "${esc(ev.text ?? "")}"`);
  }

  // ── Narration ───────────────────────────────────────────────────────────────
  else if (t === "narration") {
    if (ev.voice) {
      lines.push(`${prefix}voice "${escFile(ev.voice)}"`);
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
    lines.push(`${prefix}${setvarStatement(ev)}`);
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
    const m = escFile(ev.movie ?? "");
    if (m) lines.push(`${prefix}$ renpy.movie_cutscene("${m}")`);
  }

  // ── Camera (3D Stage) ───────────────────────────────────────────────────────
  else if (t === "camera") {
    lines.push(...cameraLines(ev, prefix, true));
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
      lines.push(`image side ${tag}${poseSuffix} = "${escFile(imgPath)}"`);
    }

    for (const pose of char.poses ?? []) {
      const attr = imageNameComponent(pose);
      if (!attr) continue;
      if (char.is_layered && char.layered_sprites && char.layer_order) {
        const poseLayers = char.layered_sprites[pose] || {};
        const activeLayers = char.layer_order.map(l => poseLayers[l]).filter(Boolean);
        if (activeLayers.length === 1) {
          lines.push(`image ${tag} ${attr} = "${escFile(activeLayers[0])}"`);
        } else if (activeLayers.length > 1) {
          lines.push(`image ${tag} ${attr} = Fixed(`);
          for (const file of activeLayers) {
            lines.push(`    "${escFile(file)}",`);
          }
          lines.push(`    fit_first=True`);
          lines.push(`)`);
        }
      } else if (char.sprites?.[pose]) {
        lines.push(`image ${tag} ${attr} = "${escFile(char.sprites[pose])}"`);
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
    lines.push(`    scene expression ${bgFill(sc.bg)}`);
  }
  // Scene-level music
  if (sc.music) {
    lines.push(`    ${sceneMusicStatement(sc.music)}`);
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

// ─── Preview compiler ──────────────────────────────────────────────────────────

/** Top-level statements of raw code that only show or hide things. */
const DISPLAY_STATEMENT = /^(scene|show|hide|camera)\b/;

/** A trailing `with` clause naming a transition, such as `with dissolve` or `with Dissolve(0.5)`. */
const WITH_CLAUSE = /\s+with\s+[A-Za-z_][\w.]*(\([^"'()]*\))?\s*$/;

/**
 * A Python line that only sets a variable to a value it computes without
 * calling anything, such as `$ points += 1` or `$ route = "eileen"`.
 */
const SIMPLE_ASSIGNMENT = /^\$\s*[A-Za-z_][\w.]*(\[[^\]()]*\])?\s*(\+|-|\*|\/\/|\/|%)?=(?!=)[^()]*$/;

/**
 * Raw code as the live preview replays it: code whose top-level statements all
 * show or hide something (`scene`, `show`, `hide`, `camera`, with their ATL
 * blocks, without transitions), or all set variables (see SIMPLE_ASSIGNMENT).
 * Other code could do more than that (ask for input, pause, grant an
 * achievement), so it isn't replayed.
 */
function replayableRaw(code: string): { display: boolean; lines: string[] } | null {
  const lines = code.split("\n").filter(l => l.trim() && !l.trim().startsWith("#"));
  if (!lines.length) return null;
  const indent = Math.min(...lines.map(l => l.length - l.trimStart().length));
  const top = lines.map(l => l.slice(indent));
  if (top.every(l => SIMPLE_ASSIGNMENT.test(l))) return { display: false, lines: top };
  const kept: string[] = [];
  for (const line of top) {
    if (/^\s/.test(line)) kept.push(line);           // inside the statement's ATL block
    else if (/^with\b/.test(line)) continue;          // a transition
    else if (DISPLAY_STATEMENT.test(line)) kept.push(line.endsWith(":") ? line : line.replace(WITH_CLAUSE, ""));
    else return null;
  }
  return kept.length ? { display: true, lines: kept } : null;
}

/**
 * The statements that bring a player's game to where it is when the story
 * reaches the last scene on `route`: the variables the scenes before it set,
 * what they leave on screen, the camera and the music. Like Ren'Py's warp, it
 * replays only statements that leave something behind, without dialogue,
 * pauses or transitions, and follows each scene only as far as the event that
 * leads on. Raw code counts only when it just shows things or sets variables
 * (see replayableRaw). Statements are unindented; ATL blocks are indented by 4.
 */
function compileStorySoFar(route: RouteStep[], proj: VNProject): string[] {
  // Variable changes and what's put on screen, as statements in story order,
  // for Ren'Py to apply as it would in a playthrough. A character's sprite
  // shows carry the image tag they show, so a later line by that character
  // replaces its earlier show (they always give a position, so nothing else of
  // it carries over). Other display statements may show or hide that tag too,
  // so no show moves past one; variable changes don't touch the screen.
  const story: { tag?: string; lines: string[] }[] = [];
  let settled = 0;
  const add = (lines: string[]) => {
    story.push({ lines });
    settled = story.length;
  };
  const setVars = (lines: string[]) => story.push({ lines });
  const showSprite = (tag: string, lines: string[]) => {
    const i = story.findIndex((e, idx) => idx >= settled && e.tag === tag);
    if (i >= 0) story[i] = { tag, lines };
    else story.push({ tag, lines });
  };
  let camera: string[] = [];
  let music: string | null = null;
  let sound: string | null = null;

  for (const { scene: sc, exit } of route.slice(0, -1)) {
    if (sc.bg) add([`scene expression ${bgFill(sc.bg)}`]);
    if (sc.music) music = sceneMusicStatement(sc.music);
    for (const ev of sc.events.slice(0, exit)) {
      switch (ev.type) {
        case "bg":
          if (ev.bg) add(bgLines(ev, ""));
          break;
        case "image":
          if (ev.image) add(imageLines(ev, ""));
          break;
        case "animation":
          if (ev.image) add(animationLines(ev, ""));
          break;
        case "dialogue": {
          const sprite = dialogueSprite(ev, proj);
          if (sprite) showSprite(sprite.tag, [sprite.statement]);
          break;
        }
        case "raw": {
          const code = replayableRaw(ev.raw_code ?? "");
          if (code?.display) add(code.lines);
          else if (code) setVars(code.lines);
          break;
        }
        case "camera":
          camera = cameraLines(ev, "", false);
          break;
        case "music":
          music = ev.music ? musicStatement(ev) : null;
          break;
        case "sfx":
          // A looping sound keeps playing; any other sound replaces it and ends.
          sound = ev.sfx && ev.loop === true ? soundStatement(ev) : null;
          break;
        case "setvar":
          setVars([setvarStatement(ev)]);
          break;
      }
    }
  }
  return [...story.flatMap(e => e.lines), ...camera, ...[music, sound].filter((l): l is string => !!l)];
}

/** Options for the live preview script. */
export interface PreviewOptions extends DefaultsOptions {
  /** Start the game windowed or full screen, whatever the player's setting. */
  playMode?: 'windowed' | 'fullscreen';
}

/**
 * Compile a **live preview** script for a specific scene.
 *
 * The output is written to `game/vnv_preview.rpy` inside the project folder.
 * It contains all scene labels so cross-scene `call`/`jump` events resolve,
 * but sets `label start:` to jump directly to `targetSceneId` so Ren'Py
 * enters on exactly the scene you're editing. Before the jump it rebuilds what
 * a player would have by then (see {@link compileStorySoFar}), following a
 * shortest route from the start of the story: the backgrounds, sprites and
 * camera on screen, the music, and the variables set so far.
 *
 * Unlike {@link compileProject} there is **no resolution `init python:` block**
 * because the project's existing `gui.rpy` / `options.rpy` already configure
 * screen dimensions — adding a second block would cause a redefinition error.
 *
 * @param proj          - The project to compile.
 * @param targetSceneId - Scene id to jump to on `label start:`, or "main_menu"
 *                        to start at the game's main menu.
 * @param opts          - `declaredElsewhere`: variables the game's other scripts
 *                        already declare (the preview always sits next to them);
 *                        `playMode`: windowed or full screen.
 * @returns Multi-line Ren'Py `.rpy` string.
 */
export function compilePreview(
  proj: VNProject,
  targetSceneId?: string,
  opts: PreviewOptions = {},
): string {
  if (!targetSceneId) {
    targetSceneId = proj.scenes[0]?.id ?? "start";
  }
  const { playMode } = opts;
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
    const story = compileStorySoFar(routeTo(proj, targetSceneId), proj);
    if (story.length) {
      lines.push(`    ## The story so far: variables, what's on screen, the camera and the music.`);
      for (const line of story) lines.push(`    ${line}`);
    }
    lines.push(`    jump ${names.label(targetSceneId)}`);
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
    lines.push(`    scene expression ${bgFill(inheritedBg)}`);
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
