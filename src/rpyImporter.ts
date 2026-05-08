/**
 * rpyImporter.ts — Parse an existing Ren'Py `game/` folder into a {@link VNProject}.
 *
 * ## Parse Pipeline
 * 1. **Merge** — concatenate all non-GUI `.rpy` files into a single line buffer.
 *    Files matching known GUI/utility names (`gui.rpy`, `screens.rpy`, etc.) and
 *    directories (`gui/`, `tl/`, `vn_maker/`) are skipped.
 * 2. **Character definitions** — scan for `define <var> = Character("Name")` and
 *    build a `charVarMap` from variable name → `VNCharacter.id`.
 * 3. **Tokenize** — strip blank lines, comments, and carriage returns; record
 *    indentation depth for each surviving token.
 * 4. **State machine** — walk tokens sequentially using a set of RegExp matchers.
 *    Each recognised construct maps to one {@link VNEvent} type. Unknown lines
 *    are silently discarded.
 * 5. **Resolve jumps** — `jump`/`call` targets are stored as label strings during
 *    parsing; this phase resolves them to scene IDs. Unresolved targets produce
 *    a warning.
 * 6. **Auto-start** — if no `start` label was found, the first imported scene
 *    becomes the project start.
 *
 * ## Supported Ren'Py constructs
 * | Construct | Mapped to |
 * |---|---|
 * | `label <name>:` | Scene |
 * | `<char> "<text>"` | `dialogue` / `narration` |
 * | `"<text>"` (bare) | `narration` |
 * | `menu:` block | `choice` |
 * | `jump` / `call` | `jump` |
 * | `scene <name>` | `bg` |
 * | `show <name> at <side>` | `image` |
 * | `play music "<file>"` | `music` |
 * | `stop music` | empty-music event |
 * | `pause <n>` | `wait` |
 * | `with <transition>` | `effect` |
 * | `default <var> = <val>` | Warning only (not imported) |
 *
 * ## Known limitations
 * - `if`/`while`/Python blocks are **not** parsed — content is discarded.
 * - ATL (`at transform:`) blocks are not captured.
 * - `hide` statements are silently skipped.
 * - Only the *last* `with` on a standalone line is preserved;
 *   inline `with` on `scene`/`show` is partially handled.
 *
 * Full TypeScript port of `vn_import_rpy()` from `vn_data.rpy` (legacy VNVMaker).
 */

import type {
  VNProject, VNScene, VNEvent, VNCharacter, VNChoiceOpt,
} from "./types";
import {
  newProject, newCharacter, newEvent,
} from "./types";
import { autoLayoutProject } from "./sceneGraphUtils";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Return value of {@link importFromRpyFiles}.
 *
 * Always contains a valid (possibly empty) project even when warnings are
 * present. The first element of `warnings` is a human-readable summary line
 * (e.g. `"Imported 5 scenes, 2 characters, 18 events."`); subsequent entries
 * describe specific parse issues.
 */
export interface ImportResult {
  /** The imported project — may have 0 scenes if no labels were found. */
  project: VNProject;
  /**
   * Informational and advisory messages produced during import.
   * Index 0 is always a summary string.
   */
  warnings: string[];
}

/**
 * Parse all .rpy file contents from a game folder.
 * @param files  Array of { name, content } for every .rpy file found.
 * @param folderPath  The root path of the game folder (used for _rootPath).
 * @param title  Project title.
 * @param author  Project author.
 */
/**
 * Parse all `.rpy` file contents from a Ren'Py `game/` folder into a
 * {@link VNProject}.
 *
 * @param files      - Array of `{ name, content }` objects — one per `.rpy` file.
 *                     `name` should use forward slashes and be relative to the
 *                     game root (e.g. `"game/script.rpy"`).
 * @param folderPath - Absolute path to the game root on disk. Stored in
 *                     `project._rootPath` (forward-slash normalised).
 * @param title      - Display title for the imported project. Defaults to
 *                     `"Imported Project"`.
 * @param author     - Author string. Defaults to `"Author"`.
 * @returns An {@link ImportResult} containing the populated project and any
 *          warnings generated during the parse.
 *
 * @example
 * ```ts
 * const files = await readRpyFiles(gamePath);
 * const { project, warnings } = importFromRpyFiles(files, gamePath, "My VN", "Me");
 * console.log(warnings[0]); // "Imported 3 scenes, 1 character, 12 events."
 * ```
 */
