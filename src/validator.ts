/**
 * validator.ts — Pre-export {@link VNProject} static analysis.
 *
 * Performs structural checks on the in-memory project before it is compiled
 * or exported to Ren'Py. Checks are categorised as:
 *
 * - **Error** (blocking): the compiler would produce invalid or broken Ren'Py
 *   script. Export should be prevented until the user resolves these.
 * - **Warning** (non-blocking): the script will compile, but the project may
 *   behave unexpectedly at runtime (e.g. unreachable scenes, empty dialogue).
 * - **Info** (advisory): style guidance that will not affect compilation.
 *
 * ## Checks performed
 *  1. Start scene is set and exists.
 *  2. Project has at least one scene.
 *  3. Every scene has a non-empty label.
 *  4. No two scenes share the same label (Ren'Py labels must be unique).
 *  5. Scene labels only contain characters valid for Ren'Py identifiers.
 *  6. Jump, if, and choice targets all resolve to existing scenes.
 *  7. Dialogue events reference existing characters.
 *  8. All scenes are reachable from the start scene (BFS + fall-through).
 *  9. No dialogue or narration event has empty text.
 * 10. No choice event has an option with empty text.
 * 11. setvar events have a valid Python identifier as var_name.
 * 12. if events have a non-empty condition string.
 * 13. wait events have a positive duration.
 * 14. Project has a cover image set (info).
 *
 * This module is pure — it has no side effects and can be called at any time.
 */
import type { VNProject, VNScene } from "./types";

/** Severity of a single diagnostic message. */
export type DiagnosticSeverity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  message: string;
  location?: string;
}

export interface ValidationResult {
  errors:   Diagnostic[];
  warnings: Diagnostic[];
  infos:    Diagnostic[];
  ok: boolean;
  count: number;
}

