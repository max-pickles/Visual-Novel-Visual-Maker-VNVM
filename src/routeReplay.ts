/**
 * routeReplay.ts — What has run by the time play reaches a scene, or a line
 * inside one, so the Ren'Py preview and the Playtest can start there with the
 * backgrounds, sprites, music and variables a player would have.
 *
 * Ren'Py's reload (Shift+R) gets this from a save of the running game. A place
 * nobody has played to yet has no save, so this follows a route from the start
 * scene instead and lists what ran along it. Each play mode applies that list
 * its own way: the preview compiles it into statements (compilePreview), the
 * Playtest folds it into its stage (playtestStage.ts).
 */
import type { VNEvent, VNProject, VNScene } from "./types";

/** Something that ran on the way: a scene's label starting, or one of its events. */
export type ReplayStep =
  | { kind: "enter"; scene: VNScene }
  | { kind: "event"; scene: VNScene; event: VNEvent };

export interface Replay {
  /** The scenes played through before the start scene, first to last. */
  route: VNScene[];
  /** What ran before the start point, in order. */
  steps: ReplayStep[];
  /** False when no route leads to the start scene, so no earlier scene was replayed. */
  reached: boolean;
}

/** A way out of a scene: the event at `idx` can send play to `target`. */
interface Exit {
  idx: number;
  target: string;
}

/**
 * Where a scene can lead, in event order. Nothing after an event that always
 * leaves (a jump, a random branch, an if with an else, or a menu whose every
 * option jumps) can run, so exits stop there.
 */
function sceneExits(scene: VNScene, sceneIds: ReadonlySet<string>): Exit[] {
  const exits: Exit[] = [];
  for (let idx = 0; idx < scene.events.length; idx++) {
    const ev = scene.events[idx];
    const add = (target: string | null | undefined) => {
      if (target && sceneIds.has(target)) exits.push({ idx, target });
    };
    if (ev.type === "jump") {
      add(ev.scene_id);
      if (ev.scene_id) break;
    } else if (ev.type === "choice") {
      const opts = ev.opts ?? [];
      opts.forEach(o => add(o.scene));
      if (opts.length > 0 && opts.every(o => o.scene && sceneIds.has(o.scene))) break;
    } else if (ev.type === "if") {
      add(ev.scene_true);
      add(ev.scene_false);
      if (ev.scene_true && ev.scene_false) break;
    } else if (ev.type === "random") {
      const targets = (ev.random_scenes ?? [])
        .filter((id, i) => sceneIds.has(id) && (ev.random_weights?.[i] ?? 1) > 0);
      targets.forEach(add);
      if (targets.length > 0) break;
    }
  }
  return exits;
}

/**
 * The route to `targetId` with the fewest scene changes, from the game's start
 * scene or, when that can't reach it, from any scene nothing leads to. Each
 * step is a scene before the target and the index of the event that leaves it.
 * Empty when the target is where the search starts; null when nothing reaches it.
 */
export function findRoute(project: VNProject, targetId: string): { scene: VNScene; exitIdx: number }[] | null {
  const byId = new Map(project.scenes.map(s => [s.id, s]));
  if (!byId.has(targetId)) return null;
  const ids = new Set(byId.keys());
  const exits = new Map(project.scenes.map(s => [s.id, sceneExits(s, ids)]));

  const search = (sources: string[]) => {
    const cameFrom = new Map<string, { from: string; idx: number } | null>();
    const queue: string[] = [];
    for (const id of sources) {
      if (!cameFrom.has(id)) { cameFrom.set(id, null); queue.push(id); }
    }
    for (let q = 0; q < queue.length; q++) {
      const id = queue[q];
      if (id === targetId) {
        const route: { scene: VNScene; exitIdx: number }[] = [];
        for (let step = cameFrom.get(id); step; step = cameFrom.get(step.from)) {
          route.unshift({ scene: byId.get(step.from)!, exitIdx: step.idx });
        }
        return route;
      }
      for (const { idx, target } of exits.get(id) ?? []) {
        if (!cameFrom.has(target)) { cameFrom.set(target, { from: id, idx }); queue.push(target); }
      }
    }
    return null;
  };

  const startId = byId.has(project.start ?? "") ? project.start! : project.scenes[0]?.id;
  const fromStart = startId ? search([startId]) : null;
  if (fromStart) return fromStart;
  const ledTo = new Set([...exits.values()].flatMap(list => list.map(e => e.target)));
  return search(project.scenes.map(s => s.id).filter(id => !ledTo.has(id)));
}

/**
 * What runs before play reaches line `startIdx` of the scene `targetId`: each
 * scene on the route up to the event that leads on, then the start scene's own
 * earlier lines. At a scene's first line the scene's own label start is left
 * out, because jumping to the scene runs it.
 */
export function replayTo(project: VNProject, targetId: string, startIdx = 0): Replay {
  const target = project.scenes.find(s => s.id === targetId);
  const found = findRoute(project, targetId);
  const route = found ?? [];
  const steps: ReplayStep[] = [];
  const run = (scene: VNScene, until: number) => {
    steps.push({ kind: "enter", scene });
    for (const event of scene.events.slice(0, until)) steps.push({ kind: "event", scene, event });
  };
  for (const { scene, exitIdx } of route) run(scene, exitIdx);
  if (target && startIdx > 0) run(target, startIdx);
  return { route: route.map(r => r.scene), steps, reached: found !== null };
}
