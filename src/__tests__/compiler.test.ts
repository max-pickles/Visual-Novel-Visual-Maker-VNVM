/**
 * compiler.test.ts — Tests for compiler.ts
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { compileProject, getProjectStats } from "../compiler";
import { newProject, newScene, newCharacter, newEvent } from "../types";
import type { VNProject, VNScene, VNCharacter } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid project with one empty scene. */
function makeProj(): VNProject {
  const proj = newProject("Test", "Tester");
  proj.scenes[0].events = [];
  return proj;
}

/** Return the compiled output as an array of non-empty, trimmed lines. */
function lines(proj: VNProject, asExport = false): string[] {
  return compileProject(proj, { asExport })
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Find the first line that starts with `prefix`. */
function find(proj: VNProject, prefix: string, asExport = false): string | undefined {
  return lines(proj, asExport).find((l) => l.startsWith(prefix));
}

// ─── Banner & header ──────────────────────────────────────────────────────────

describe("compileProject – header", () => {
  it("includes the project title in the banner", () => {
    const proj = makeProj();
    proj.title = "My Novel";
    const out = compileProject(proj);
    expect(out).toContain("AUTO-GENERATED SCRIPT: My Novel");
  });

  it("includes the author in the banner", () => {
    const proj = makeProj();
    proj.author = "Jane";
    expect(compileProject(proj)).toContain("AUTHOR: Jane");
  });

  it("emits the resolution init python block", () => {
    const proj = makeProj();
    proj.resolution = [1280, 720];
    const ls = lines(proj);
    expect(ls).toContain("config.screen_width  = 1280");
    expect(ls).toContain("config.screen_height = 720");
  });
});

// ─── Characters ───────────────────────────────────────────────────────────────

describe("compileProject – characters", () => {
  it("emits a define line for each character", () => {
    const proj = makeProj();
    const char = newCharacter("Eileen");
    char.display = "Eileen";
    char.color = "#ff0000";
    proj.characters.push(char);
    const out = compileProject(proj);
    expect(out).toContain(`define vnc_${char.id} = Character('Eileen', color='#ff0000')`);
  });

  it("emits no character block when characters array is empty", () => {
    const proj = makeProj();
    proj.characters = [];
    expect(compileProject(proj)).not.toContain("define vnc_");
  });
});

// ─── Entry point ──────────────────────────────────────────────────────────────

describe("compileProject – entry point", () => {
  it("emits label start: when asExport is true", () => {
    const proj = makeProj();
    const ls = lines(proj, true);
    expect(ls).toContain("label start:");
  });

  it("emits project-scoped label when asExport is false", () => {
    const proj = makeProj();
    const out = compileProject(proj, { asExport: false });
    expect(out).toMatch(/label vns_.+_start:/);
  });

  it("entry point jumps to the start scene", () => {
    const proj = makeProj();
    const startId = proj.start!;
    const out = compileProject(proj);
    expect(out).toContain(`jump vns_scene_${startId}`);
  });
});

// ─── Story variables ──────────────────────────────────────────────────────────

describe("compileProject – story variables", () => {
  it("emits default lines for discovered setvar variables", () => {
    const proj = makeProj();
    const scene = proj.scenes[0];
    const ev = newEvent("setvar");
    ev.var_name = "points";
    ev.var_val = "0";
    scene.events.push(ev);
    expect(compileProject(proj)).toContain("default points = 0");
  });

  it("emits no variables block when no setvars exist", () => {
    const proj = makeProj();
    expect(compileProject(proj)).not.toContain("default ");
  });
});

// ─── Scene label ──────────────────────────────────────────────────────────────

describe("compileProject – scene structure", () => {
  it("emits label vns_scene_<id>: for each scene", () => {
    const proj = makeProj();
    const sc = proj.scenes[0];
    expect(compileProject(proj)).toContain(`label vns_scene_${sc.id}:`);
  });

  it("emits scene-level bg as scene expression Transform(...)", () => {
    const proj = makeProj();
    proj.scenes[0].bg = "bg_forest.png";
    expect(compileProject(proj)).toContain('scene expression Transform("bg_forest.png"');
  });

  it("emits scene-level music as play music", () => {
    const proj = makeProj();
    proj.scenes[0].music = "theme.ogg";
    expect(compileProject(proj)).toContain('play music "theme.ogg"');
  });

  it("emits pass for an empty scene", () => {
    const proj = makeProj();
    proj.scenes[0].events = [];
    const ls = lines(proj);
    expect(ls).toContain("pass");
  });

  it("always ends a scene with return", () => {
    const proj = makeProj();
    const out = compileProject(proj);
    expect(out).toContain("    return");
  });
});

// ─── Per-event types ──────────────────────────────────────────────────────────

describe("compileProject – bg event", () => {
  it("emits scene expression Transform for a bg event", () => {
    const proj = makeProj();
    const ev = newEvent("bg");
    ev.bg = "city.png";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('scene expression Transform("city.png"');
  });

  it("skips bg event with empty bg string", () => {
    const proj = makeProj();
    const ev = newEvent("bg");
    ev.bg = "";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).not.toContain("scene expression");
  });

  it("emits ATL block when atl_code is set", () => {
    const proj = makeProj();
    const ev = newEvent("bg");
    ev.bg = "sky.png";
    ev.atl_code = "    zoom 1.1";
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("scene expression Transform");
    expect(out).toContain("zoom 1.1");
  });
});

