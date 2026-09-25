/**
 * compilerRenpySyntax.test.ts — Inputs that used to produce invalid Ren'Py.
 *
 * Covers string escaping in Character(), image names built from character and
 * pose names, variable defaults, camera rotation, and the matching validator
 * rules.
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { compileProject, compilePreview, charImageTag, imageNameComponent } from "../compiler";
import { newProject, newCharacter, newEvent, extractVars, conditionVarNames } from "../types";
import { validateProject } from "../validator";
import type { VNProject, VNCharacter } from "../types";

function makeProj(): VNProject {
  const proj = newProject("Test", "Tester");
  proj.scenes[0].events = [];
  return proj;
}

function addSpeaker(proj: VNProject, name: string, sprite = "sprite.png"): VNCharacter {
  const char = newCharacter(name);
  char.sprites.neutral = sprite;
  proj.characters.push(char);
  const ev = newEvent("dialogue");
  ev.char_id = char.id;
  ev.text = "Hi.";
  proj.scenes[0].events.push(ev);
  return char;
}

function setvar(proj: VNProject, name: string, value: string): void {
  const ev = newEvent("setvar");
  ev.var_name = name;
  ev.var_val = value;
  proj.scenes[0].events.push(ev);
}

function ifEvent(proj: VNProject, condition: string): void {
  const ev = newEvent("if");
  ev.condition = condition;
  proj.scenes[0].events.push(ev);
}

function defaults(proj: VNProject): Record<string, string> {
  return Object.fromEntries(extractVars(proj).map(v => [v.name, v.default_val]));
}

// ─── Character() arguments ────────────────────────────────────────────────────

describe("character definitions", () => {
  it("escapes quotes and backslashes in the display name", () => {
    const proj = makeProj();
    const char = newCharacter("OBrien");
    char.display = "O'Brien \\ Co";
    proj.characters.push(char);
    expect(compileProject(proj)).toContain(`Character('O\\'Brien \\\\ Co', color='#c8d0ff')`);
  });

  it("escapes name and dialogue prefixes and suffixes", () => {
    const proj = makeProj();
    const char = newCharacter("Eileen");
    char.name_prefix = "'";
    char.dialogue_suffix = "it's";
    proj.characters.push(char);
    const out = compileProject(proj);
    expect(out).toContain(`who_prefix='\\''`);
    expect(out).toContain(`what_suffix='it\\'s'`);
  });

  it("leaves out a color Ren'Py would reject", () => {
    const proj = makeProj();
    const char = newCharacter("Eileen");
    char.color = "pinkish";
    proj.characters.push(char);
    expect(compileProject(proj)).toContain(`define vnc_${char.id} = Character('Eileen')`);
  });
});

// ─── Image names ──────────────────────────────────────────────────────────────

describe("image names", () => {
  it("keeps simple names unchanged", () => {
    expect(imageNameComponent("Eileen")).toBe("Eileen");
    expect(imageNameComponent("sakura_2")).toBe("sakura_2");
    expect(imageNameComponent("さくら")).toBe("さくら");
  });

  it("replaces spaces and punctuation", () => {
    expect(imageNameComponent("Dr. O'Brien")).toBe("Dr_O_Brien");
    expect(imageNameComponent("Mary  Jane")).toBe("Mary_Jane");
    expect(imageNameComponent("very happy!")).toBe("very_happy");
  });

  it("never produces a statement keyword", () => {
    expect(imageNameComponent("at")).toBe("at_");
    expect(imageNameComponent("with")).toBe("with_");
  });

  it("falls back to the character id when the name has nothing usable", () => {
    const char = newCharacter("???");
    expect(charImageTag(char)).toBe(`char_${char.id}`);
  });

  it("uses the same valid tag for the sprite definition and the show statement", () => {
    const proj = makeProj();
    addSpeaker(proj, "Dr. O'Brien", "obrien.png");
    const out = compileProject(proj);
    expect(out).toContain(`image Dr_O_Brien neutral = "obrien.png"`);
    expect(out).toContain(`show Dr_O_Brien neutral at center`);
    expect(out).not.toMatch(/O'Brien neutral/);
  });

  it("sanitizes pose names", () => {
    const proj = makeProj();
    const char = addSpeaker(proj, "Eileen");
    char.poses.push("very happy");
    char.sprites["very happy"] = "eileen_vh.png";
    proj.scenes[0].events[0].pose = "very happy";
    const out = compileProject(proj);
    expect(out).toContain(`image Eileen very_happy = "eileen_vh.png"`);
    expect(out).toContain(`show Eileen very_happy at center`);
  });

  it("uses the tag for side images", () => {
    const proj = makeProj();
    const char = addSpeaker(proj, "Dr. O'Brien");
    char.side_images = { neutral: "side.png", sad: "side_sad.png", happy: "" };
    const out = compileProject(proj);
    expect(out).toContain(`image='Dr_O_Brien'`);
    expect(out).toContain(`image side Dr_O_Brien = "side.png"`);
    expect(out).toContain(`image side Dr_O_Brien sad = "side_sad.png"`);
    expect(out).not.toContain(`image side Dr_O_Brien happy`);
  });

  it("falls back to center for an invalid position", () => {
    const proj = makeProj();
    addSpeaker(proj, "Eileen");
    proj.scenes[0].events[0].side = "left side" as never;
    expect(compileProject(proj)).toContain("show Eileen neutral at center");
  });

  it("keeps the normal main menu in the preview file written on save", () => {
    const proj = makeProj();
    const out = compilePreview(proj, "main_menu");
    expect(out).not.toContain("label main_menu:");
    expect(out).toContain(`define config.label_overrides = {"start": "vnv_preview_entry"}`);
    expect(out).toContain(`jump vns_scene_${proj.start}`);
  });

  it("defines sprite images in the live preview too", () => {
    const proj = makeProj();
    addSpeaker(proj, "Bob", "bob.png");
    const out = compilePreview(proj, proj.scenes[0].id);
    expect(out).toContain(`image Bob neutral = "bob.png"`);
    expect(out).toContain("show Bob neutral at center");
  });
});

// ─── Variable defaults ────────────────────────────────────────────────────────

describe("variable defaults", () => {
  it("starts flags as False even when the only assignment sets them to True", () => {
    const proj = makeProj();
    setvar(proj, "met_eileen", "True");
    expect(defaults(proj)).toEqual({ met_eileen: "False" });
    expect(compileProject(proj)).toContain("default met_eileen = False");
  });

  it("gives counters a numeric default instead of their own expression", () => {
    const proj = makeProj();
    setvar(proj, "points", "points + 1");
    expect(defaults(proj)).toEqual({ points: "0" });
    expect(compileProject(proj)).not.toContain("default points = points");
  });

  it("infers strings, lists, dicts and falls back to None", () => {
    const proj = makeProj();
    setvar(proj, "name", '"Bob"');
    setvar(proj, "items", '["key"]');
    setvar(proj, "flags", "{}");
    setvar(proj, "roll", "renpy.random.randint(1, 6)");
    expect(defaults(proj)).toEqual({ name: '""', items: "[]", flags: "{}", roll: "None" });
  });

  it("uses the first assignment whose type is known", () => {
    const proj = makeProj();
    setvar(proj, "score", "bonus_total");
    setvar(proj, "score", "10");
    expect(defaults(proj).score).toBe("0");
  });

  it("does not declare Ren'Py objects, builtins, attributes or words inside strings", () => {
    const proj = makeProj();
    ifEvent(proj, 'persistent.seen_end and len(inventory) > 0 and renpy.seen_label("x") and name == "Bob" and total > 1e5');
    expect(defaults(proj)).toEqual({ inventory: "False", name: "False", total: "False" });
    const out = compileProject(proj);
    for (const bad of ["renpy", "persistent", "len", "seen_end", "seen_label", "Bob", "x", "e5"]) {
      expect(out).not.toContain(`default ${bad} =`);
    }
  });

  it("declares names read by choice-option conditions", () => {
    const proj = makeProj();
    const choice = newEvent("choice");
    choice.opts![0].condition = "has_key";
    proj.scenes[0].events.push(choice);
    expect(defaults(proj)).toEqual({ has_key: "False" });
  });

  it("never declares reserved names even if a setvar assigns them", () => {
    const proj = makeProj();
    setvar(proj, "persistent", "True");
    expect(defaults(proj)).toEqual({});
  });

  it("conditionVarNames can also report called and indexed names", () => {
    expect(conditionVarNames('inv["key"] and has(x)')).toEqual(["x"]);
    expect(conditionVarNames('inv["key"] and has(x)', { allReads: true })).toEqual(["inv", "has", "x"]);
  });
});

// ─── Camera ───────────────────────────────────────────────────────────────────

describe("camera event", () => {
  it("emits pitch, yaw and roll as rotations", () => {
    const proj = makeProj();
    const ev = newEvent("camera");
    Object.assign(ev, { camera_pitch: 10, camera_yaw: -5, camera_roll: 2 });
    proj.scenes[0].events.push(ev);
    const out = compileProject(proj);
    expect(out).toContain("ease 1 xpos 0 ypos 0 zpos 0 zoom 1 xrotate 10 yrotate -5 zrotate 2");
    expect(out).not.toContain("InvertMatrix");
  });

  it("leaves the camera line unchanged without rotation", () => {
    const proj = makeProj();
    proj.scenes[0].events.push(newEvent("camera"));
    expect(compileProject(proj)).toContain("    ease 1 xpos 0 ypos 0 zpos 0 zoom 1\n");
  });
});

// ─── Validator rules for the same inputs ─────────────────────────────────────

describe("validator – Ren'Py syntax rules", () => {
  const messages = (proj: VNProject) => {
    const r = validateProject(proj);
    return [...r.errors, ...r.warnings].map(d => d.message).join("\n");
  };

  it("rejects reserved setvar names and empty values", () => {
    const proj = makeProj();
    setvar(proj, "renpy", "1");
    setvar(proj, "score", "");
    const r = validateProject(proj);
    expect(r.ok).toBe(false);
    expect(messages(proj)).toContain(`"renpy" is reserved`);
    expect(messages(proj)).toContain(`setvar "score" has no value`);
  });

  it("warns when two characters share a sprite name", () => {
    const proj = makeProj();
    addSpeaker(proj, "Mary Jane");
    addSpeaker(proj, "Mary_Jane");
    expect(messages(proj)).toContain(`share the sprite name "Mary_Jane"`);
  });

  it("warns about invalid character colors", () => {
    const proj = makeProj();
    addSpeaker(proj, "Eileen").color = "blue-ish";
    expect(messages(proj)).toContain(`invalid name color "blue-ish"`);
  });

  it("no longer reports Ren'Py objects and builtins as uninitialized variables", () => {
    const proj = makeProj();
    ifEvent(proj, 'renpy.seen_label("x") and len(inventory) > 0');
    const out = messages(proj);
    expect(out).not.toContain(`Variable "renpy"`);
    expect(out).not.toContain(`Variable "len"`);
    expect(out).not.toContain(`Variable "x"`);
    expect(out).toContain(`Variable "inventory"`);
  });
});
