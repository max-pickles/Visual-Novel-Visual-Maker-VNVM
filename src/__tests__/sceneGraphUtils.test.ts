/**
 * sceneGraphUtils.test.ts — Tests for computeSceneBgs: the backgrounds, sprites
 * and music the editor's scene previews, thumbnails and Graph panel show, which
 * follow the same routes through the story as the live preview.
 */

import { computeSceneBgs } from "../sceneGraphUtils";
import { findRoute } from "../routeReplay";
import { newDemoProject, newEvent, newProject, newScene } from "../types";
import type { VNEvent, VNProject } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A project with scenes whose ids are the given names; the first is the start. */
function story(scenes: Record<string, VNEvent[]>): VNProject {
  const proj = newProject("Scenes", "Tester");
  proj.scenes = Object.entries(scenes).map(([id, events]) => ({ ...newScene(id), id, events }));
  proj.start = proj.scenes[0].id;
  return proj;
}

const bg = (image: string): VNEvent => ({ ...newEvent("bg"), bg: image });
const show = (image: string): VNEvent => ({ ...newEvent("image"), image });
const music = (track: string): VNEvent => ({ ...newEvent("music"), music: track });
const jump = (to: string): VNEvent => ({ ...newEvent("jump"), scene_id: to });
const menu = (...targets: (string | null)[]): VNEvent => ({
  ...newEvent("choice"),
  opts: targets.map((scene, i) => ({ id: `o${i}`, text: `Option ${i}`, scene })),
});

// ─── computeSceneBgs ──────────────────────────────────────────────────────────

describe("computeSceneBgs", () => {
  it("counts a scene's own background and music, which start with it", () => {
    const demo = newDemoProject();
    const start = demo.scenes.find(s => s.label === "start")!;
    const goodEnd = demo.scenes.find(s => s.label === "good_end")!;
    start.music = "audio/theme.ogg";
    const { effectiveBg, inheritedBg, effectiveMusic, inheritedMusic } = computeSceneBgs(demo);
    expect(inheritedBg[start.id]).toBe("gui/game_menu.png");
    expect(effectiveBg[goodEnd.id]).toBe("gui/game_menu.png");
    expect(effectiveMusic[start.id]).toBe("audio/theme.ogg");
    expect(inheritedMusic[goodEnd.id]).toBe("audio/theme.ogg");
  });

  it("gives each scene what's showing and playing at the event that leads to it", () => {
    const proj = story({
      start: [
        bg("one.png"), show("cat.png"), music("calm.ogg"), menu("early", null),
        bg("two.png"), show("dog.png"), music("tense.ogg"), jump("late"),
      ],
      early: [],
      late: [],
    });
    const { inheritedBg, inheritedSprite, inheritedMusic, effectiveBg } = computeSceneBgs(proj);
    expect([inheritedBg.early, inheritedSprite.early, inheritedMusic.early]).toEqual(["one.png", "cat.png", "calm.ogg"]);
    expect([inheritedBg.late, inheritedSprite.late, inheritedMusic.late]).toEqual(["two.png", "dog.png", "tense.ogg"]);
    expect(effectiveBg.start).toBe("two.png");
  });

  it("follows random branches", () => {
    const proj = story({
      start: [bg("room.png"), { ...newEvent("random"), random_scenes: ["lucky"] }],
      lucky: [],
    });
    expect(computeSceneBgs(proj).inheritedBg.lucky).toBe("room.png");
  });

  it("inherits along the route the live preview replays, from the start scene when it gets there", () => {
    const proj = story({
      start: [bg("start.png"), jump("hall")],
      hall: [bg("hall.png"), jump("target")],
      target: [],
      side: [bg("side.png"), jump("target")],
    });
    expect(findRoute(proj, "target")?.map(r => r.scene.id)).toEqual(["start", "hall"]);
    expect(computeSceneBgs(proj).inheritedBg.target).toBe("hall.png");
  });

  it("reaches other scenes from the scenes nothing leads to, and starts the rest with nothing", () => {
    const proj = story({
      start: [bg("start.png")],
      side: [bg("side.png"), jump("after")],
      after: [],
      loopA: [jump("loopB")],
      loopB: [bg("b.png"), jump("loopA")],
    });
    const { inheritedBg, effectiveBg } = computeSceneBgs(proj);
    expect(inheritedBg.after).toBe("side.png");
    expect(inheritedBg.loopA).toBeNull();
    expect(effectiveBg.loopB).toBe("b.png");
  });
});
