/**
 * storyRoute.test.ts — Routes through the story (storyRoute.ts) and the
 * backgrounds and music scenes inherit along them (computeSceneBgs).
 */
import { routeTo, walkStory } from "../storyRoute";
import { computeSceneBgs } from "../sceneGraphUtils";
import { newDemoProject, newEvent, newOpt, newProject, newScene } from "../types";
import type { VNEvent, VNProject, VNScene } from "../types";

/** A project whose scenes are named by `labels`; the first is the start. */
function story(...labels: string[]): VNProject & { at: Record<string, VNScene> } {
  const proj = newProject("Route", "Tester");
  proj.scenes = labels.map(l => ({ ...newScene(l), id: l }));
  proj.start = labels[0];
  return Object.assign(proj, { at: Object.fromEntries(proj.scenes.map(s => [s.id, s])) });
}

const jump = (to: string): VNEvent => ({ ...newEvent("jump"), scene_id: to });
const bg = (image: string): VNEvent => ({ ...newEvent("bg"), bg: image });
const choice = (...to: string[]): VNEvent => ({ ...newEvent("choice"), opts: to.map(id => ({ ...newOpt(id), scene: id })) });

/** The route as "scene@exit" steps. */
const route = (proj: VNProject, target: string) => routeTo(proj, target).map(s => (s.exit === undefined ? s.scene.id : `${s.scene.id}@${s.exit}`));

describe("routeTo", () => {
  it("follows jumps, choices, conditions and random branches from the start", () => {
    const p = story("start", "a", "b", "c", "d");
    p.at.start.events = [newEvent("narration"), choice("a", "b")];
    p.at.a.events = [{ ...newEvent("if"), condition: "x", scene_true: "c", scene_false: null }];
    p.at.c.events = [{ ...newEvent("random"), random_scenes: ["d"] }];
    expect(route(p, "d")).toEqual(["start@1", "a@0", "c@0", "d"]);
    expect(route(p, "b")).toEqual(["start@1", "b"]);
    expect(route(p, "start")).toEqual(["start"]);
  });

  it("takes a shortest route", () => {
    const p = story("start", "long", "longer", "end");
    p.at.start.events = [jump("long")];
    p.at.long.events = [choice("longer", "end")];
    p.at.longer.events = [jump("end")];
    expect(route(p, "end")).toEqual(["start@0", "long@0", "end"]);
  });

  it("starts at the first scene when no start is set, as the compiled game does", () => {
    const p = story("first", "second");
    p.start = null;
    p.at.first.events = [jump("second")];
    expect(route(p, "second")).toEqual(["first@0", "second"]);
  });

  it("reaches scenes the start can't get to from scenes nothing leads to", () => {
    const p = story("start", "side", "after");
    p.at.side.events = [jump("after")];
    expect(route(p, "after")).toEqual(["side@0", "after"]);
  });

  it("doesn't follow a random branch that can never be picked", () => {
    const p = story("start", "never");
    p.at.start.events = [{ ...newEvent("random"), random_scenes: ["never"], random_weights: [0] }];
    expect(route(p, "never")).toEqual(["never"]);
  });

  it("is just the scene for one the story never reaches, and empty for no scene", () => {
    const p = story("start", "a", "b");
    p.at.a.events = [jump("b")];
    p.at.b.events = [jump("a")];
    expect(route(p, "a")).toEqual(["a"]);
    expect(route(p, "missing")).toEqual([]);
  });

  it("visits each scene once, after the scene it's first reached from", () => {
    const p = story("start", "a", "b");
    p.at.start.events = [choice("a", "b")];
    p.at.a.events = [jump("b")];
    expect(walkStory(p).map(v => `${v.from?.scene.id ?? "-"}>${v.scene.id}`)).toEqual(["->start", "start>a", "start>b"]);
  });
});

describe("computeSceneBgs", () => {
  it("counts a scene's own background and music, which start with it", () => {
    const demo = newDemoProject();
    const goodEnd = demo.scenes.find(s => s.label === "good_end")!;
    const start = demo.scenes.find(s => s.label === "start")!;
    start.music = "audio/theme.ogg";
    const { effectiveBg, inheritedBg, inheritedMusic, effectiveMusic } = computeSceneBgs(demo);
    expect(inheritedBg[start.id]).toBe("gui/game_menu.png");
    expect(effectiveBg[goodEnd.id]).toBe("gui/game_menu.png");
    expect(inheritedMusic[goodEnd.id]).toBe("audio/theme.ogg");
    expect(effectiveMusic[start.id]).toBe("audio/theme.ogg");
  });

  it("gives each scene what's showing at the event that leads to it", () => {
    const p = story("start", "early", "late");
    p.at.start.events = [bg("one.png"), choice("early"), bg("two.png"), jump("late")];
    const { inheritedBg, effectiveBg } = computeSceneBgs(p);
    expect(inheritedBg.early).toBe("one.png");
    expect(inheritedBg.late).toBe("two.png");
    expect(effectiveBg.start).toBe("two.png");
  });

  it("follows random branches", () => {
    const p = story("start", "lucky");
    p.at.start.events = [bg("room.png"), { ...newEvent("random"), random_scenes: ["lucky"] }];
    expect(computeSceneBgs(p).inheritedBg.lucky).toBe("room.png");
  });
});
