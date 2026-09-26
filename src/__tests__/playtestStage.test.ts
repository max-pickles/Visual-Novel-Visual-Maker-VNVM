/**
 * playtestStage.test.ts — Tests for playtestStage.ts: how events change what
 * the Playtest shows, and the stage a replayed route starts with.
 */

import { applyEvent, emptyStage, replayStage } from "../playtestStage";
import type { Stage } from "../playtestStage";
import { replayTo } from "../routeReplay";
import { newCharacter, newEvent, newProject, newScene } from "../types";
import type { VNEvent, VNProject } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProj(): VNProject {
  const proj = newProject("Stage", "Tester");
  const eileen = newCharacter("Eileen");
  eileen.id = "eileen";
  eileen.sprites.neutral = "eileen neutral.png";
  eileen.sprites.happy = "eileen happy.png";
  const layered = newCharacter("Layers");
  layered.id = "layers";
  Object.assign(layered, { is_layered: true, layer_order: ["base", "eyes"], layered_sprites: { neutral: { eyes: "eyes.png", base: "base.png" } } });
  proj.characters.push(eileen, layered);
  return proj;
}

const ev = (type: VNEvent["type"], fields: Partial<VNEvent> = {}): VNEvent => ({ ...newEvent(type), ...fields });
const run = (proj: VNProject, events: VNEvent[], from: Stage = emptyStage()) =>
  events.reduce((stage, e) => applyEvent(stage, e, proj), from);
const shown = (stage: Stage) => [...stage.sprites.entries()].map(([tag, sp]) => `${tag}=${sp.image}`);

// ─── applyEvent ───────────────────────────────────────────────────────────────

describe("applyEvent", () => {
  const proj = makeProj();

  it("clears the sprites when the background changes, but not for a color", () => {
    const withCat = run(proj, [ev("bg", { bg: "park.png" }), ev("image", { image: "cat.png" })]);
    expect(withCat.bg).toBe("park.png");
    expect(shown(run(proj, [ev("bg", { bg: "black" })], withCat))).toEqual(["cat.png=cat.png"]);
    expect(shown(run(proj, [ev("bg", { bg: "room.png" })], withCat))).toEqual([]);
  });

  it("replaces an image whose file starts with the same word, and hides one", () => {
    const stage = run(proj, [ev("image", { image: "images/eve_sad.png" }), ev("image", { image: "bob.png" }), ev("image", { image: "eve happy.png" })]);
    // The replacement keeps its place, under Bob.
    expect(shown(stage)).toEqual(["eve=eve happy.png", "bob.png=bob.png"]);
    expect(shown(run(proj, [ev("image", { image: "bob.png", kind: "hide" })], stage))).toEqual(["eve=eve happy.png"]);
  });

  it("shows a dialogue line's speaker, and their next pose replaces it", () => {
    const first = run(proj, [ev("dialogue", { char_id: "eileen", pose: "happy", side: "left" })]);
    expect(shown(first)).toEqual(["char:eileen=eileen happy.png"]);
    expect(first.sprites.get("char:eileen")?.side).toBe("left");
    // No "sad" sprite, so it falls back to neutral, like the compiled game.
    expect(shown(run(proj, [ev("dialogue", { char_id: "eileen", pose: "sad" })], first))).toEqual(["char:eileen=eileen neutral.png"]);
  });

  it("shows a layered character's layers bottom first, and nothing for a speaker without sprites", () => {
    const stage = run(proj, [ev("dialogue", { char_id: "layers" }), ev("dialogue", { char_id: "nobody" }), ev("narration", { text: "Hm." })]);
    expect(stage.sprites.get("char:layers")?.layers).toEqual(["base.png", "eyes.png"]);
    expect(stage.sprites.size).toBe(1);
  });

  it("follows the music and the variables", () => {
    const stage = run(proj, [
      ev("music", { music: "theme.ogg" }),
      ev("setvar", { var_name: "points", var_val: "2" }),
      ev("setvar", { var_name: "points", var_val: "points + 1" }),
      ev("raw", { raw_code: "$ points += 10\n$ renpy.notify('hi')\nif points > 5:\n    $ secret = True" }),
    ]);
    expect(stage.music).toBe("theme.ogg");
    expect(stage.variables).toEqual({ points: 13 });
    expect(run(proj, [ev("music", { music: "" })], stage).music).toBeNull();
  });

  it("returns the same stage for events that don't change it", () => {
    const stage = emptyStage();
    for (const type of ["narration", "wait", "jump", "choice", "effect", "sfx", "achievement"] as const) {
      expect(applyEvent(stage, ev(type), proj)).toBe(stage);
    }
  });
});

// ─── replayStage ──────────────────────────────────────────────────────────────

describe("replayStage", () => {
  it("starts a later scene with what the route showed and set", () => {
    const proj = makeProj();
    const start = proj.scenes[0];
    const later = { ...newScene("Later"), id: "later" };
    later.events = [ev("narration", { text: "Here" })];
    proj.scenes.push(later);
    start.bg = "ignored by the playtest.png";
    start.events = [
      ev("bg", { bg: "park.png" }),
      ev("dialogue", { char_id: "eileen", pose: "happy", text: "Hi!" }),
      ev("music", { music: "theme.ogg" }),
      ev("setvar", { var_name: "met", var_val: "True" }),
      ev("jump", { scene_id: "later" }),
    ];
    const stage = replayStage(replayTo(proj, "later").steps, proj);
    expect(stage.bg).toBe("park.png");
    expect(shown(stage)).toEqual(["char:eileen=eileen happy.png"]);
    expect(stage.music).toBe("theme.ogg");
    expect(stage.variables).toEqual({ met: true });
  });
});
