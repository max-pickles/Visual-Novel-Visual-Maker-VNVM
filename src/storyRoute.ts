/**
 * storyRoute.ts — How a player gets through the story to a scene.
 *
 * Shared by the live preview, which rebuilds what a player would have on
 * screen when the story reaches a scene, and the editor's scene previews.
 */
import type { VNEvent, VNProject, VNScene } from "./types";

/**
 * The scenes `ev` can send the player to: a jump's target, a choice's options,
 * both sides of a condition, and the scenes a random branch can pick.
 */
export function eventTargets(ev: VNEvent): string[] {
  switch (ev.type) {
    case "jump":   return ev.scene_id ? [ev.scene_id] : [];
    case "choice": return (ev.opts ?? []).flatMap(o => (o.scene ? [o.scene] : []));
    case "if":     return [ev.scene_true, ev.scene_false].filter((id): id is string => !!id);
    case "random": return (ev.random_scenes ?? []).filter((id, i) => !!id && (ev.random_weights?.[i] ?? 1) > 0);
    default:       return [];
  }
}

/** A scene a player passes through, and the event in it that leads on to the next scene. */
export interface RouteStep {
  scene: VNScene;
  /** Index of the event that leads to the next scene on the route; unset for the last scene. */
  exit?: number;
}

/** A scene the story reaches, and where the player comes from on a shortest route to it. */
export interface StoryVisit {
  scene: VNScene;
  /** The previous scene and the event in it that leads here; unset for a scene a route begins at. */
  from?: { scene: VNScene; exit: number };
}

/**
 * Every scene the story reaches, breadth-first: each one after the scene it's
 * first reached from. Routes begin at the start scene (the first scene when
 * none is set, as in the compiled game); scenes that can't be reached from it
 * are reached from the scenes that nothing leads to. Jumps, choices, conditions
 * and random branches are followed whichever way they go.
 */
export function walkStory(proj: VNProject): StoryVisit[] {
  const byId = new Map(proj.scenes.map(sc => [sc.id, sc]));
  const targeted = new Set(proj.scenes.flatMap(sc => sc.events.flatMap(eventTargets)));
  const roots = [proj.start ?? proj.scenes[0]?.id, ...proj.scenes.filter(sc => !targeted.has(sc.id)).map(sc => sc.id)];
  const visits: StoryVisit[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const scene = root ? byId.get(root) : undefined;
    if (!scene || seen.has(scene.id)) continue;
    seen.add(scene.id);
    visits.push({ scene });
    for (let i = visits.length - 1; i < visits.length; i++) {
      const from = visits[i].scene;
      from.events.forEach((ev, exit) => {
        for (const id of eventTargets(ev)) {
          const next = byId.get(id);
          if (!next || seen.has(id)) continue;
          seen.add(id);
          visits.push({ scene: next, from: { scene: from, exit } });
        }
      });
    }
  }
  return visits;
}

/**
 * A shortest route through the story to the scene `targetId` (see
 * {@link walkStory}): the scenes a player passes through, ending with it. Just
 * that scene if the story never reaches it, and empty if there's no such scene.
 */
export function routeTo(proj: VNProject, targetId: string): RouteStep[] {
  const visits = new Map(walkStory(proj).map(v => [v.scene.id, v]));
  const target = proj.scenes.find(sc => sc.id === targetId);
  let step: StoryVisit | undefined = visits.get(targetId) ?? (target && { scene: target });
  let exit: number | undefined;
  const route: RouteStep[] = [];
  while (step) {
    route.unshift({ scene: step.scene, exit });
    exit = step.from?.exit;
    step = step.from && visits.get(step.from.scene.id);
  }
  return route;
}
