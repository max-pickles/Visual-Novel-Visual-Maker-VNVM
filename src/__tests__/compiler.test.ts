/**
 * compiler.test.ts — Tests for compiler.ts
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { compileProject, compileProjectToFiles, compilePreview, compileSingleAnimationPreview, getProjectStats } from "../compiler";
import { newProject, newScene, newCharacter, newEvent, newDemoProject, newOpt } from "../types";
import type { VNProject, VNEvent, VNScene } from "../types";

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

// ─── Imported games keep their names in exports ───────────────────────────────

describe("exports of an imported game", () => {
  /** A project as the importer makes it: scenes and characters remember their Ren'Py names. */
  function imported(): VNProject {
    const proj = newProject("Question", "Tester");
    const sylvie = newCharacter("s");
    sylvie.display = "Sylvie";
    sylvie.renpy_name = "s";
    const start = newScene("start");
    start.renpy_label = "start";
    const later = newScene("later");
    later.renpy_label = "later";
    const say = newEvent("dialogue");
    say.char_id = sylvie.id;
    say.text = 'Where does the "visual" part come in?';
    const jump = newEvent("jump");
    jump.scene_id = later.id;
    start.events = [say, jump];
    proj.characters = [sylvie];
    proj.scenes = [start, later];
    proj.start = start.id;
    return proj;
  }
  const exported = (proj: VNProject, opts = {}) => compileProjectToFiles(proj, opts).map((f) => f.content).join("\n");

  it("keeps the game's labels and character variables, which its translations are keyed by", () => {
    const text = exported(imported());
    expect(text).toContain("define s = Character('Sylvie'");
    expect(text).toContain('    s "Where does the \\"visual\\" part come in?"');
    expect(text).toContain("    jump later");
    expect(text).toMatch(/^label later:$/m);
    expect(text.match(/^label start:$/gm)).toHaveLength(1); // the start scene is the entry point
    expect(text).not.toContain("vns_scene_");
  });

  it("does the same in a single-file export", () => {
    const text = compileProject(imported(), { asExport: true });
    expect(text).toContain("define s = Character('Sylvie'");
    expect(text.match(/^label start:$/gm)).toHaveLength(1);
  });

  it("falls back to generated names that are invalid or taken", () => {
    const proj = imported();
    const [start, later] = proj.scenes;
    later.renpy_label = "start"; // only the start scene may be `start`
    proj.characters[0].renpy_name = "if";
    const text = exported(proj);
    expect(text).toContain(`label vns_scene_${later.id}:`);
    expect(text).toContain(`define vnc_${proj.characters[0].id} = `);
    expect(text).toMatch(/^label start:$/m);
    expect(text).not.toContain(`vns_scene_${start.id}`);
  });

  it("doesn't reuse names the scripts it's written next to declare", () => {
    const proj = imported();
    const text = exported(proj, { declaredElsewhere: new Set(["s"]), labelsElsewhere: new Set(["later"]) });
    expect(text).toContain(`define vnc_${proj.characters[0].id} = `);
    expect(text).toContain(`label vns_scene_${proj.scenes[1].id}:`);
  });

  it("names who says a menu's prompt", () => {
    const proj = imported();
    const choice = newEvent("choice");
    choice.prompt = "Well?";
    choice.char_id = proj.characters[0].id;
    choice.opts = [{ id: "o1", text: "Yes", scene: proj.scenes[1].id }];
    proj.scenes[0].events = [choice];
    expect(exported(proj)).toContain('        s "Well?"');
  });

  it("keeps generated names in the live preview, which sits next to the game's own story", () => {
    const proj = imported();
    const text = compilePreview(proj, proj.start!);
    expect(text).toContain(`label vns_scene_${proj.scenes[0].id}:`);
    expect(text).toContain(`define vnc_${proj.characters[0].id} = `);
    expect(text).not.toMatch(/^label start:$/m);
  });
});

// ─── Live preview: the story so far ───────────────────────────────────────────