describe("compileProject – image event", () => {
  it("emits show expression at side", () => {
    const proj = makeProj();
    const ev = newEvent("image");
    ev.image = "char_happy.png";
    ev.side = "left";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('show expression "char_happy.png" at left');
  });

  it("skips image event with empty image string", () => {
    const proj = makeProj();
    const ev = newEvent("image");
    ev.image = "";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).not.toContain("show expression");
  });
});

describe("compileProject – music event", () => {
  it("emits play music for a non-empty music path", () => {
    const proj = makeProj();
    const ev = newEvent("music");
    ev.music = "bgm.ogg";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('play music "bgm.ogg"');
  });

  it("emits stop music fadeout when music path is empty", () => {
    const proj = makeProj();
    const ev = newEvent("music");
    ev.music = "";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("stop music fadeout 0.5");
  });
});

describe("compileProject – sfx event", () => {
  it("emits play sound", () => {
    const proj = makeProj();
    const ev = newEvent("sfx");
    ev.sfx = "click.wav";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('play sound "click.wav"');
  });

  it("skips sfx event with empty sfx string", () => {
    const proj = makeProj();
    const ev = newEvent("sfx");
    ev.sfx = "";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).not.toContain("play sound");
  });
});

describe("compileProject – narration event", () => {
  it("emits a bare quoted string", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = "The rain fell softly.";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('"The rain fell softly."');
  });

  it("escapes double-quotes inside narration text", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = 'She said "hello".';
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('She said \\"hello\\"');
  });
});

describe("compileProject – dialogue event", () => {
  it("emits character reference followed by text", () => {
    const proj = makeProj();
    const char = newCharacter("Alice");
    proj.characters.push(char);
    const ev = newEvent("dialogue");
    ev.char_id = char.id;
    ev.text = "Hello!";
    ev.side = "center";
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain(`vnc_${char.id} "Hello!"`);
  });

  it("falls back to narrator when char_id is null", () => {
    const proj = makeProj();
    const ev = newEvent("dialogue");
    ev.char_id = null;
    ev.text = "Narrator speaks.";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('narrator "Narrator speaks."');
  });

  it("emits show expression for a character with a sprite", () => {
    const proj = makeProj();
    const char = newCharacter("Bob");
    char.sprites["neutral"] = "bob_neutral.png";
    proj.characters.push(char);
    const ev = newEvent("dialogue");
    ev.char_id = char.id;
    ev.pose = "neutral";
    ev.side = "right";
    ev.text = "Hi.";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('show Bob neutral at right');
  });
});

describe("compileProject – choice event", () => {
  it("emits menu: block with options", () => {
    const proj = makeProj();
    const sc2 = newScene("end");
    proj.scenes.push(sc2);
    proj.layout[sc2.id] = [400, 200];

    const ev = newEvent("choice");
    ev.prompt = "What do you choose?";
    ev.opts = [
      { id: "o1", text: "Option A", scene: sc2.id },
      { id: "o2", text: "Option B", scene: null },
    ];
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("menu:");
    expect(out).toContain('"What do you choose?"');
    expect(out).toContain('"Option A":');
    expect(out).toContain(`jump vns_scene_${sc2.id}`);
    expect(out).toContain('"Option B":');
    expect(out).toContain("pass");
  });

  it("emits a condition guard on choice options that have one", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "Secret", scene: null, condition: "has_key" }];
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('"Secret" if has_key:');
  });

  it("emits just the prompt as narration when no options exist", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.prompt = "Hmm.";
    ev.opts = [];
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain('"Hmm."');
  });
});

describe("compileProject – jump event", () => {
  it("emits with <transition> then jump vns_scene_<id>", () => {
    const proj = makeProj();
    const sc2 = newScene("end");
    proj.scenes.push(sc2);
    const ev = newEvent("jump");
    ev.scene_id = sc2.id;
    ev.transition = "fade";
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("with fade");
    expect(out).toContain(`jump vns_scene_${sc2.id}`);
  });

  it("omits with line when transition is none", () => {
    const proj = makeProj();
    const sc2 = newScene("end");
    proj.scenes.push(sc2);
    const ev = newEvent("jump");
    ev.scene_id = sc2.id;
    ev.transition = "none";
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).not.toContain("with none");
    expect(out).toContain(`jump vns_scene_${sc2.id}`);
  });

  it("emits nothing when jump has no target", () => {
    const proj = makeProj();
    const ev = newEvent("jump");
    ev.scene_id = null;
    proj.scenes[0].events.push(ev);
    // The only jump should be from the entry point, not a scene jump
    const jumpLines = compileProject(proj).split("\n").filter(l => l.includes("jump vns_scene_"));
    // Only the entry-point jump should exist
    expect(jumpLines.length).toBe(1);
  });
});

