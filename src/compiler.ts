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

import type { VNProject, VNEvent, VNScene } from "./types";
import { extractVars, findChar, findScene } from "./types";

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
 * Normalizes built-in transitions to lowercase so they don't crash Ren'Py.
 * e.g., "Fade" becomes "fade", preventing "with Fade" from emitting the class.
 */
function safeTrans(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "fade" || lower === "dissolve" || lower === "flash" || lower === "pixellate") return lower;
  return t;
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
 */
function compileEvent(
  ev: VNEvent,
  proj: VNProject,
  lines: string[],
  prefix: string,
): void {
  const t = ev.type;
  if (!t) return;

  // ── Background ──────────────────────────────────────────────────────────────
  if (t === "bg") {
    const bg = esc(ev.bg ?? "");
    if (!bg) return;
    const fill = `Transform("${bg}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
    if (ev.atl_code) {
      lines.push(`${prefix}scene expression ${fill}:`);
      compileAtl(ev.atl_code, lines, prefix + "    ");
    } else {
      lines.push(`${prefix}scene expression ${fill}`);
    }
    if (ev.transition) {
      lines.push(`${prefix}with ${safeTrans(ev.transition)}`);
    }
  }

  // ── Sprite / image ──────────────────────────────────────────────────────────
  else if (t === "image") {
    const img = esc(ev.image ?? "");
    if (!img) return;
    const side = ev.side ?? "center";
    const at = ["left", "center", "right"].includes(side) ? ` at ${side}` : "";
    if (ev.atl_code) {
      lines.push(`${prefix}show expression "${img}" at ${side}:`);
      compileAtl(ev.atl_code, lines, prefix + "    ");
    } else {
      lines.push(`${prefix}show expression "${img}"${at}`);
    }
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
  }

  // ── Music ───────────────────────────────────────────────────────────────────
  else if (t === "music") {
    const m = esc(ev.music ?? "");
    if (m) {
      const parts = [`play music "${m}"`];
      if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
      if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
      if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
      if (ev.loop === false) parts.push(`noloop`); // 'loop' is default for music, so we use 'noloop' if false
      else if (ev.loop === true) parts.push(`loop`);
      lines.push(`${prefix}${parts.join(" ")}`);
    } else {
      // Stopping music
      const fo = ev.fadeout ? ` fadeout ${ev.fadeout}` : ` fadeout 0.5`;
      lines.push(`${prefix}stop music${fo}`);
    }
  }

  // ── SFX ─────────────────────────────────────────────────────────────────────
  else if (t === "sfx") {
    const s = esc(ev.sfx ?? "");
    if (s) {
      const parts = [`play sound "${s}"`];
      if (ev.volume !== undefined) parts.push(`volume ${ev.volume}`);
      if (ev.fadein) parts.push(`fadein ${ev.fadein}`);
      if (ev.fadeout) parts.push(`fadeout ${ev.fadeout}`);
      if (ev.loop === true) parts.push(`loop`); // 'noloop' is default for sound
      lines.push(`${prefix}${parts.join(" ")}`);
    }
  }

  // ── Dialogue ────────────────────────────────────────────────────────────────
  else if (t === "dialogue") {
    const char = findChar(proj, ev.char_id);
    const cRef = char ? `vnc_${char.id}` : "narrator";

    // Show character sprite if available
    if (ev.char_id && char) {
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

      if (hasSprite) {
        const side = ev.side ?? "center";
        lines.push(`${prefix}show ${char.name} ${pose} at ${side}`);
      }
    }

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
    if (!opts.length) {
      if (prompt) lines.push(`${prefix}"${prompt}"`);
      return;
    }
    lines.push(`${prefix}menu:`);
    if (prompt) lines.push(`${prefix}    "${prompt}"`);
    for (const opt of opts) {
      // Optional per-option condition  →  "Label" if condition:
      const cond = opt.condition?.trim();
      const condStr = cond ? ` if ${cond}` : "";
      lines.push(`${prefix}    "${esc(opt.text)}"${condStr}:`);
      const targetScene = findScene(proj, opt.scene);
      if (targetScene) {
        lines.push(`${prefix}        jump vns_scene_${opt.scene}`);
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
      lines.push(`${prefix}jump vns_scene_${target}`);
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
      lines.push(`${prefix}    jump vns_scene_${ev.scene_true}`);
    } else {
      lines.push(`${prefix}    pass`);
    }
    if (ev.scene_false) {
      lines.push(`${prefix}else:`);
      lines.push(`${prefix}    jump vns_scene_${ev.scene_false}`);
    }
  }

  // ── Auto-advance pause ──────────────────────────────────────────────────────
  else if (t === "movie") {
    const m = esc(ev.movie ?? "");
    if (m) lines.push(`${prefix}$ renpy.movie_cutscene("${m}")`);
  }

  // ── Camera (3D Stage) ───────────────────────────────────────────────────────
  else if (t === "camera") {
    const x = ev.camera_x ?? 0;
    const y = ev.camera_y ?? 0;
    const z = ev.camera_z ?? 0;
    const zoom = ev.camera_zoom ?? 1.0;
    const pitch = ev.camera_pitch ?? 0;
    const yaw = ev.camera_yaw ?? 0;
    const roll = ev.camera_roll ?? 0;
    const dur = ev.camera_dur ?? 1.0;

    const props = [];
    if (x) props.push(`xpos ${x}`);
    if (y) props.push(`ypos ${y}`);
    if (z) props.push(`zpos ${z}`);
    if (zoom !== 1.0) props.push(`zoom ${zoom}`);
    if (pitch) props.push(`matrixcolor InvertMatrix(${pitch})`); // Approximated for 3D stage if enabled
    if (yaw) props.push(`matrixcolor InvertMatrix(${yaw})`);
    if (roll) props.push(`matrixcolor InvertMatrix(${roll})`); // Actually camera 3D uses camera properties, but we'll emit camera transforms

    // Ren'Py 7.4+ camera syntax
    lines.push(`${prefix}camera:`);
    lines.push(`${prefix}    perspective True`);
    lines.push(`${prefix}    ease ${dur} xpos ${x} ypos ${y} zpos ${z} zoom ${zoom}`);
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
          Array(w).fill(`"vns_scene_${sc!.id}"`)
        ).join(", ");
        lines.push(`${prefix}$ _rnd = renpy.random.choice([${poolItems}])`);
      } else {
        const labelList = pairs.map(({ sc }) => `"vns_scene_${sc!.id}"`).join(", ");
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

// ─── Scene compiler ───────────────────────────────────────────────────────────

/**
 * Compile one {@link VNScene} into a Ren'Py `label vns_scene_<id>:` block.
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
 */
function compileScene(sc: VNScene, proj: VNProject, lines: string[]): void {
  lines.push(`label vns_scene_${sc.id}:`);

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
      compileEvent(ev, proj, lines, "    ");
    }
  }

  lines.push(`    return`);
  lines.push(``);
}

// ─── Main compiler ────────────────────────────────────────────────────────────

/** Options that control how the top-level `compileProject` entry point is emitted. */
export interface CompileOptions {
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
  const vars = extractVars(proj);
  if (vars.length) {
    lines.push(`## Story Variables (auto-discovered)`);
    for (const v of vars) {
      lines.push(`default ${v.name} = ${v.default_val}`);
    }
    lines.push(``);
  }

  // ── Achievements ────────────────────────────────────────────────────────────
  if (proj.achievements && proj.achievements.length) {
    lines.push(`## Achievements`);
    lines.push(`init python:`);
    for (const ach of proj.achievements) {
      lines.push(`    achievement.register("${esc(ach.name)}")`);
    }
    lines.push(``);
  }

  // ── Character definitions ────────────────────────────────────────────────────────
  if (proj.characters.length) {
    lines.push(`## Characters`);
    for (const char of proj.characters) {
      const args: string[] = [`'${char.display}'`, `color='${char.color}'`];
      if (char.name_prefix)     args.push(`who_prefix='${char.name_prefix}'`);
      if (char.name_suffix)     args.push(`who_suffix='${char.name_suffix}'`);
      if (char.dialogue_prefix) args.push(`what_prefix='${char.dialogue_prefix}'`);
      if (char.dialogue_suffix) args.push(`what_suffix='${char.dialogue_suffix}'`);
      if (char.side_images && Object.keys(char.side_images).length > 0) {
        args.push(`image='${char.name}'`);
      }
      lines.push(`define vnc_${char.id} = Character(${args.join(', ')})`);

      if (char.side_images) {
        for (const [pose, imgPath] of Object.entries(char.side_images)) {
          if (imgPath) {
            const poseSuffix = pose === 'neutral' ? '' : ` ${pose}`;
            lines.push(`image side ${char.name}${poseSuffix} = "${esc(imgPath)}"`);
          }
        }
      }

      if (char.is_layered && char.layered_sprites && char.layer_order) {
        for (const pose of char.poses) {
          const poseLayers = char.layered_sprites[pose] || {};
          const activeLayers = char.layer_order.map(l => poseLayers[l]).filter(Boolean);
          
          if (activeLayers.length === 1) {
            lines.push(`image ${char.name} ${pose} = "${esc(activeLayers[0])}"`);
          } else if (activeLayers.length > 1) {
            lines.push(`image ${char.name} ${pose} = Fixed(`);
            for (const file of activeLayers) {
              lines.push(`    "${esc(file)}",`);
            }
            lines.push(`    fit_first=True`);
            lines.push(`)`);
          }
        }
      } else if (char.sprites) {
        for (const pose of char.poses) {
          const imgPath = char.sprites[pose];
          if (imgPath) {
            lines.push(`image ${char.name} ${pose} = "${esc(imgPath)}"`);
          }
        }
      }
    }
    lines.push(``);
  }

  // ── Scene labels ────────────────────────────────────────────────────────────
  lines.push(`## Scenes`);
  for (const sc of proj.scenes) {
    compileScene(sc, proj, lines);
  }

  // ── Entry point ─────────────────────────────────────────────────────────────
  const startScene = proj.start
    ? proj.scenes.find(s => s.id === proj.start)
    : proj.scenes[0];

  if (startScene) {
    lines.push(`## Entry Point`);
    if (opts.asExport) {
      lines.push(`label start:`);
    } else {
      const safeId = proj.id.replace(/[^a-zA-Z0-9_]/g, "_");
      lines.push(`label vns_${safeId}_start:`);
    }
    lines.push(`    jump vns_scene_${startScene.id}`);
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
 * @returns Array of file objects with filename and string content.
 */
export function compileProjectToFiles(proj: VNProject): { filename: string, content: string }[] {
  const files: { filename: string, content: string }[] = [];
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
  const vars = extractVars(proj);
  if (vars.length) {
    scriptLines.push(`## Story Variables (auto-discovered)`);
    for (const v of vars) {
      scriptLines.push(`default ${v.name} = ${v.default_val}`);
    }
    scriptLines.push(``);
  }

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
  if (proj.characters.length) {
    scriptLines.push(`## Characters`);
    for (const char of proj.characters) {
      const args: string[] = [`'${char.display}'`, `color='${char.color}'`];
      if (char.name_prefix)     args.push(`who_prefix='${char.name_prefix}'`);
      if (char.name_suffix)     args.push(`who_suffix='${char.name_suffix}'`);
      if (char.dialogue_prefix) args.push(`what_prefix='${char.dialogue_prefix}'`);
      if (char.dialogue_suffix) args.push(`what_suffix='${char.dialogue_suffix}'`);
      if (char.side_images && Object.keys(char.side_images).length > 0) {
        args.push(`image='${char.name}'`);
      }
      scriptLines.push(`define vnc_${char.id} = Character(${args.join(', ')})`);

      if (char.side_images) {
        for (const [pose, imgPath] of Object.entries(char.side_images)) {
          if (imgPath) {
            const poseSuffix = pose === 'neutral' ? '' : ` ${pose}`;
            scriptLines.push(`image side ${char.name}${poseSuffix} = "${esc(imgPath)}"`);
          }
        }
      }

      if (char.is_layered && char.layered_sprites && char.layer_order) {
        for (const pose of char.poses) {
          const poseLayers = char.layered_sprites[pose] || {};
          const activeLayers = char.layer_order.map(l => poseLayers[l]).filter(Boolean);
          
          if (activeLayers.length === 1) {
            scriptLines.push(`image ${char.name} ${pose} = "${esc(activeLayers[0])}"`);
          } else if (activeLayers.length > 1) {
            scriptLines.push(`image ${char.name} ${pose} = Fixed(`);
            for (const file of activeLayers) {
              scriptLines.push(`    "${esc(file)}",`);
            }
            scriptLines.push(`    fit_first=True`);
            scriptLines.push(`)`);
          }
        }
      } else if (char.sprites) {
        for (const pose of char.poses) {
          const imgPath = char.sprites[pose];
          if (imgPath) {
            scriptLines.push(`image ${char.name} ${pose} = "${esc(imgPath)}"`);
          }
        }
      }
    }
    scriptLines.push(``);
  }

  // ── Entry point ─────────────────────────────────────────────────────────────
  const startScene = proj.start
    ? proj.scenes.find(s => s.id === proj.start)
    : proj.scenes[0];

  if (startScene) {
    scriptLines.push(`## Entry Point`);
    // For standalone export, we ALWAYS want `label start:`
    scriptLines.push(`label start:`);
    scriptLines.push(`    jump vns_scene_${startScene.id}`);
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
    compileScene(sc, proj, sceneLines);
    files.push({ filename: `scene_${sc.id}.rpy`, content: sceneLines.join("\n") });
  }

  return files;
}

// ─── Preview compiler ──────────────────────────────────────────────────────────

/**
 * Compile a **live preview** script for a specific scene.
 *
 * The output is written to `game/vnv_preview.rpy` inside the project folder.
 * It contains all scene labels so cross-scene `call`/`jump` events resolve,
 * but sets `label start:` to jump directly to `targetSceneId` so Ren'Py
 * enters on exactly the scene you're editing.
 *
 * Unlike {@link compileProject} there is **no resolution `init python:` block**
 * because the project's existing `gui.rpy` / `options.rpy` already configure
 * screen dimensions — adding a second block would cause a redefinition error.
 *
 * @param proj          - The project to compile.
 * @param targetSceneId - Scene id to jump to on `label start:`.
 * @returns Multi-line Ren'Py `.rpy` string.
 */
export function compilePreview(
  proj: VNProject,
  targetSceneId?: string,
  inheritedMusic?: string,
  playMode?: 'windowed' | 'fullscreen',
  inheritedBg?: string,
  inheritedSprite?: string
): string {
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

  // Character definitions
  if (proj.characters.length) {
    lines.push(`## Characters`);
    for (const char of proj.characters) {
      const args: string[] = [`'${char.display}'`, `color='${char.color}'`];
      if (char.name_prefix)     args.push(`who_prefix='${char.name_prefix}'`);
      if (char.name_suffix)     args.push(`who_suffix='${char.name_suffix}'`);
      if (char.dialogue_prefix) args.push(`what_prefix='${char.dialogue_prefix}'`);
      if (char.dialogue_suffix) args.push(`what_suffix='${char.dialogue_suffix}'`);
      if (char.side_images && Object.keys(char.side_images).length > 0) {
        args.push(`image='${char.name}'`);
      }
      lines.push(`define vnc_${char.id} = Character(${args.join(', ')})`);

      if (char.side_images) {
        for (const [pose, imgPath] of Object.entries(char.side_images)) {
          if (imgPath) {
            const poseSuffix = pose === 'neutral' ? '' : ` ${pose}`;
            lines.push(`image side ${char.name}${poseSuffix} = "${esc(imgPath)}"`);
          }
        }
      }
    }
    lines.push(``);
  }

  // Auto-discovered story variables
  const vars = extractVars(proj);
  if (vars.length) {
    lines.push(`## Story Variables (auto-discovered)`);
    for (const v of vars) lines.push(`default ${v.name} = ${v.default_val}`);
    lines.push(``);
  }

  // All scene labels — same format as the full export so cross-scene jumps resolve
  lines.push(`## Scenes`);
  for (const sc of proj.scenes) {
    compileScene(sc, proj, lines);
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
      lines.push(`    jump vns_scene_${proj.start}`);
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
    if (inheritedBg) {
      const fill = `Transform("${esc(inheritedBg)}", fit="cover", xsize=config.screen_width, ysize=config.screen_height)`;
      lines.push(`    scene expression ${fill}`);
    }
    if (inheritedSprite) {
      lines.push(`    show expression "${esc(inheritedSprite)}" at center`);
    }
    if (inheritedMusic) {
      lines.push(`    play music "${esc(inheritedMusic)}" fadein 0.5`);
    }
    lines.push(`    jump vns_scene_${targetSceneId}`);
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
  
  compileEvent({ ...ev, type: "animation" }, proj, lines, "    ");
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
