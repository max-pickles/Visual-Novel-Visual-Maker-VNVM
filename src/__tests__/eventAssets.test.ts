/**
 * eventAssets.test.ts — Tests for eventAssets.ts
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { assetFieldFor, assetFieldValue, assetKindFor } from "../eventAssets";
import type { AssetKind } from "../eventAssets";
import { compileProject } from "../compiler";
import { newEvent, newProject } from "../types";
import type { EventType } from "../types";

const KINDS: AssetKind[] = ["images", "audio", "video"];

/** Event types that take no file. */
const NO_FILE: EventType[] = [
  "choice", "jump", "wait", "effect", "setvar", "if", "random", "camera", "raw", "achievement", "",
];

describe("assetFieldFor", () => {
  it("puts audio picked for an sfx event in sfx, and for a music event in music", () => {
    expect(assetFieldFor("sfx", "audio")).toBe("sfx");
    expect(assetFieldFor("music", "audio")).toBe("music");
  });

  it("puts audio picked for a dialogue or narration line in voice", () => {
    expect(assetFieldFor("dialogue", "audio")).toBe("voice");
    expect(assetFieldFor("narration", "audio")).toBe("voice");
  });

  it("puts images in bg for a background and in image for a sprite or animation", () => {
    expect(assetFieldFor("bg", "images")).toBe("bg");
    expect(assetFieldFor("image", "images")).toBe("image");
    expect(assetFieldFor("animation", "images")).toBe("image");
  });

  it("puts a video picked for a movie event in movie", () => {
    expect(assetFieldFor("movie", "video")).toBe("movie");
  });

  it("ignores a kind of file the event doesn't take", () => {
    expect(assetFieldFor("movie", "images")).toBeNull();
    expect(assetFieldFor("bg", "audio")).toBeNull();
    expect(assetFieldFor("bg", "video")).toBeNull();
    expect(assetFieldFor("image", "audio")).toBeNull();
    expect(assetFieldFor("music", "images")).toBeNull();
    expect(assetFieldFor("sfx", "video")).toBeNull();
    expect(assetFieldFor("dialogue", "images")).toBeNull();
  });

  it("ignores every file picked for an event that takes none", () => {
    for (const type of NO_FILE) {
      for (const kind of KINDS) expect(assetFieldFor(type, kind), `${type || "(empty)"} + ${kind}`).toBeNull();
    }
  });
});

describe("assetKindFor", () => {
  it("names the kind of file an event takes", () => {
    expect(assetKindFor("bg")).toBe("images");
    expect(assetKindFor("animation")).toBe("images");
    expect(assetKindFor("movie")).toBe("video");
    expect(assetKindFor("sfx")).toBe("audio");
    expect(assetKindFor("narration")).toBe("audio");
  });

  it("is null for events that take no file", () => {
    for (const type of NO_FILE) expect(assetKindFor(type), type || "(empty)").toBeNull();
  });
});

describe("assetFieldValue", () => {
  it("stores the path as listed, relative to the project folder", () => {
    expect(assetFieldValue("sfx", "game/audio/door.ogg")).toBe("game/audio/door.ogg");
    expect(assetFieldValue("music", "game/audio/theme.ogg")).toBe("game/audio/theme.ogg");
    expect(assetFieldValue("bg", "game/images/room.png")).toBe("game/images/room.png");
    expect(assetFieldValue("movie", "game/movies/intro.webm")).toBe("game/movies/intro.webm");
  });

  it("stores voice files relative to game/, as the Voice Director does", () => {
    expect(assetFieldValue("voice", "game/voice/eileen_001.ogg")).toBe("voice/eileen_001.ogg");
    expect(assetFieldValue("voice", "game/game/line.ogg")).toBe("game/line.ogg");
    expect(assetFieldValue("voice", "voice/eileen_001.ogg")).toBe("voice/eileen_001.ogg");
  });
});

// The fields must be the ones the compiler reads, or a picked file never reaches the game.
describe("a file picked for an event is compiled", () => {
  const picks: [EventType, AssetKind, string][] = [
    ["bg", "images", "game/images/room.png"],
    ["image", "images", "game/images/eileen.png"],
    ["animation", "images", "game/images/bird.png"],
    ["movie", "video", "game/movies/intro.webm"],
    ["music", "audio", "game/audio/theme.ogg"],
    ["sfx", "audio", "game/audio/door.ogg"],
    ["dialogue", "audio", "game/voice/eileen_001.ogg"],
    ["narration", "audio", "game/voice/narrator_001.ogg"],
  ];

  it.each(picks)("%s event, %s file", (type, kind, path) => {
    const field = assetFieldFor(type, kind);
    expect(field).not.toBeNull();
    const ev = newEvent(type);
    const value = assetFieldValue(field!, path);
    ev[field!] = value;
    const proj = newProject("Test", "Tester");
    proj.scenes[0].events = [ev];
    expect(compileProject(proj)).toContain(`"${value}"`);
  });
});
