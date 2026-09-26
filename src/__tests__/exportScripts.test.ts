/**
 * exportScripts.test.ts — Tests for exportScripts.ts
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { isGeneratedScript, isReplacedByExport } from "../exportScripts";

describe("isGeneratedScript", () => {
  it("matches the compiled story, scene files and the preview script", () => {
    expect(isGeneratedScript("game/script.rpy")).toBe(true);
    expect(isGeneratedScript("game/scene_ab12cd34.rpy")).toBe(true);
    expect(isGeneratedScript("game/vnv_preview.rpy")).toBe(true);
    expect(isGeneratedScript("game\\scene_x.rpy")).toBe(true);
  });

  it("does not match other scripts", () => {
    expect(isGeneratedScript("game/inventory.rpy")).toBe(false);
    expect(isGeneratedScript("game/tl/french/script.rpy")).toBe(false);
    expect(isGeneratedScript("game/story/scene_x.rpy")).toBe(false);
  });
});

describe("isReplacedByExport", () => {
  it("always keeps config, screens and dashboard translations", () => {
    for (const imported of [undefined, [], ["game/gui.rpy", "game/screens.rpy"]]) {
      expect(isReplacedByExport("game/gui.rpy", imported)).toBe(false);
      expect(isReplacedByExport("game/options.rpy", imported)).toBe(false);
      expect(isReplacedByExport("game/screens.rpy", imported)).toBe(false);
      expect(isReplacedByExport("game/tl/french/vnv_translations.rpy", imported)).toBe(false);
    }
  });

  it("always replaces generated scripts", () => {
    expect(isReplacedByExport("game/script.rpy", [])).toBe(true);
    expect(isReplacedByExport("game/scene_ab12.rpy", [])).toBe(true);
  });

  it("keeps hand-written scripts in projects that weren't imported", () => {
    expect(isReplacedByExport("game/inventory.rpy", [])).toBe(false);
    expect(isReplacedByExport("game/lib/utils.rpy", [])).toBe(false);
  });

  it("replaces the story scripts an imported game brought in, and keeps ones added later", () => {
    const imported = ["game/script.rpy", "game/chapter1.rpy", "game/tl/french/script.rpy"];
    expect(isReplacedByExport("game/chapter1.rpy", imported)).toBe(true);
    expect(isReplacedByExport("game/added_later.rpy", imported)).toBe(false);
  });

  it("keeps an imported game's translations and other scripts that aren't story", () => {
    const imported = [
      "game/script.rpy", "game/tl/french/script.rpy", "game/tl/french/common.rpy",
      "game/styles.rpy", "game/testcases.rpy",
    ];
    for (const tracked of [imported, undefined]) {
      expect(isReplacedByExport("game/tl/french/script.rpy", tracked)).toBe(false);
      expect(isReplacedByExport("game/tl/french/common.rpy", tracked)).toBe(false);
      expect(isReplacedByExport("game/styles.rpy", tracked)).toBe(false);
      expect(isReplacedByExport("game/testcases.rpy", tracked)).toBe(false);
    }
  });

  it("replaces every other story script for projects saved before imports were tracked", () => {
    expect(isReplacedByExport("game/chapter1.rpy", undefined)).toBe(true);
    expect(isReplacedByExport("game/inventory.rpy", undefined)).toBe(true);
  });
});
