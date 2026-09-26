/**
 * projectMigration.test.ts — Tests for migrateProject() in types.ts
 *
 * The editor saves a project with JSON.stringify and loads it back through
 * migrateProject, so anything the migration drops is lost for good.
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { migrateProject, newDemoProject, newCharacter } from "../types";
import type { VNProject } from "../types";

/** Simulate saveVnvProject → loadVnvProject. */
function roundTrip(proj: VNProject): VNProject {
  const { _rootPath, _filePath, ...clean } = proj;
  const raw = JSON.parse(JSON.stringify(clean)) as Record<string, unknown>;
  return migrateProject(raw, "C:/games/demo/project.vnvmaker");
}

/** A project with every optional scene, character and project field set. */
function makeFullProject(): VNProject {
  const proj = newDemoProject("Round Trip", "Tester");
  const scene = proj.scenes[0];
  scene.ending_type = "good";
  scene.description = "Synopsis";
  scene.scene_type = "screen";
  scene.thumbnail_event_id = scene.events[0].id;
  scene.thumbnail_hide_sprites = true;
  scene.color_grade = { saturation: 0.5, brightness: 0.1, contrast: 1.2, sepia: 0.3, tint: "#334466", tint_mix: 0.4 };

  const char = newCharacter("Layered");
  Object.assign(char, {
    is_layered: true,
    layer_order: ["base", "eyes"],
    layered_sprites: { neutral: { base: "base.png", eyes: "eyes.png" } },
    what_color: "#ffeeee",
    ctc: "ctc.png",
    ctc_position: "fixed",
    slow: true,
    slow_speed: 40,
    slow_abortable: false,
    text_beep: "beep.ogg",
    voice_tag: "v_layered",
    custom_font: "font.ttf",
    textbox_bg: "box.png",
    track_affection: true,
    affection_var: "layered_pts",
    affection_start: 5,
    default_pos: "left",
    default_trans: "dissolve",
    side_images: { neutral: "side.png" },
    role: "Rival",
    age: "19",
    motivations: "Win",
  });
  proj.characters.push(char);

  proj.originalLanguage = "Japanese";
  proj.sticky_notes = [{ id: "n1", text: "note", color: "yellow", x: 1, y: 2, width: 3, height: 4 }];
  proj.translations = { French: { sc1_ev0_text: "Bonjour" } };
  return proj;
}

// toMatchObject: every field that was saved must come back unchanged; the
// migration may still add defaults for fields that were never set.
describe("migrateProject – save/load round-trip", () => {
  it("keeps every scene field", () => {
    const proj = makeFullProject();
    const loaded = roundTrip(proj);
    expect(loaded.scenes).toMatchObject(proj.scenes);
  });

  it("keeps every character field", () => {
    const proj = makeFullProject();
    const loaded = roundTrip(proj);
    expect(loaded.characters).toMatchObject(proj.characters);
  });

  it("keeps project-level fields, including ones added after the migration was written", () => {
    const proj = makeFullProject();
    (proj as unknown as Record<string, unknown>).future_field = { keep: true };
    const loaded = roundTrip(proj);
    expect(loaded).toMatchObject({ ...proj, updated: expect.any(Number) });
    expect((loaded as unknown as Record<string, unknown>).future_field).toEqual({ keep: true });
  });

  it("is stable when a project is loaded and saved repeatedly", () => {
    const once = roundTrip(makeFullProject());
    const twice = roundTrip(once);
    expect({ ...twice, _filePath: undefined }).toEqual({ ...once, _filePath: undefined });
  });
});

describe("migrateProject – defaults for old or partial saves", () => {
  it("fills in missing top-level fields", () => {
    const loaded = migrateProject({ title: "Old" });
    expect(loaded.title).toBe("Old");
    expect(loaded.scenes).toEqual([]);
    expect(loaded.characters).toEqual([]);
    expect(loaded.resolution).toEqual([1920, 1080]);
    expect(loaded.text_tpls.length).toBeGreaterThan(0);
    expect(loaded.trans_tpls.length).toBeGreaterThan(0);
  });

  it("fills in missing scene and character fields", () => {
    const loaded = migrateProject({
      scenes: [{ id: "s1", events: [{ type: "narration", text: "hi" }] }],
      characters: [{ id: "c1", name: "Eileen" }],
    });
    expect(loaded.start).toBe("s1");
    expect(loaded.scenes[0]).toMatchObject({ id: "s1", label: "Scene", bg: null, music: null, scene_ids: [] });
    expect(loaded.scenes[0].events[0].id).toBeTruthy();
    expect(loaded.characters[0]).toMatchObject({ id: "c1", name: "Eileen", display: "Eileen" });
    expect(loaded.characters[0].poses.length).toBeGreaterThan(0);
  });

  it("never restores runtime-only paths from the file contents", () => {
    const loaded = migrateProject({ _rootPath: "C:/elsewhere", _filePath: "C:/elsewhere/x.vnvmaker" }, "D:/real/project.vnvmaker");
    expect(loaded._rootPath).toBeUndefined();
    expect(loaded._filePath).toBe("D:/real/project.vnvmaker");
  });
});