export function importFromRpyFiles(
  files: { name: string; content: string }[],
  folderPath: string,
  title = "Imported Project",
  author = "Author",
  imageFiles: string[] = [],
): ImportResult {
  const warnings: string[] = [];
  const proj = newProject(title, author);
  proj._rootPath = folderPath.replace(/\\/g, "/");

  // ── 1. Merge all lines ────────────────────────────────────────────────────
  const allLines: string[] = [];
  for (const file of files) {
    // Skip GUI/screens/options — they are not story content
    const skip = [
      "options.rpy", "gui.rpy", "screens.rpy", "styles.rpy",
      "testcases.rpy", "guisupport.rpy", "accessibility.rpy",
    ];
    // Skip files inside non-story directories (handles both "tl/x.rpy" and "/tl/x.rpy")
    const skipDirs = ["cache", "tl", "gui", "saves", "vn_maker", ".vscode"];
    const norm = file.name.replace(/\\/g, "/");
    // Match basename for the skip-filename list
    const basename = norm.split("/").pop() ?? norm;
    if (skip.some(s => basename === s)) continue;
    // Match any path segment for the skip-directory list
    if (skipDirs.some(d => norm.split("/").some(seg => seg === d))) continue;
    allLines.push(...file.content.split("\n"));
  }

  // ── 2. Parse character definitions: define e = Character("Eileen") ────────
  const charVarMap: Record<string, string> = {}; // varname → char.id
  const charDefRe = /^define\s+(\w+)\s*=\s*Character\s*\(\s*["']([^"']+)["']/;
  const charColorRe = /color\s*=\s*["']([^"']+)["']/;

  const fullText = allLines.join("\n");
  for (const line of allLines) {
    const m = line.match(charDefRe);
    if (m) {
      const [, varname, charname] = m;
      const ch = newCharacter(charname);
      ch.name = varname; // use the variable name as the script id
      ch.poses = [];     // clear template poses — only discovered images will populate these
      ch.sprites = {};
      // Try to extract color
      const cm = line.match(charColorRe);
      if (cm) ch.color = cm[1];
      proj.characters.push(ch);
      charVarMap[varname] = ch.id;
    }
  }

  // ── 2b. Auto-assign character sprites from imageFiles ─────────────────────
  // If an image filename starts with the character's variable name (or display name),
  // we add it to their sprites map. For example: "eileen happy.png"
  for (const ch of proj.characters) {
    const prefix1 = ch.name.toLowerCase() + " ";
    const prefix2 = ch.name.toLowerCase() + "_";
    const prefix3 = ch.display.toLowerCase() + " ";
    const prefix4 = ch.display.toLowerCase() + "_";

    for (const imgPath of imageFiles) {
      const baseName = imgPath.split('/').pop()?.toLowerCase() || "";
      if (
        baseName.startsWith(prefix1) || baseName.startsWith(prefix2) ||
        baseName.startsWith(prefix3) || baseName.startsWith(prefix4)
      ) {
        // "sylvie green normal.png" -> "green normal"
        // "eileen_happy.webp" -> "happy"
        let poseName = baseName.replace(/\.[^/.]+$/, ""); // remove extension
        if (poseName.startsWith(prefix1)) poseName = poseName.substring(prefix1.length);
        else if (poseName.startsWith(prefix2)) poseName = poseName.substring(prefix2.length);
        else if (poseName.startsWith(prefix3)) poseName = poseName.substring(prefix3.length);
        else if (poseName.startsWith(prefix4)) poseName = poseName.substring(prefix4.length);

        if (!ch.sprites) ch.sprites = {};
        ch.sprites[poseName.trim()] = imgPath;
      }
    }
    // Update poses list to match discovered sprites
    if (ch.sprites) {
      ch.poses = Object.keys(ch.sprites);
    }
  }

  // ── 3. Tokenize ───────────────────────────────────────────────────────────
  interface Token { indent: number; line: string; }
  const tokens: Token[] = [];
  for (const raw of allLines) {
    const stripped = raw.replace(/\r$/, "");
    const content = stripped.trimStart();
    if (!content || content.startsWith("#")) continue;
    tokens.push({ indent: stripped.length - content.length, line: content });
  }

  // ── 4. State machine ──────────────────────────────────────────────────────
  const labelRe   = /^label\s+([\w.]+)\s*:/;
  const sayRe     = /^(\w+)\s+"(.*)"/;
  const narrRe    = /^"(.*)"/;
  const jumpRe    = /^jump\s+([\w.]+)/;
  const callRe    = /^call\s+([\w.]+)/;
  const menuRe    = /^menu\s*:/;
  const choiceRe  = /^"([^"]+)"\s*:/;
  const sceneRe   = /^scene\s+([\w/.\ \-]+)/;
  const showRe    = /^show\s+([\w/.\ \-]+?)(?:\s+at\s+(left|center|right))?(?:\s+with\s+\w+)?$/;
  const hideRe    = /^hide\s+/;
  const playRe    = /^play\s+music\s+["']([^"']+)["']/;
  const stopRe    = /^stop\s+music/;
  const withRe    = /^with\s+(\w+)/;
  const pauseRe   = /^pause\s+([\d.]+)/;
  const defaultRe = /^default\s+(\w+)\s*=\s*(.+)/;

  // field: optional key on VNEvent to set (defaults to 'scene_id')
  interface PendingJump { ev: VNEvent; targetLabel: string; field?: 'scene_id' | 'scene_true' | 'scene_false'; }
  const sceneNodes: Record<string, VNScene> = {};
  const sceneOrder: string[] = [];
  const pendingJumps: PendingJump[] = [];

  // ── Skipped/unsupported construct counters ────────────────────────────────
  let skippedPythonLines  = 0;  // $ python expressions that aren't simple flag sets
  let skippedComplexIf    = 0;  // if/else blocks too complex to parse as VNEvent
  let skippedAtlBlocks    = 0;  // show … at transform: / at custom_transform ATL blocks
  let skippedHide         = 0;  // hide <sprite> statements
  let skippedSfx          = 0;  // play sound / play sfx
  let capturedRaw         = 0;  // lines captured as raw events (for reference)

  let currentScene: VNScene | null = null;
  let inMenu = false;
  let menuEv: VNEvent | null = null;
  let inComplexIf = false;  // true while inside an unparseable if/else block
  let complexIfIndent = -1; // base indent of the if statement we are skipping

  const uid6 = () => Math.random().toString(36).slice(2, 8);

  const finishMenu = () => {
    if (inMenu && menuEv && currentScene) {
      currentScene.events.push(menuEv);
    }
    inMenu = false;
    menuEv = null;
  };

  const addEvent = (ev: VNEvent) => {
    if (!currentScene) return;
    finishMenu();
    currentScene.events.push(ev);
  };

  // Simple boolean-flag if gate: `if <flagName>:` (no operators)
  // Matches the Ren'Py pattern used for deferred-consequence gates.
  const ifFlagRe = /^if\s+(\w+)\s*:/;
  // `else:` block header
  const elseRe   = /^else\s*:/;

  for (let ti = 0; ti < tokens.length; ti++) {
    const { line, indent } = tokens[ti];

    // ── Skip body of a complex if/else we cannot parse ────────────────────
    if (inComplexIf) {
      if (indent > complexIfIndent) continue; // still inside the block
      inComplexIf = false;                     // block ended — resume normal parse
    }

    // ── Simple if-flag gate ───────────────────────────────────────────────
    // Handles: `if flagName:\n<indent+>jump goodLabel` with optional else.
    // Creates an `if` VNEvent + a synthetic fallthrough (bad-end) scene so
    // the "Hank dies" type of inline bad ending appears as its own graph node.
    {
      const mIf = line.match(ifFlagRe);
      if (mIf && !inMenu && currentScene) {
        const flag     = mIf[1];
        const nextTok  = tokens[ti + 1];
        // Only handle if the next line is a `jump` at a deeper indent
        if (nextTok && nextTok.indent > indent) {
          const jmNext = nextTok.line.match(jumpRe);
          if (jmNext) {
            const goodLabel = jmNext[1];
            ti++; // consume the `jump goodLabel` token

            // Check for explicit `else: / jump badLabel`
            const tok2 = tokens[ti + 1];
            const tok3 = tokens[ti + 2];
            let badLabel: string | null = null;
            if (tok2 && tok2.line.match(elseRe) && tok3 && tok3.indent > indent) {
              const jmElse = tok3.line.match(jumpRe);
              if (jmElse) { badLabel = jmElse[1]; ti += 2; } // consume else: + jump
            }

            finishMenu();
            const ifEv: VNEvent = { id: uid6(), type: 'if', condition: flag, scene_true: null, scene_false: null };
            currentScene.events.push(ifEv);
            pendingJumps.push({ ev: ifEv, targetLabel: goodLabel, field: 'scene_true' });

            if (badLabel) {
              // Explicit else → resolve scene_false to the existing label
              pendingJumps.push({ ev: ifEv, targetLabel: badLabel, field: 'scene_false' });
            } else {
              // No else → inline fallthrough becomes a new synthetic bad-end scene
              const synLabel = currentScene.label + '_bad_end';
              // Avoid duplicate synthetic scenes (same label block re-entered)
              if (!sceneNodes[synLabel]) {
                const synSc: VNScene = {
                  id: uid6(), label: synLabel,
                  bg: currentScene.bg, music: currentScene.music, events: [],
                };
                ifEv.scene_false = synSc.id;
                sceneNodes[synLabel] = synSc;
                sceneOrder.push(synLabel);
                proj.scenes.push(synSc);
                currentScene = synSc; // continue parsing into the fallthrough scene
              } else {
                ifEv.scene_false = sceneNodes[synLabel].id;
              }
            }
            continue;
          }
        }
      }
    }

    // ── Label ─────────────────────────────────────────────────────────────
    let m = line.match(labelRe);
    if (m) {
      finishMenu();
      const lbl = m[1];
      // Handle VNV Maker's own exported labels: vns_scene_<name> → use <name> as the scene label
      // Also skip the synthetic `start` label if it only exists to jump into a vns_scene_,
      // since the real story scenes are the vns_scene_ labels themselves.
      let sceneLbl = lbl;
      if (lbl.startsWith("vns_scene_")) {
        sceneLbl = lbl.slice("vns_scene_".length); // strip prefix → e.g. "scStart"
        // Strip leading camelCase "sc" prefix (e.g. scStart → Start, scRway → Rway)
        // Only strip when "sc" is followed by an uppercase letter to avoid mangling
        // words like "scene" or "school".
        if (/^sc[A-Z]/.test(sceneLbl)) {
          sceneLbl = sceneLbl.slice(2); // "scStart" → "Start"
        }
      } else if (lbl.startsWith("vn_")) {
        continue; // skip other internal VNVMaker utility labels
      }

      // If the previous scene naturally falls through (no jump/return/choice at the end), add an implicit jump.
      if (currentScene && currentScene.events.length > 0) {
        const lastEv = currentScene.events[currentScene.events.length - 1];
        if (lastEv.type !== "jump" && lastEv.type !== "choice" && !(lastEv as any)._isReturn) {
          const fallthroughEv: VNEvent = { id: uid6(), type: "jump", scene_id: null, transition: "none" };
          (fallthroughEv as any)._targetLabel = lbl;
          currentScene.events.push(fallthroughEv);
          pendingJumps.push({ ev: fallthroughEv, targetLabel: lbl });
        }
      }

      const sc: VNScene = { id: uid6(), label: sceneLbl, bg: null, music: null, events: [] };
      // Register under the full original label so `jump vns_scene_X` targets resolve
      sceneNodes[lbl] = sc;
      // Also register under the stripped label so plain `jump X` targets resolve
      if (sceneLbl !== lbl) sceneNodes[sceneLbl] = sc;
      sceneOrder.push(lbl);
      proj.scenes.push(sc);
      currentScene = sc;
      continue;
    }

    if (!currentScene) continue;

    // ── default variable ──────────────────────────────────────────────────
    m = line.match(defaultRe);
    if (m) {
      warnings.push(`Variable: default ${m[1]} = ${m[2]} (not imported as event)`);
      continue;
    }

    // ── scene expression Transform(...) — VNV Maker exported bg format ────
    // Must run BEFORE the generic sceneRe because sceneRe greedily matches
    // "scene expression Transform" and stores "expression Transform" as the bg name.
    {
      const transformRe = /^scene\s+expression\s+Transform\s*\(\s*["']([^"']+)["']/;
      const tm = line.match(transformRe);
      if (tm) {
        // rawPath = "images/bg lecturehall.jpg"
        // Strip "images/" prefix — bgCandidates resolver adds game/images/ automatically.
        const rawPath = tm[1].replace(/^images\//, "");
        const ev: VNEvent = { id: uid6(), type: "bg", bg: rawPath };
        addEvent(ev);
        currentScene.bg = rawPath;
        const wm = line.match(/\bwith\s+(\w+)/);
        if (wm) {
          const eff: VNEvent = { id: uid6(), type: "effect", kind: mapTransition(wm[1]), dur: 0.5 };
          currentScene.events.push(eff);
        }
        continue;
      }
    }

    // ── scene (background) ────────────────────────────────────────────────
    m = line.match(sceneRe);
    if (m) {
      const bgName = m[1].replace(/\s+with\s+\w+$/, "").trim();
      const ev: VNEvent = { id: uid6(), type: "bg", bg: bgName };
      addEvent(ev);
      currentScene.bg = bgName;
      // Detect immediate "with" transition on same line
      const wm = line.match(/\bwith\s+(\w+)/);
      if (wm) {
        const eff: VNEvent = { id: uid6(), type: "effect", kind: mapTransition(wm[1]), dur: 0.5 };
        currentScene.events.push(eff);
      }
      continue;
    }

    // ── show (sprite image) ───────────────────────────────────────────────
    m = line.match(showRe);
    if (m) {
      const img = m[1].trim();
      const side = (m[2] ?? "center") as "left" | "center" | "right";
      const ev: VNEvent = { id: uid6(), type: "image", image: img, side };
      finishMenu();
      currentScene.events.push(ev);
      continue;
    }

    // ── show expression "..." at side — VNV Maker exported sprite format ─
    {
      const showExprRe = /^show\s+expression\s+["']([^"']+)["'](?:\s+at\s+(left|center|right))?/;
      const sem = line.match(showExprRe);
      if (sem) {
        // Strip "images/" prefix — image resolvers add game/images/ automatically
        const img = sem[1].trim().replace(/^images\//, "");
        const side = (sem[2] ?? "center") as "left" | "center" | "right";
        const ev: VNEvent = { id: uid6(), type: "image", image: img, side };
        finishMenu();
        currentScene.events.push(ev);
        continue;
      }
    }

    // ── hide ──────────────────────────────────────────────────────────────
    if (hideRe.test(line)) {
      skippedHide++;
      // Emit a raw event so nothing is completely invisible to the author
      if (currentScene) {
        const ev: VNEvent = { id: uid6(), type: 'raw', raw_code: line };
        (ev as any)._isSkipped = true;
        finishMenu();
        currentScene.events.push(ev);
        capturedRaw++;
      }
      continue;
    }

    // ── play music ────────────────────────────────────────────────────────
    m = line.match(playRe);
    if (m) {
      const ev: VNEvent = { id: uid6(), type: "music", music: m[1] };
      addEvent(ev);
      currentScene.music = m[1];
      continue;
    }

    // ── stop music ────────────────────────────────────────────────────────
    if (stopRe.test(line)) {
      const ev: VNEvent = { id: uid6(), type: "music", music: "" };
      addEvent(ev);
      continue;
    }

    // ── with (standalone transition) ──────────────────────────────────────
    m = line.match(withRe);
    if (m && !inMenu) {
      const kind = mapTransition(m[1]);
      const ev: VNEvent = { id: uid6(), type: "effect", kind, dur: 0.5 };
      currentScene.events.push(ev);
      continue;
    }

    // ── pause ─────────────────────────────────────────────────────────────
    m = line.match(pauseRe);
    if (m) {
      const ev: VNEvent = { id: uid6(), type: "wait", dur: parseFloat(m[1]) || 1.0 };
      addEvent(ev);
      continue;
    }

    // ── menu: ─────────────────────────────────────────────────────────────
    if (menuRe.test(line)) {
      finishMenu();
      inMenu = true;
      menuEv = { id: uid6(), type: "choice", prompt: "", opts: [] };
      continue;
    }

    // ── choice option inside menu ─────────────────────────────────────────
    if (inMenu && menuEv) {
      m = line.match(choiceRe);
      if (m) {
        const opt: VNChoiceOpt = { id: uid6(), text: m[1], scene: null };
        (menuEv.opts ??= []).push(opt);
        continue;
      }
      // jump inside a choice block assigns to the last option
      const jm = line.match(jumpRe);
      if (jm && menuEv.opts?.length) {
        const lastOpt = menuEv.opts[menuEv.opts.length - 1] as any;
        lastOpt._targetLabel = jm[1];
        continue;
      }
    }

    // ── jump / call ───────────────────────────────────────────────────────
    m = line.match(jumpRe) ?? line.match(callRe);
    if (m) {
      finishMenu();
      const ev: VNEvent = { id: uid6(), type: "jump", scene_id: null, transition: "dissolve" };
      (ev as any)._targetLabel = m[1];
      currentScene.events.push(ev);
      pendingJumps.push({ ev, targetLabel: m[1] });
      continue;
    }

    // ── return ────────────────────────────────────────────────────────────
    if (/^return$/.test(line)) {
      finishMenu();
      // Mark as return so it doesn't fall through. It acts as an end-of-scene marker.
      const ev: VNEvent = { id: uid6(), type: "jump", scene_id: null };
      (ev as any)._isReturn = true;
      currentScene.events.push(ev);
      continue;
    }

    // ── dialogue (character says) ─────────────────────────────────────────
    m = line.match(sayRe);
    if (m) {
      const [, varname, text] = m;
      // Skip if we're inside a menu (it's a prompt)
      if (inMenu && menuEv) {
        menuEv.prompt = `${varname}: ${text}`;
        continue;
      }
      finishMenu();
      const charId = charVarMap[varname];
      let ev: VNEvent;
      if (charId) {
        ev = { id: uid6(), type: "dialogue", char_id: charId, pose: "neutral", text, side: "center" };
      } else {
        // Unknown var — treat as narration with speaker prefix
        ev = { id: uid6(), type: "narration", text: `${varname}: ${text}` };
      }
      currentScene.events.push(ev);
      continue;
    }

    // ── narration (standalone quoted string) ──────────────────────────────
    m = line.match(narrRe);
    if (m) {
      // Skip if we're inside a menu (it's a prompt)
      if (inMenu && menuEv) {
        menuEv.prompt = m[1];
        continue;
      }
      finishMenu();
      const ev: VNEvent = { id: uid6(), type: "narration", text: m[1] };
      currentScene.events.push(ev);
      continue;
    }

    // ── $ python expression ───────────────────────────────────────────────
    // Lines starting with `$` that aren't simple `$ var = True/False/N` are
    // captured as raw events and counted — they may be achievement grants,
    // affection increments, etc. that need manual review.
    if (line.startsWith('$')) {
      skippedPythonLines++;
      if (currentScene) {
        const ev: VNEvent = { id: uid6(), type: 'raw', raw_code: line };
        finishMenu();
        currentScene.events.push(ev);
        capturedRaw++;
      }
      continue;
    }

    // ── play sound / sfx ─────────────────────────────────────────────────
    // `play sound` / `play sfx` — not music, captured as raw for now
    if (/^play\s+(sound|sfx|voice)\b/.test(line)) {
      skippedSfx++;
      if (currentScene) {
        const ev: VNEvent = { id: uid6(), type: 'raw', raw_code: line };
        finishMenu();
        currentScene.events.push(ev);
        capturedRaw++;
      }
      continue;
    }

    // ── show … at <custom_transform> — ATL block ─────────────────────────
    // `show X at myTransform:` — the `:` signals an ATL body we can't parse
    if (/^show\b.*:\s*$/.test(line) || /^scene\b.*:\s*$/.test(line)) {
      skippedAtlBlocks++;
      if (currentScene) {
        const ev: VNEvent = { id: uid6(), type: 'raw', raw_code: line };
        finishMenu();
        currentScene.events.push(ev);
        capturedRaw++;
      }
      continue;
    }
  }

  finishMenu();

  // ── 5. Resolve jump targets ───────────────────────────────────────────────
  for (const { ev, targetLabel, field } of pendingJumps) {
    const target = sceneNodes[targetLabel];
    if (target) {
      if (field === 'scene_true')  { ev.scene_true  = target.id; }
      else if (field === 'scene_false') { ev.scene_false = target.id; }
      else                         { ev.scene_id    = target.id; }
    } else {
      warnings.push(`Jump target "${targetLabel}" not found as a label.`);
    }
  }

  // Resolve choice option destinations
  for (const sc of proj.scenes) {
    for (const ev of sc.events) {
      if (ev.type === "choice") {
        for (const opt of ev.opts ?? []) {
          const label = (opt as any)._targetLabel as string | undefined;
          delete (opt as any)._targetLabel;
          if (label) {
            const target = sceneNodes[label];
            if (target) {
              opt.scene = target.id;
            } else {
              warnings.push(`Choice target "${label}" not found.`);
            }
          }
        }
      }
    }
  }

  // ── 5b. Detect ending types + hidden bad paths ────────────────────────────
  detectHiddenBadEndings(proj.scenes, fullText, warnings);

  // ── 6. Auto-set start ─────────────────────────────────────────────────────
  // Deduplicate scenes — dual registration can cause the same scene to appear twice in sceneOrder
  const seen = new Set<string>();
  proj.scenes = sceneOrder.map(lbl => sceneNodes[lbl]).filter(sc => {
    if (!sc || seen.has(sc.id)) return false;
    seen.add(sc.id);
    return true;
  });

  // If there's a bare 'start' scene that only has a single jump event (VNV Maker entry shim),
  // don't count it as a real scene — resolve start to its jump target instead.
  const startSc = sceneNodes["start"];
  const isShimStart = startSc &&
    startSc.events.length === 1 &&
    startSc.events[0].type === "jump" &&
    startSc.events[0].scene_id;

  if (isShimStart) {
    proj.start = startSc.events[0].scene_id!;
    // Remove the shim from the scene list (it's not a real story scene)
    proj.scenes = proj.scenes.filter(s => s.id !== startSc.id);
  } else if (sceneNodes["start"]) {
    proj.start = sceneNodes["start"].id;
  } else if (sceneNodes["START"]) {
    proj.start = sceneNodes["START"].id;
  } else if (proj.scenes.length > 0) {
    proj.start = proj.scenes[0].id;
  } else {
    proj.start = "";
  }

  // Build layout positions using auto-layout
  const { layout } = autoLayoutProject(proj);
  proj.layout = layout;

  const summary = `Imported ${proj.scenes.length} scenes, ${proj.characters.length} characters, ${proj.scenes.reduce((a, s) => a + s.events.length, 0)} events.`;
  warnings.unshift(summary);

  // ── Unsupported construct report ─────────────────────────────────────────
  if (skippedComplexIf > 0) {
    warnings.push(
      `⚠ ${skippedComplexIf} complex if/else block${skippedComplexIf !== 1 ? 's' : ''} were skipped (only simple "if flag: jump" patterns are parsed). Branches with Python expressions, comparisons, or multi-line bodies are not imported.`
    );
  }
  if (skippedPythonLines > 0) {
    warnings.push(
      `⚠ ${skippedPythonLines} Python (\`$\`) expression${skippedPythonLines !== 1 ? 's' : ''} were captured as Raw Code events — review them in the Scene Editor to ensure correctness.`
    );
  }
  if (skippedAtlBlocks > 0) {
    warnings.push(
      `⚠ ${skippedAtlBlocks} ATL/transform block${skippedAtlBlocks !== 1 ? 's' : ''} (show/scene with \`:\`) were captured as Raw Code events — ATL animation bodies are not parsed.`
    );
  }
  if (skippedHide > 0) {
    warnings.push(
      `⚠ ${skippedHide} \`hide\` statement${skippedHide !== 1 ? 's' : ''} were captured as Raw Code events — sprite hide is not yet natively supported.`
    );
  }
  if (skippedSfx > 0) {
    warnings.push(
      `ℹ ${skippedSfx} \`play sound/sfx/voice\` statement${skippedSfx !== 1 ? 's' : ''} were captured as Raw Code events (use the SFX event type to replace them).`
    );
  }
  if (capturedRaw > 0) {
    warnings.push(
      `ℹ ${capturedRaw} total event${capturedRaw !== 1 ? 's' : ''} were captured as Raw Code fallbacks — search for 🟡 Raw events in the Scene Editor to review them.`
    );
  }

  if (!proj.scenes.length) {
    warnings.push("No labels found in .rpy files — nothing was imported.");
  }

  return { project: proj, warnings };
}

// ─── Hidden Bad Ending Detector ───────────────────────────────────────────────
/**
 * Post-import structural analysis: detects "hidden" bad endings that the simple
 * keyword scan misses. Works in four stages:
 *
 * Stage 1 — Keyword tagging (same as before, but now foundational for stage 2).
 * Stage 2 — Structural dead-end detection: any scene with zero outgoing jumps
 *            that is NOT already tagged 'good' is treated as 'bad' by default.
 * Stage 3 — Fixpoint propagation: walks the graph backward — if ALL outgoing
 *            paths from a scene lead exclusively to bad ends, the scene itself
 *            becomes "effectively bad", and any choice option pointing to it is
 *            marked `is_incorrect`.
 * Stage 4 — Variable-gate detection: scans the raw Ren'Py source for `if`
 *            blocks that jump to a known bad-ending label, and marks the
 *            corresponding choice option at the branch point as `is_incorrect`.
 */
function detectHiddenBadEndings(
  scenes: import("./types").VNScene[],
  fullRpySource: string,
  warnings: string[],
): void {
  // ── Stage 1: keyword tagging ──────────────────────────────────────────────
  for (const sc of scenes) {
    const corpus = sc.events
      .map(e => ("text" in e ? String(e.text ?? "") : ""))
      .join(" ") + " " + sc.label;

    if (!sc.ending_type) {
      if (/true\s*end|credits|finale|the\s*end/i.test(corpus)) {
        sc.ending_type = "true";
      } else if (/good\s*end|best\s*end|happy\s*end|perfect\s*end/i.test(corpus)) {
        sc.ending_type = "good";
      } else if (/bad\s*end|dead\s*end|wrong\s*end|game\s*over|stuck|fail/i.test(corpus)) {
        sc.ending_type = "bad";
      } else if (/odd\s*end|alt\s*end|joke\s*end|secret\s*end/i.test(corpus)) {
        sc.ending_type = "odd";
      }
    }
  }

  // ── Stage 2: structural dead-end scan ─────────────────────────────────────
  // Build outgoing link map for every scene
  const outLinks = new Map<string, Set<string>>(); // scene.id → {target scene.id, ...}
  for (const sc of scenes) {
    const targets = new Set<string>();
    for (const ev of sc.events) {
      if (ev.type === "jump" && ev.scene_id) targets.add(ev.scene_id);
      if (ev.type === "choice") {
        for (const opt of ev.opts ?? []) {
          if (opt.scene) targets.add(opt.scene);
        }
      }
      if (ev.type === "if") {
        if (ev.scene_true)  targets.add(ev.scene_true);
        if (ev.scene_false) targets.add(ev.scene_false);
      }
    }
    outLinks.set(sc.id, targets);
  }

  // Any scene with no real outgoing links (only null/return jumps) is a dead end
  const structuralDeadEnds = new Set<string>();
  for (const sc of scenes) {
    const outs = outLinks.get(sc.id) ?? new Set();
    if (outs.size === 0) {
      structuralDeadEnds.add(sc.id);
      // Only tag as 'bad' if not already explicitly good/odd
      if (!sc.ending_type) {
        sc.ending_type = "bad";
      }
    }
  }

  // ── Stage 3: fixpoint propagation of "effectively bad" ───────────────────
  // A scene is "effectively bad" if every one of its outgoing links leads to a
  // scene that is itself effectively bad (or a structural dead-end tagged bad).
  const effectiveBad = new Set<string>(
    scenes.filter(s => s.ending_type === "bad").map(s => s.id),
  );
  const effectiveGood = new Set<string>(
    scenes.filter(s => s.ending_type === "good" || s.ending_type === "true").map(s => s.id),
  );

  // Iteratively expand effectiveBad until stable
  let changed = true;
  while (changed) {
    changed = false;
    for (const sc of scenes) {
      if (effectiveBad.has(sc.id) || effectiveGood.has(sc.id)) continue;
      const outs = [...(outLinks.get(sc.id) ?? [])];
      if (outs.length === 0) continue; // already handled above
      // If ALL outgoing targets are effectively bad → this scene is too
      if (outs.every(id => effectiveBad.has(id))) {
        effectiveBad.add(sc.id);
        if (!sc.ending_type) sc.ending_type = "bad";
        changed = true;
      }
    }
  }

  // Now mark choice options: if a choice option points to an effectively-bad
  // scene AND there is at least one option in the same choice that is NOT bad,
  // mark it `is_incorrect`. (Single-target choices stay neutral — no comparison.)
  let badChoicesFound = 0;
  for (const sc of scenes) {
    for (const ev of sc.events) {
      if (ev.type !== "choice") continue;
      const opts = ev.opts ?? [];
      const hasBad  = opts.some(o => o.scene && effectiveBad.has(o.scene));
      const hasGood = opts.some(o => o.scene && !effectiveBad.has(o.scene));
      if (!hasBad || !hasGood) continue; // all same — no clear contrast

      for (const opt of opts) {
        if (opt.scene && effectiveBad.has(opt.scene) && !opt.is_key) {
          opt.is_incorrect = true;
          badChoicesFound++;
        } else if (opt.scene && !effectiveBad.has(opt.scene) && hasBad) {
          opt.is_correct = true;
        }
      }
    }
  }

  // ── Stage 4: variable-gate detection from raw Ren'Py source ───────────────
  // This game uses TWO patterns for deferred bad endings:
  //
  // Pattern A — positive flag + fallthrough (most common in minusworldvn):
  //   if hank_flag:
  //      jump happy_hank      ← good path
  //   [fall through to bad inline content]
  //   return
  //
  // Pattern B — explicit if/else jump:
  //   if void_flag:
  //      jump wrestlers_bypass   ← good
  //   else:
  //      jump wrestlers_lose     ← bad
  //
  // For both patterns, we identify which label is jumped to when the flag is
  // TRUE and mark the ELSE/fallthrough destination as bad. We also track which
  // `$ var = True` assignment maps to which choice label, enabling us to mark
  // the causative choice option as `is_correct` (and its sibling as `is_incorrect`).

  // Build label → scene lookup
  const labelToScene = new Map<string, import("./types").VNScene>();
  for (const sc of scenes) labelToScene.set(sc.label, sc);

  // ── Build flag→scene map: `$ flag = True` inside label X means label X grants flag ──
  // Pattern: (inside a label block) `$ <varname> = True`
  const flagGrantedByLabel = new Map<string, string>(); // flagName → label that sets it True
  const flagSetRe = /^label\s+([\w.]+)\s*:[\s\S]*?(?=\nlabel\s|\Z)/gm;
  const varSetRe  = /^\s*\$\s*(\w+)\s*=\s*True\b/m;
  let labelBlock: RegExpExecArray | null;
  while ((labelBlock = flagSetRe.exec(fullRpySource)) !== null) {
    const lbl  = labelBlock[1];
    const body = labelBlock[0];
    const vm   = body.match(varSetRe);
    if (vm) flagGrantedByLabel.set(vm[1], lbl);
  }

  // ── Scan for if-gate patterns ──────────────────────────────────────────────
  // Normalise CRLF → LF for consistent matching
  const src = fullRpySource.replace(/\r\n/g, "\n");

  // Match: `if <flag>:\n<indent>jump <good_label>\n[else:\n<indent>jump <bad_label>]`
  // Also catches: `if <flag>:\n<indent>jump <good>\n` with fallthrough (no else)
  const ifBlockRe = /^(\s*)if\s+([\w.]+)\s*:\s*\n\1[ \t]+jump\s+(\w+)(?:\s*\n\1else\s*:\s*\n\1[ \t]+jump\s+(\w+))?/gm;
  let m4: RegExpExecArray | null;
  let varGatesFound = 0;

  while ((m4 = ifBlockRe.exec(src)) !== null) {
    const flag      = m4[2];  // the boolean variable being tested
    const goodLabel = m4[3];  // jump target when flag is True
    const badLabel  = m4[4];  // explicit else jump (may be undefined)

    const goodSc = labelToScene.get(goodLabel);
    const badSc  = badLabel ? labelToScene.get(badLabel) : undefined;

    // Mark explicit else-target as bad if it reaches only bad ends
    if (badSc && !badSc.ending_type && effectiveBad.has(badSc.id)) {
      badSc.ending_type = "bad";
      varGatesFound++;
    }

    // For Pattern A (no else), the "else" is the inline fallthrough which the
    // parser now splits into a synthetic `_bad_end` scene (in the token loop).
    // What we CAN do: find the choice whose option grants this flag, and mark
    // it as `is_key` (gold ★) — a KEY DECISION whose consequence comes later.
    // The sibling options stay neutral pink (they don't look bad at the time).

    if (goodSc && !effectiveBad.has(goodSc.id)) {
      const grantedByLabel = flagGrantedByLabel.get(flag);
      if (grantedByLabel) {
        for (const sc of scenes) {
          for (const ev of sc.events) {
            if (ev.type !== "choice") continue;
            const opts = ev.opts ?? [];
            const keyOpt = opts.find(o => {
              const target = scenes.find(s => s.id === o.scene);
              return target?.label === grantedByLabel;
            });
            // Mark the flag-granting option as KEY CHOICE (gold ★ edge)
            // Only if it hasn't already been tagged (e.g. is_incorrect from Stage 3)
            if (keyOpt && !keyOpt.is_incorrect && !keyOpt.is_key) {
              keyOpt.is_key = true;
              varGatesFound++;
            }
          }
        }
      }
    }
  }

  // After stage 4, re-run propagation pass in case new bad ends unlocked more
  changed = true;
  while (changed) {
    changed = false;
    for (const sc of scenes) {
      if (effectiveBad.has(sc.id) || effectiveGood.has(sc.id)) continue;
      const outs = [...(outLinks.get(sc.id) ?? [])];
      if (outs.length > 0 && outs.every(id => effectiveBad.has(id))) {
        effectiveBad.add(sc.id);
        if (!sc.ending_type) sc.ending_type = "bad";
        changed = true;
      }
    }
  }

  // ── Summary warnings ──────────────────────────────────────────────────────
  const badEndCount  = scenes.filter(s => s.ending_type === "bad").length;
  const goodEndCount = scenes.filter(s => s.ending_type === "good" || s.ending_type === "true").length;
  if (badEndCount > 0 || goodEndCount > 0) {
    warnings.push(
      `Ending analysis: ${goodEndCount} good/true ending${goodEndCount !== 1 ? "s" : ""}, ` +
      `${badEndCount} bad/stuck ending${badEndCount !== 1 ? "s" : ""} detected ` +
      `(${badChoicesFound} bad choice branch${badChoicesFound !== 1 ? "es" : ""} auto-marked, ` +
      `${varGatesFound} variable-gated trap${varGatesFound !== 1 ? "s" : ""} found).`,
    );
  }
}

// ─── Helper: map Ren'Py transition names to our effect kinds ─────────────────

/**
 * Map a Ren'Py built-in transition name to the VNVMaker `EffectKind` string.
 *
 * Unknown names are returned as-is so that custom ATL transitions defined
 * elsewhere in the project are preserved in the imported data.
 *
 * @param name - Ren'Py transition identifier (e.g. `"dissolve"`, `"None"`).
 * @returns The corresponding {@link EffectKind} value, or `name` if unrecognised.
 */
function mapTransition(name: string): string {
  const map: Record<string, string> = {
    dissolve: "dissolve",
    fade: "fade",
    flash: "flash",
    pixellate: "pixellate",
    wiperight: "wiperight",
    wipeleft: "wipeleft",
    wipeup: "wipeup",
    wipedown: "wipedown",
    slideright: "slideright",
    slideleft: "slideleft",
    None: "none",
    none: "none",
  };
  return map[name] ?? name;
}
