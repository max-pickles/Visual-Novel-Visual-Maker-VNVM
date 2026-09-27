/**
 * routeReplay.test.ts — Tests for routeReplay.ts: which route leads to a scene
 * and what runs along it before play starts there.
 */

import { findRoute, replayTo } from "../routeReplay";
import { newEvent, newProject, newScene } from "../types";
import type { VNEvent, VNProject } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A project with scenes whose ids are the given names; the first is the start. */
function story(scenes: Record<string, VNEvent[]>): VNProject {
  const proj = newProject("Route", "Tester");
  proj.scenes = Object.entries(scenes).map(([id, events]) => ({ ...newScene(id), id, events }));
  proj.start = proj.scenes[0].id;
  return proj;
}

const say = (text: string): VNEvent => ({ ...newEvent("narration"), text });
const jump = (to: string): VNEvent => ({ ...newEvent("jump"), scene_id: to });
const menu = (...targets: (string | null)[]): VNEvent => ({
  ...newEvent("choice"),
  opts: targets.map((scene, i) => ({ id: `o${i}`, text: `Option ${i}`, scene })),
});
const branch = (sceneTrue: string | null, sceneFalse: string | null): VNEvent =>
  ({ ...newEvent("if"), condition: "x", scene_true: sceneTrue, scene_false: sceneFalse });

/** A route as "scene@exit index" strings. */
const steps = (route: ReturnType<typeof findRoute>) => route?.map(r => `${r.scene.id}@${r.exitIdx}`) ?? null;

// ─── findRoute ────────────────────────────────────────────────────────────────

describe("findRoute", () => {
  it("takes the fewest scene changes from the start scene", () => {
    const proj = story({
      start: [say("Hi"), menu("long", "short")],
      long: [jump("longer")],
      longer: [jump("end")],
      short: [jump("end")],
      end: [],
    });
    expect(steps(findRoute(proj, "end"))).toEqual(["start@1", "short@0"]);
  });

  it("is empty for the start scene itself", () => {
    const proj = story({ start: [jump("next")], next: [] });
    expect(findRoute(proj, "start")).toEqual([]);
  });

  it("follows if branches and random branches", () => {
    const rnd = { ...newEvent("random"), random_scenes: ["a", "b"] };
    const proj = story({ start: [branch("maybe", null), rnd], maybe: [], a: [], b: [jump("end")], end: [] });
    expect(steps(findRoute(proj, "maybe"))).toEqual(["start@0"]);
    expect(steps(findRoute(proj, "end"))).toEqual(["start@1", "b@0"]);
  });

  it("carries on past an if without an else and a menu option that doesn't jump", () => {
    const proj = story({ start: [branch("a", null), menu("a", null), jump("b")], a: [], b: [] });
    expect(steps(findRoute(proj, "b"))).toEqual(["start@2"]);
  });

  it("ignores what comes after a jump, which can never run", () => {
    const proj = story({ start: [jump("a"), jump("b")], a: [jump("b")], b: [] });
    expect(steps(findRoute(proj, "b"))).toEqual(["start@0", "a@0"]);
  });

  it("ignores what comes after an if/else, a menu whose every option jumps, and a random branch", () => {
    const rnd = { ...newEvent("random"), random_scenes: ["x"] };
    for (const leave of [branch("x", "x"), menu("x", "x"), rnd]) {
      const proj = story({ start: [leave, jump("b")], x: [jump("y")], y: [jump("b")], b: [] });
      expect(steps(findRoute(proj, "b"))).toEqual(["start@0", "x@0", "y@0"]);
    }
  });

  it("starts from a scene nothing leads to when the start scene can't get there", () => {
    const proj = story({ start: [say("Alone")], prologue: [jump("chapter")], chapter: [] });
    expect(steps(findRoute(proj, "chapter"))).toEqual(["prologue@0"]);
  });

  it("is null when nothing leads to the scene", () => {
    const proj = story({ start: [], a: [jump("b")], b: [jump("a")] });
    expect(findRoute(proj, "b")).toBeNull();
    expect(findRoute(proj, "missing")).toBeNull();
  });
});

// ─── replayTo ─────────────────────────────────────────────────────────────────

describe("replayTo", () => {
  const bg = { ...newEvent("bg"), bg: "park.png" };
  const img = { ...newEvent("image"), image: "cat.png" };
  const proj = story({
    start: [bg, say("Hello"), jump("middle")],
    middle: [img, menu("target", null), say("Never reached")],
    target: [say("First"), say("Second"), say("Third")],
  });
  const describeSteps = (startIdx: number) =>
    replayTo(proj, "target", startIdx).steps.map(s => (s.kind === "enter" ? `enter ${s.scene.id}` : s.event.id));

  it("runs each scene on the route up to the event that leads on", () => {
    const replay = replayTo(proj, "target");
    expect(replay.route.map(s => s.id)).toEqual(["start", "middle"]);
    expect(replay.reached).toBe(true);
    expect(describeSteps(0)).toEqual(["enter start", bg.id, proj.scenes[0].events[1].id, "enter middle", img.id]);
  });

  it("adds the start scene's own earlier lines when starting later in it", () => {
    const target = proj.scenes[2];
    expect(describeSteps(2)).toEqual([...describeSteps(0), "enter target", target.events[0].id, target.events[1].id]);
  });

  it("has nothing to run at the start scene's first line", () => {
    expect(replayTo(proj, "start").steps).toEqual([]);
  });

  it("says when no route leads to the scene", () => {
    const lonely = story({ start: [], a: [jump("b")], b: [jump("a"), say("Line")] });
    const replay = replayTo(lonely, "b", 1);
    expect(replay.reached).toBe(false);
    expect(replay.route).toEqual([]);
    // The scene's own earlier lines still run.
    expect(replay.steps.map(s => s.kind)).toEqual(["enter", "event"]);
  });
});