// Ren'Py identifier: must start with a letter or underscore, then letters,
// digits, or underscores — NO spaces, NO hyphens, NO dots.
const VALID_RENPY_LABEL  = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const VALID_PYTHON_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function validateProject(project: VNProject): ValidationResult {
  const errors:   Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const infos:    Diagnostic[] = [];

  const sceneMap = new Map<string, VNScene>(project.scenes.map((s) => [s.id, s]));
  const charIds  = new Set(project.characters.map((c) => c.id));
  const usedCharIds = new Set<string>();

  // ── 1. Start scene ──────────────────────────────────────────────────────────
  if (!project.start) {
    errors.push({ severity: "error", message: "No start scene is set. Mark one scene as the start." });
  } else if (!sceneMap.has(project.start)) {
    errors.push({ severity: "error", message: "The start scene ID no longer exists in the project." });
  }

  // ── 2. Empty project ────────────────────────────────────────────────────────
  if (project.scenes.length === 0) {
    errors.push({ severity: "error", message: "The project has no scenes. Add at least one scene." });
  }

  // ── 3 & 4. Empty labels + duplicate labels ──────────────────────────────────
  // When a Ren'Py project is imported, the importer creates a default "start"
  // scene alongside the imported one, producing a harmless duplicate of the
  // start label. Downgrade that case to a warning (first definition wins).
  const startScene = project.start ? sceneMap.get(project.start) : undefined;
  const startLabel = startScene?.label?.trim() ?? "";

  const labelCount = new Map<string, number>();
  for (const sc of project.scenes) {
    const trimmed = sc.label.trim();
    if (!trimmed) {
      errors.push({ severity: "error", message: "Scene has an empty label.", location: sc.label || sc.id });
    } else {
      labelCount.set(trimmed, (labelCount.get(trimmed) ?? 0) + 1);
    }
  }
  for (const [label, count] of labelCount) {
    if (count > 1) {
      const isStartLabel = label === startLabel && label === "start";
      const diag: Diagnostic = {
        severity: isStartLabel ? "warning" : "error",
        message: `Duplicate scene label "${label}" (×${count}). Ren'Py labels must be unique.${isStartLabel ? " (first definition wins)" : ""}`,
        location: label,
      };
      if (diag.severity === "error") errors.push(diag); else warnings.push(diag);
    }
  }

  // ── 5. Invalid label characters ─────────────────────────────────────────────
  for (const sc of project.scenes) {
    const trimmed = sc.label.trim();
    if (trimmed && !VALID_RENPY_LABEL.test(trimmed)) {
      warnings.push({
        severity: "warning",
        message: `Scene label "${sc.label}" contains special characters invalid in a Ren'Py identifier. The compiler will sanitize it.`,
        location: sc.label,
      });
    }
  }

  // ── 6–13. Per-event checks ──────────────────────────────────────────────────
  for (const sc of project.scenes) {
    for (let i = 0; i < sc.events.length; i++) {
      const ev  = sc.events[i];
      const loc = sc.label;
      const idx = `Event ${i + 1}`;

      if (ev.type === "jump") {
        if (ev.scene_id && !sceneMap.has(ev.scene_id)) {
          errors.push({ severity: "error", message: `${idx}: jump target scene no longer exists.`, location: loc });
        }
      } else if (ev.type === "if") {
        if (ev.scene_true  && !sceneMap.has(ev.scene_true))  errors.push({ severity: "error", message: `${idx}: if-true target scene no longer exists.`,  location: loc });
        if (ev.scene_false && !sceneMap.has(ev.scene_false)) errors.push({ severity: "error", message: `${idx}: if-false target scene no longer exists.`, location: loc });
        if (!ev.condition?.trim()) errors.push({ severity: "error", message: `${idx}: if event has an empty condition — invalid Ren'Py syntax.`, location: loc });
      } else if (ev.type === "choice") {
        // Empty opts list downgraded to warning: imported projects often have
        // menu blocks the importer couldn't fully parse (fall-through menus).
        if (!ev.opts || ev.opts.length === 0) {
          warnings.push({ severity: "warning", message: `${idx}: choice event has no options — likely an import artifact. Review this scene.`, location: loc });
        } else {
          for (let j = 0; j < ev.opts.length; j++) {
            const opt = ev.opts[j];
            if (!opt.text.trim()) warnings.push({ severity: "warning", message: `${idx}, option ${j + 1}: choice option has empty text.`, location: loc });
            if (opt.scene && !sceneMap.has(opt.scene)) errors.push({ severity: "error", message: `${idx}, option ${j + 1} ("${opt.text}"): jump target no longer exists.`, location: loc });
          }
        }
      }

      if (ev.type === "dialogue" && ev.char_id) {
        if (!charIds.has(ev.char_id)) {
          errors.push({ severity: "error", message: `${idx}: references a deleted character.`, location: loc });
        } else {
          usedCharIds.add(ev.char_id);
        }
      }
      if ((ev.type === "dialogue" || ev.type === "narration") && !ev.text?.trim()) {
        warnings.push({ severity: "warning", message: `${idx}: empty ${ev.type} text.`, location: loc });
      }
      if (ev.type === "setvar") {
        const name = ev.var_name?.trim() ?? "";
        if (!name) errors.push({ severity: "error", message: `${idx}: setvar event has no variable name.`, location: loc });
        else if (!VALID_PYTHON_IDENT.test(name)) errors.push({ severity: "error", message: `${idx}: setvar variable name "${name}" is not a valid Python identifier.`, location: loc });
      }
      if (ev.type === "wait" && (ev.dur ?? 0) <= 0) {
        warnings.push({ severity: "warning", message: `${idx}: wait event has a non-positive duration (${ev.dur ?? 0}s).`, location: loc });
      }
    }
  }

  // ── 8. Unreachable scenes (BFS + Ren'Py fall-through) ───────────────────────
  // Ren'Py supports fall-through: a label with no explicit jump/choice/if
  // naturally continues executing into the next label in file order. We model
  // this by treating the next scene in the array as an implicit successor when
  // a scene has no outgoing navigation events — preventing false "unreachable"
  // warnings on linear imported scripts.
  const hasExplicitNav = (sc: VNScene) =>
    sc.events.some(ev =>
      (ev.type === "jump"   && ev.scene_id) ||
      (ev.type === "if"     && (ev.scene_true || ev.scene_false)) ||
      (ev.type === "choice" && (ev.opts ?? []).some(o => o.scene))
    );

  const sceneIndex = new Map<string, number>(project.scenes.map((s, i) => [s.id, i]));

  if (project.start && sceneMap.has(project.start)) {
    const reachable = new Set<string>();
    const queue: string[] = [project.start];
    let head = 0;

    while (head < queue.length) {
      const id = queue[head++];
      if (reachable.has(id)) continue;
      reachable.add(id);
      const sc = sceneMap.get(id);
      if (!sc) continue;

      for (const ev of sc.events) {
        if (ev.type === "jump"   && ev.scene_id)   queue.push(ev.scene_id);
        if (ev.type === "if") {
          if (ev.scene_true)  queue.push(ev.scene_true);
          if (ev.scene_false) queue.push(ev.scene_false);
        }
        if (ev.type === "choice") for (const o of ev.opts ?? []) if (o.scene) queue.push(o.scene);
      }

      // Fall-through: scene with no explicit nav → next scene in order is reachable
      if (!hasExplicitNav(sc)) {
        const i = sceneIndex.get(id) ?? -1;
        if (i >= 0 && i + 1 < project.scenes.length) queue.push(project.scenes[i + 1].id);
      }
    }

    for (const sc of project.scenes) {
      if (!reachable.has(sc.id)) {
        warnings.push({ severity: "warning", message: `Scene "${sc.label}" is unreachable from the start scene.`, location: sc.label });
      }
    }
  }

  // ── 14. No cover image ──────────────────────────────────────────────────────
  if (!project.cover) {
    infos.push({ severity: "info", message: "No cover image is set. Adding one improves how the project appears in the launcher." });
  }

  // ── 15. Unused Characters ───────────────────────────────────────────────────
  for (const char of project.characters) {
    if (!usedCharIds.has(char.id)) {
      warnings.push({ severity: "warning", message: `Character "${char.name}" is defined but never speaks in the project.`, location: "Project" });
    }
  }

  // ── 16. Dead-End Scenes ─────────────────────────────────────────────────────
  for (const sc of project.scenes) {
    if (!hasExplicitNav(sc)) {
      const i = sceneIndex.get(sc.id) ?? -1;
      const hasFallThrough = i >= 0 && i + 1 < project.scenes.length;
      if (!hasFallThrough && !sc.ending_type) {
        errors.push({ severity: "error", message: `Scene is a dead end. It has no outgoing jumps, choices, or fall-through, and is not marked as an Ending.`, location: sc.label });
      }
    }
  }

  // ── 17. Unused & Uninitialized Variables ────────────────────────────────────
  const assignedVars = new Set<string>();
  const readVars = new Set<string>();

  for (const sc of project.scenes) {
    for (const ev of sc.events) {
      if (ev.type === "setvar" && ev.var_name?.trim()) {
        assignedVars.add(ev.var_name.trim());
      } else if (ev.type === "if" && ev.condition) {
        // match word characters, excluding pure numbers
        const tokens = ev.condition.match(/\b([a-zA-Z_]\w*)\b/g) ?? [];
        for (const t of tokens) readVars.add(t);
      }
    }
  }

  for (const v of assignedVars) {
    if (!readVars.has(v)) {
      warnings.push({ severity: "warning", message: `Variable "${v}" is set but never evaluated in any 'if' condition.`, location: "Project" });
    }
  }

  const pythonKeywords = new Set(['True', 'False', 'None', 'and', 'or', 'not', 'is', 'in']);
  for (const v of readVars) {
    if (!assignedVars.has(v) && !pythonKeywords.has(v)) {
      warnings.push({ severity: "warning", message: `Variable "${v}" is evaluated in an 'if' condition but never initialized with a 'setvar' event. (Safe to ignore if initialized in an imported script).`, location: "Project" });
    }
  }

  // ── 18. Random branch checks ────────────────────────────────────────────────
  for (const sc of project.scenes) {
    for (let i = 0; i < sc.events.length; i++) {
      const ev  = sc.events[i];
      const loc = sc.label;
      const idx = `Event ${i + 1}`;

      if (ev.type === "random") {
        const targets = (ev.random_scenes ?? []).filter(Boolean);
        if (targets.length === 0) {
          warnings.push({ severity: "warning", message: `${idx}: random branch has no target scenes configured — it will do nothing at runtime.`, location: loc });
        } else {
          for (const tid of targets) {
            if (!sceneMap.has(tid)) {
              errors.push({ severity: "error", message: `${idx}: random branch target scene no longer exists.`, location: loc });
            }
          }
          if (targets.length === 1) {
            infos.push({ severity: "info", message: `${idx}: random branch has only one target — consider using a regular jump instead.`, location: loc });
          }
        }
      }

      if (ev.type === "movie" && !ev.movie?.trim()) {
        warnings.push({ severity: "warning", message: `${idx}: movie event has no file set.`, location: loc });
      }

      if ((ev.type === "dialogue" || ev.type === "narration") && (ev.text?.length ?? 0) > 280) {
        infos.push({ severity: "info", message: `${idx}: dialogue line is ${ev.text!.length} characters — VN convention recommends ≤280 chars per line for readability.`, location: loc });
      }
    }
  }

  // ── 19. Purely structural scenes (no dialogue or narration) ─────────────────
  for (const sc of project.scenes) {
    const hasContent = sc.events.some(ev => ev.type === "dialogue" || ev.type === "narration");
    const hasNav = hasExplicitNav(sc);
    // Only warn if scene has events but purely structural (skip empty scenes — already caught)
    if (!hasContent && hasNav && sc.events.length > 0) {
      infos.push({ severity: "info", message: `Scene "${sc.label}" has no dialogue or narration — it is purely structural. Is this intentional?`, location: sc.label });
    }
  }


  const count = errors.length + warnings.length + infos.length;
  return { errors, warnings, infos, ok: errors.length === 0, count };
}