describe("compilePreview – the story so far", () => {
  /** Two scenes: `first` (the start) leads to `second` with its last event. */
  function twoScenes(...firstEvents: VNEvent[]): { proj: VNProject; first: VNScene; second: VNScene } {
    const proj = makeProj();
    const first = proj.scenes[0];
    const second = newScene("second");
    proj.scenes.push(second);
    first.events = [...firstEvents, { ...newEvent("jump"), scene_id: second.id }];
    second.events = [{ ...newEvent("narration"), text: "Here." }];
    return { proj, first, second };
  }

  /** The statements the preview runs before jumping to `sceneId`, trimmed. */
  function entry(proj: VNProject, sceneId: string): string[] {
    const text = compilePreview(proj, sceneId);
    const block = text.slice(text.indexOf("label vnv_preview_entry:\n") + "label vnv_preview_entry:\n".length);
    return block.slice(0, block.indexOf("\n\n")).split("\n").map(l => l.trimEnd()).filter(l => !l.trim().startsWith("##"));
  }

  const ev = (type: VNEvent["type"], fields: Partial<VNEvent>): VNEvent => ({ ...newEvent(type), ...fields });
  const speaker = (proj: VNProject, name: string, poses: Record<string, string>) => {
    const char = newCharacter(name);
    Object.assign(char.sprites, poses);
    proj.characters.push(char);
    return char;
  };

  it("brings back the demo's background and variables when playing from its good ending", () => {
    const proj = newDemoProject();
    const goodEnd = proj.scenes.find(s => s.label === "good_end")!;
    expect(entry(proj, goodEnd.id)).toEqual([
      '    scene expression Transform("gui/game_menu.png", fit="cover", xsize=config.screen_width, ysize=config.screen_height)',
      "    $ met_eileen = True",
      `    jump vns_scene_${goodEnd.id}`,
    ]);
  });

  it("adds nothing when playing from the start", () => {
    const proj = newDemoProject();
    expect(entry(proj, proj.start!)).toEqual([`    jump vns_scene_${proj.start}`]);
  });

  it("shows the sprites still on screen, each with its latest pose and position", () => {
    const { proj, second } = twoScenes();
    const eve = speaker(proj, "Eve", { neutral: "eve.png", happy: "eve_happy.png" });
    const bob = speaker(proj, "Bob", { neutral: "bob.png" });
    proj.scenes[0].events.unshift(
      ev("dialogue", { char_id: eve.id, pose: "neutral", side: "left", text: "Hi." }),
      ev("dialogue", { char_id: bob.id, pose: "neutral", side: "right", text: "Yo." }),
      ev("dialogue", { char_id: eve.id, pose: "happy", side: "left", text: "Yay!" }),
      ev("image", { image: "images/cat.png", side: "center", transition: "dissolve" }),
    );
    expect(entry(proj, second.id)).toEqual([
      "    show Eve happy at left",
      "    show Bob neutral at right",
      '    show expression "images/cat.png" at center',
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("replays backgrounds and images in story order, for Ren'Py to clear and replace them as it plays", () => {
    const { proj, second } = twoScenes();
    const eve = speaker(proj, "Eve", { neutral: "eve.png" });
    proj.scenes[0].events.unshift(
      ev("dialogue", { char_id: eve.id, text: "Before." }),
      ev("bg", { bg: "images/night.png", transition: "fade", atl_code: "zoom 1.1" }),
      ev("image", { image: "images/moon.png" }),
    );
    expect(entry(proj, second.id)).toEqual([
      "    show Eve neutral at center",
      '    scene expression Transform("images/night.png", fit="cover", xsize=config.screen_width, ysize=config.screen_height):',
      "        zoom 1.1",
      '    show expression "images/moon.png" at center',
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("keeps every image show, since Ren'Py versions differ on which of them replace each other", () => {
    // Ren'Py 8.4+ reads show expression "sylvie green smile" as show sylvie green smile.
    const { proj, second } = twoScenes(
      ev("image", { image: "sylvie green smile" }),
      ev("image", { image: "sylvie green surprised" }),
      ev("image", { image: "sylvie green smile" }),
    );
    expect(entry(proj, second.id)).toEqual([
      '    show expression "sylvie green smile" at center',
      '    show expression "sylvie green surprised" at center',
      '    show expression "sylvie green smile" at center',
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("keeps the latest music, looping sound and camera, and every variable change in order", () => {
    const { proj, second } = twoScenes(
      ev("music", { music: "audio/old.ogg" }),
      ev("setvar", { var_name: "points", var_val: "1" }),
      ev("sfx", { sfx: "audio/rain.ogg", loop: true }),
      ev("camera", { camera_x: 5, camera_dur: 2 }),
      ev("music", { music: "audio/theme.ogg", volume: 0.5, loop: false }),
      ev("setvar", { var_name: "points", var_val: "points + 2" }),
      ev("camera", { camera_zoom: 1.5, camera_dur: 2 }),
    );
    expect(entry(proj, second.id)).toEqual([
      "    $ points = 1",
      "    $ points = points + 2",
      "    camera:",
      "        perspective True",
      "        xpos 0 ypos 0 zpos 0 zoom 1.5",
      '    play music "audio/theme.ogg" volume 0.5 noloop',
      '    play sound "audio/rain.ogg" loop',
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("leaves out dialogue, pauses, transitions, one-off sounds, stopped music and achievements", () => {
    const { proj, second } = twoScenes(
      ev("music", { music: "audio/theme.ogg" }),
      ev("narration", { text: "Once upon a time." }),
      ev("wait", { dur: 2 }),
      ev("effect", { kind: "fade" }),
      ev("sfx", { sfx: "audio/rain.ogg", loop: true }),
      ev("sfx", { sfx: "audio/ding.ogg" }),
      ev("music", { music: "" }),
      ev("achievement", { achievement_id: "Started" }),
      ev("movie", { movie: "intro.webm" }),
    );
    expect(entry(proj, second.id)).toEqual([`    jump vns_scene_${second.id}`]);
  });

  it("follows a scene only as far as the event that leads on", () => {
    const proj = makeProj();
    const first = proj.scenes[0];
    const early = newScene("early"), late = newScene("late");
    proj.scenes.push(early, late);
    const pick = newEvent("choice");
    pick.opts = [{ ...newOpt("Early"), scene: early.id }];
    first.events = [
      ev("bg", { bg: "images/day.png" }),
      pick,
      ev("bg", { bg: "images/night.png" }),
      ev("setvar", { var_name: "late", var_val: "True" }),
      { ...newEvent("jump"), scene_id: late.id },
    ];
    expect(entry(proj, early.id).join("\n")).toContain("images/day.png");
    expect(entry(proj, early.id).join("\n")).not.toMatch(/night|\$ late/);
    expect(entry(proj, late.id)).toEqual([
      '    scene expression Transform("images/day.png", fit="cover", xsize=config.screen_width, ysize=config.screen_height)',
      '    scene expression Transform("images/night.png", fit="cover", xsize=config.screen_width, ysize=config.screen_height)',
      "    $ late = True",
      `    jump vns_scene_${late.id}`,
    ]);
  });

  it("replays raw code that only shows things or sets variables, in story order and without transitions", () => {
    const { proj, second } = twoScenes(
      ev("raw", { raw_code: "show sylvie green smile at left with dissolve" }),
      ev("raw", { raw_code: "show logo at truecenter:\n    alpha 0.5\nwith Dissolve(0.5)" }),
      ev("raw", { raw_code: "$ affection += 1" }),
      ev("raw", { raw_code: '$ route = "eileen"\n$ flags["met"] = True' }),
      ev("raw", { raw_code: '$ name = renpy.input("Name?")' }),
      ev("raw", { raw_code: '$ renpy.notify("Saved")' }),
      ev("raw", { raw_code: "show eileen happy\n$ met = True" }),
      ev("raw", { raw_code: "show expression portrait" }),
      ev("raw", { raw_code: 'show text "stay with me"' }),
    );
    expect(entry(proj, second.id)).toEqual([
      "    show sylvie green smile at left",
      "    show logo at truecenter:",
      "        alpha 0.5",
      "    $ affection += 1",
      '    $ route = "eileen"',
      '    $ flags["met"] = True',
      "    show expression portrait",
      '    show text "stay with me"',
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("doesn't merge a sprite's shows across raw code that may hide it", () => {
    const { proj, second } = twoScenes();
    const eve = speaker(proj, "Eve", { neutral: "eve.png", happy: "eve_happy.png" });
    proj.scenes[0].events.unshift(
      ev("dialogue", { char_id: eve.id, text: "Hi." }),
      ev("raw", { raw_code: "hide Eve" }),
      ev("dialogue", { char_id: eve.id, pose: "happy", text: "Back!" }),
    );
    expect(entry(proj, second.id)).toEqual([
      "    show Eve neutral at center",
      "    hide Eve",
      "    show Eve happy at center",
      `    jump vns_scene_${second.id}`,
    ]);
  });

  it("goes through every scene on the route, each with its own background and music", () => {
    const proj = makeProj();
    const [a, b, c] = [proj.scenes[0], newScene("b"), newScene("c")];
    proj.scenes.push(b, c);
    a.music = "audio/a.ogg";
    a.events = [ev("setvar", { var_name: "seen_a", var_val: "True" }), { ...newEvent("jump"), scene_id: b.id }];
    b.bg = "images/b.png";
    b.events = [{ ...newEvent("if"), condition: "seen_a", scene_true: c.id, scene_false: null }];
    expect(entry(proj, c.id)).toEqual([
      "    $ seen_a = True",
      '    scene expression Transform("images/b.png", fit="cover", xsize=config.screen_width, ysize=config.screen_height)',
      '    play music "audio/a.ogg"',
      `    jump vns_scene_${c.id}`,
    ]);
  });
});

// ─── File paths ───────────────────────────────────────────────────────────────

// The asset sidebar and browser store files relative to the project folder
// ("game/audio/door.ogg"). Ren'Py looks files up inside game/, so scripts name
// them relative to it, or Ren'Py would look in game/game/.
describe("compiled file paths", () => {
  const ev = (type: VNEvent["type"], fields: Partial<VNEvent>): VNEvent => ({ ...newEvent(type), ...fields });
  const FILL = 'fit="cover", xsize=config.screen_width, ysize=config.screen_height';

  it("are relative to the game folder for every event that shows or plays a file", () => {
    const proj = makeProj();
    proj.scenes[0].events = [
      ev("bg", { bg: "game/images/room.png" }),
      ev("image", { image: "game/images/eileen.png" }),
      ev("animation", { image: "game/images/bird.png" }),
      ev("music", { music: "game/audio/theme.ogg" }),
      ev("sfx", { sfx: "game/audio/door.ogg" }),
      ev("dialogue", { text: "Hi.", voice: "game/voice/eileen_001.ogg" }),
      ev("narration", { text: "Hello.", voice: "game/voice/narrator_001.ogg" }),
      ev("movie", { movie: "game/movies/intro.webm" }),
    ];
    const out = lines(proj);
    expect(out).toContain(`scene expression Transform("images/room.png", ${FILL})`);
    expect(out).toContain('show expression "images/eileen.png" at center');
    expect(out).toContain('show expression "images/bird.png"');
    expect(out).toContain('play music "audio/theme.ogg"');
    expect(out).toContain('play sound "audio/door.ogg"');
    expect(out).toContain('voice "voice/eileen_001.ogg"');
    expect(out).toContain('voice "voice/narrator_001.ogg"');
    expect(out).toContain('$ renpy.movie_cutscene("movies/intro.webm")');
    expect(compileProject(proj)).not.toContain('"game/');
  });

  it("are relative to the game folder for a scene's own background and music", () => {
    const proj = makeProj();
    proj.scenes[0].bg = "game/images/room.png";
    proj.scenes[0].music = "game/audio/theme.ogg";
    const out = lines(proj);
    expect(out).toContain(`scene expression Transform("images/room.png", ${FILL})`);
    expect(out).toContain('play music "audio/theme.ogg"');
  });

  it("are relative to the game folder for character sprites and side images", () => {
    const proj = makeProj();
    const eve = newCharacter("Eve");
    eve.sprites.neutral = "game/images/eve.png";
    eve.side_images = { neutral: "game/images/side eve.png" };
    const lucy = newCharacter("Lucy");
    Object.assign(lucy, { is_layered: true, layer_order: ["base", "eyes"],
      layered_sprites: { neutral: { base: "game/images/lucy base.png", eyes: "game/images/lucy eyes.png" } } });
    proj.characters.push(eve, lucy);
    const out = lines(proj);
    expect(out).toContain('image Eve neutral = "images/eve.png"');
    expect(out).toContain('image side Eve = "images/side eve.png"');
    expect(out).toContain('"images/lucy base.png",');
    expect(out).toContain('"images/lucy eyes.png",');
    expect(compileProject(proj)).not.toContain('"game/');
  });

  it("are relative to the game folder in the live preview's story so far and the animation preview", () => {
    const proj = makeProj();
    const second = newScene("second");
    proj.scenes.push(second);
    proj.scenes[0].events = [
      ev("bg", { bg: "game/images/room.png" }),
      ev("music", { music: "game/audio/theme.ogg" }),
      { ...newEvent("jump"), scene_id: second.id },
    ];
    second.events = [ev("narration", { text: "Here." })];
    const preview = compilePreview(proj, second.id);
    expect(preview).toContain(`scene expression Transform("images/room.png", ${FILL})`);
    expect(preview).toContain('play music "audio/theme.ogg"');
    expect(preview).not.toContain('"game/');

    const anim = compileSingleAnimationPreview(proj, ev("animation", { image: "game/images/bird.png" }), "game/images/room.png");
    expect(anim).toContain(`scene expression Transform("images/room.png", ${FILL})`);
    expect(anim).toContain('show expression "images/bird.png"');
  });

  it("keep paths already relative to the game folder, and drop only a leading game/", () => {
    const proj = makeProj();
    proj.scenes[0].bg = "gui/game_menu.png";
    proj.scenes[0].events = [
      ev("sfx", { sfx: "audio/door.ogg" }),
      ev("music", { music: "audio/game/theme.ogg" }),
      ev("image", { image: "game/game/eileen.png" }),
      ev("bg", { bg: "black" }),
    ];
    const out = lines(proj);
    expect(out).toContain(`scene expression Transform("gui/game_menu.png", ${FILL})`);
    expect(out).toContain('play sound "audio/door.ogg"');
    expect(out).toContain('play music "audio/game/theme.ogg"');
    expect(out).toContain('show expression "game/eileen.png" at center');
    expect(out).toContain(`scene expression Transform("black", ${FILL})`);
  });
});
