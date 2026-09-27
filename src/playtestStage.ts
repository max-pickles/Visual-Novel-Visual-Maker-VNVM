/**
 * playtestStage.ts — What the Playtest shows and remembers (background,
 * sprites, variables and music) and how entering a scene and each of its
 * events change it.
 *
 * The Playtest applies events one at a time as you play. Starting mid-story
 * folds the replayed route (routeReplay.ts) through the same function, so the
 * start looks the way it would if you had played there.
 */
import type { VNEvent, VNProject, VNScene } from "./types";
import { characterSprite, findChar } from "./types";
import { evalPy } from "./pyExpr";
import type { ReplayStep } from "./routeReplay";

export interface Stage {
  bg: string | null;
  /** Sprites on screen by tag, in the order they first appeared (later ones on top). */
  sprites: Map<string, VNEvent>;
  variables: Record<string, any>;
  /** The music track playing, or null when none is. */
  music: string | null;
}

export const emptyStage = (): Stage => ({ bg: null, sprites: new Map(), variables: {}, music: null });

const RENPY_COLORS = new Set(["black", "white", "transparent"]);

/** Apply `name = value` (or `+=`, `-=`); a value that can't be evaluated is kept as text. */
export function evaluateAssignment(expr: string, vars: Record<string, any>): Record<string, any> {
  const match = expr.match(/^\s*([a-zA-Z_]\w*)\s*(={1,2}|\+=|-=)\s*(.+)$/);
  if (!match) return vars;

  const [_, name, op, valExpr] = match;
  let val: any;
  try {
    val = evalPy(valExpr, vars);
  } catch {
    val = valExpr.trim();
  }

  const newVars = { ...vars };
  if (op === '=' || op === '==') newVars[name] = val;
  else if (op === '+=') newVars[name] = (newVars[name] || 0) + val;
  else if (op === '-=') newVars[name] = (newVars[name] || 0) - val;

  return newVars;
}

/** The path the music player plays a music event's track from. */
export function musicSource(music: string): string {
  const clean = music.replace(/['"]/g, "");
  if (clean.startsWith("game/")) return clean;
  return clean.startsWith("audio/") ? `game/${clean}` : clean;
}

/** An image's tag: the first word of its file name, so a new pose replaces the old one. */
function imageTag(image: string): string {
  const name = image.replace(/\\/g, "/").split("/").pop() || image;
  return name.split(/[\s_]/)[0].toLowerCase();
}

/** `$ name = value` (or `+=`, `-=`), the way imported games keep assignments in raw code. */
const RAW_ASSIGNMENT = /^\$\s*([A-Za-z_]\w*\s*(?:=|\+=|-=)(?!=).*)$/;

/** The assignments at the top level of raw code (not inside an if or python block). */
function rawAssignments(code: string): string[] {
  const lines = code.split("\n").filter(l => l.trim());
  const indent = Math.min(...lines.map(l => l.length - l.trimStart().length));
  return lines
    .filter(l => l.length - l.trimStart().length === indent)
    .map(l => l.trim().match(RAW_ASSIGNMENT)?.[1])
    .filter((a): a is string => !!a);
}

/**
 * The sprite a dialogue line shows its speaker with, like the compiled game's
 * `show <character> <pose> at <side>`. Keyed by character, so the character's
 * next pose replaces it.
 */
function speakerSprite(ev: VNEvent, project: VNProject): VNEvent | null {
  const char = findChar(project, ev.char_id);
  const sprite = char ? characterSprite(char, ev.pose) : null;
  if (!char || !sprite?.files.length) return null;
  return { id: `char:${char.id}`, type: "image", image: sprite.files[0], layers: sprite.files, side: ev.side ?? "center" };
}

/** The stage after `ev` runs. An event that doesn't change it returns the same stage. */
export function applyEvent(stage: Stage, ev: VNEvent, project: VNProject): Stage {
  switch (ev.type) {
    case "bg": {
      const clears = !!ev.bg && !RENPY_COLORS.has(ev.bg.toLowerCase());
      return { ...stage, bg: ev.bg || null, sprites: clears ? new Map() : stage.sprites };
    }
    case "image":
    case "animation": {
      if (!ev.image) return stage;
      const sprites = new Map(stage.sprites);
      const tag = imageTag(ev.image);
      if (ev.kind === "hide") sprites.delete(tag);
      else sprites.set(tag, ev);
      return { ...stage, sprites };
    }
    case "dialogue": {
      const sprite = speakerSprite(ev, project);
      return sprite ? { ...stage, sprites: new Map(stage.sprites).set(sprite.id, sprite) } : stage;
    }
    case "music":
      return { ...stage, music: ev.music || null };
    case "setvar": {
      const name = ev.var_name?.trim();
      const assignment = name ? `${name} = ${ev.var_val ?? "False"}` : ev.condition;
      return assignment ? { ...stage, variables: evaluateAssignment(assignment, stage.variables) } : stage;
    }
    case "raw": {
      const assignments = rawAssignments(ev.raw_code ?? "");
      if (!assignments.length) return stage;
      return { ...stage, variables: assignments.reduce((vars, a) => evaluateAssignment(a, vars), stage.variables) };
    }
    default:
      return stage;
  }
}

/**
 * The stage when play enters `scene`: its own background and music, which the
 * compiled game shows at the top of the scene's label, before its events.
 */
export function enterScene(stage: Stage, scene: VNScene, project: VNProject): Stage {
  const withBg = scene.bg ? applyEvent(stage, { id: `bg:${scene.id}`, type: "bg", bg: scene.bg }, project) : stage;
  return scene.music ? { ...withBg, music: scene.music } : withBg;
}

/** The stage when play starts after `steps` (see replayTo). */
export function replayStage(steps: ReplayStep[], project: VNProject): Stage {
  return steps.reduce(
    (stage, step) => (step.kind === "enter" ? enterScene(stage, step.scene, project) : applyEvent(stage, step.event, project)),
    emptyStage(),
  );
}