describe("compileProject – wait event", () => {
  it("emits pause <dur>", () => {
    const proj = makeProj();
    const ev = newEvent("wait");
    ev.dur = 2.5;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("pause 2.5");
  });
});

describe("compileProject – effect event", () => {
  it("dissolve → with Dissolve(...)", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "dissolve";
    ev.dur = 0.5;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("with Dissolve(0.5)");
  });

  it("fade → with Fade(...)", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "fade";
    ev.dur = 1.0;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("with Fade(1, 0.0, 1)");
  });

  it("flash → with Fade(..., color='#fff')", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "flash";
    ev.dur = 0.3;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("color='#fff'");
  });

  it("pixellate → with Pixellate(...)", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "pixellate";
    ev.dur = 0.4;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("with Pixellate(");
  });

  it("none → emits nothing", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "none";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).not.toContain("with none");
  });

  it("unknown kind → bare with <kind>", () => {
    const proj = makeProj();
    const ev = newEvent("effect");
    ev.kind = "my_custom_atl";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("with my_custom_atl");
  });
});

describe("compileProject – setvar event", () => {
  it("emits $ var = val", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "score";
    ev.var_val = "10";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("$ score = 10");
  });

  it("defaults to 'var' when var_name is empty", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "";
    ev.var_val = "True";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("$ var = True");
  });
});

describe("compileProject – if event", () => {
  it("emits if condition with true and false branches", () => {
    const proj = makeProj();
    const trueScene = newScene("good_end");
    const falseScene = newScene("bad_end");
    proj.scenes.push(trueScene, falseScene);

    const ev = newEvent("if");
    ev.condition = "has_key";
    ev.scene_true = trueScene.id;
    ev.scene_false = falseScene.id;
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("if has_key:");
    expect(out).toContain(`jump vns_scene_${trueScene.id}`);
    expect(out).toContain("else:");
    expect(out).toContain(`jump vns_scene_${falseScene.id}`);
  });

  it("emits pass when scene_true is null", () => {
    const proj = makeProj();
    const ev = newEvent("if");
    ev.condition = "flag";
    ev.scene_true = null;
    ev.scene_false = null;
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("if flag:");
    expect(out).toContain("pass");
    expect(out).not.toContain("else:");
  });

  it("defaults condition to True when empty", () => {
    const proj = makeProj();
    const ev = newEvent("if");
    ev.condition = "";
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("if True:");
  });
});

describe("compileProject – auto-advance (duration)", () => {
  it("appends pause after a non-wait event with duration > 0", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = "Auto text.";
    (ev as any).duration = 3;
    proj.scenes[0].events.push(ev);
    expect(compileProject(proj)).toContain("pause 3");
  });

  it("does not append pause when duration is 0", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = "No auto.";
    (ev as any).duration = 0;
    proj.scenes[0].events.push(ev);
    // The only pause would need to come from somewhere explicit
    expect(compileProject(proj)).not.toContain("pause 0");
  });
});

// ─── getProjectStats ──────────────────────────────────────────────────────────

describe("getProjectStats", () => {
  it("returns correct scene count", () => {
    const proj = makeProj();
    proj.scenes.push(newScene("s2"), newScene("s3"));
    expect(getProjectStats(proj).scenes).toBe(3);
  });

  it("counts all non-empty events", () => {
    const proj = makeProj();
    proj.scenes[0].events.push(newEvent("narration"), newEvent("dialogue"), newEvent("jump"));
    expect(getProjectStats(proj).events).toBe(3);
  });

  it("counts dialogue and narration as dialogueLines", () => {
    const proj = makeProj();
    proj.scenes[0].events.push(newEvent("dialogue"), newEvent("narration"), newEvent("wait"));
    expect(getProjectStats(proj).dialogueLines).toBe(2);
  });

  it("counts choice events", () => {
    const proj = makeProj();
    proj.scenes[0].events.push(newEvent("choice"), newEvent("choice"));
    expect(getProjectStats(proj).choices).toBe(2);
  });

  it("counts music events", () => {
    const proj = makeProj();
    proj.scenes[0].events.push(newEvent("music"), newEvent("sfx"));
    expect(getProjectStats(proj).music).toBe(1);
  });

  it("counts characters", () => {
    const proj = makeProj();
    proj.characters.push(newCharacter("A"), newCharacter("B"));
    expect(getProjectStats(proj).characters).toBe(2);
  });

  it("returns zeros for an empty project", () => {
    const proj = makeProj();
    proj.scenes[0].events = [];
    const stats = getProjectStats(proj);
    expect(stats.events).toBe(0);
    expect(stats.dialogueLines).toBe(0);
    expect(stats.choices).toBe(0);
    expect(stats.music).toBe(0);
  });
});
