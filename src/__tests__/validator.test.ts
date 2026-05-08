/**
 * validator.test.ts — Tests for validator.ts
 *
 * One describe block per validation check (14 total).
 */

import { validateProject } from "../validator";
import { newProject, newScene, newCharacter, newEvent } from "../types";
import type { VNProject } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid project (1 scene, start set). */
function makeProj(): VNProject {
  const proj = newProject("Test", "Tester");
  proj.scenes[0].events = [];
  proj.scenes[0].ending_type = "normal";
  return proj;
}

function errorMessages(proj: VNProject): string[] {
  return validateProject(proj).errors.map((d) => d.message);
}

function warnMessages(proj: VNProject): string[] {
  return validateProject(proj).warnings.map((d) => d.message);
}

// ─── Check 1: Start scene ─────────────────────────────────────────────────────

describe("validateProject – check 1: start scene", () => {
  it("is ok when start is set and scene exists", () => {
    const proj = makeProj();
    expect(validateProject(proj).ok).toBe(true);
  });

  it("errors when start is null", () => {
    const proj = makeProj();
    proj.start = null;
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("No start scene"))).toBe(true);
  });

  it("errors when start ID does not exist in scenes", () => {
    const proj = makeProj();
    proj.start = "nonexistent_id";
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("start scene ID no longer exists"))).toBe(true);
  });
});

// ─── Check 2: Empty project ───────────────────────────────────────────────────

describe("validateProject – check 2: empty project", () => {
  it("is ok when scenes array is non-empty", () => {
    const proj = makeProj();
    expect(validateProject(proj).errors.length).toBe(0);
  });

  it("errors when scenes array is empty", () => {
    const proj = makeProj();
    proj.scenes = [];
    proj.start = null;
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("no scenes"))).toBe(true);
  });
});

// ─── Check 3: Empty labels ────────────────────────────────────────────────────

describe("validateProject – check 3: empty scene labels", () => {
  it("is ok when all scenes have labels", () => {
    const proj = makeProj();
    expect(validateProject(proj).errors.length).toBe(0);
  });

  it("errors when a scene has a blank label", () => {
    const proj = makeProj();
    proj.scenes[0].label = "   ";
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("empty label"))).toBe(true);
  });
});

// ─── Check 4: Duplicate labels ───────────────────────────────────────────────

describe("validateProject – check 4: duplicate scene labels", () => {
  it("is ok when all labels are unique", () => {
    const proj = makeProj();
    const s2 = newScene("other");
    s2.ending_type = "normal";
    proj.scenes.push(s2);
    expect(validateProject(proj).ok).toBe(true);
  });

  it("errors when two scenes share the same label", () => {
    const proj = makeProj();
    const s2 = newScene("start");       // same as the auto-created first scene
    proj.scenes.push(s2);
    // Force both labels to the same value
    proj.scenes[0].label = "prologue";
    proj.scenes[1].label = "prologue";
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("Duplicate scene label"))).toBe(true);
  });
});

// ─── Check 5: Invalid label characters ───────────────────────────────────────

describe("validateProject – check 5: invalid label characters", () => {
  it("no warning for valid identifiers (letters, digits, underscores)", () => {
    const proj = makeProj();
    proj.scenes[0].label = "my_scene_01";
    expect(warnMessages(proj).some((m) => m.includes("special characters"))).toBe(false);
  });

  it("warns when label contains a space", () => {
    const proj = makeProj();
    proj.scenes[0].label = "my scene";
    expect(warnMessages(proj).some((m) => m.includes("special characters"))).toBe(true);
  });

  it("warns when label contains a hyphen", () => {
    const proj = makeProj();
    proj.scenes[0].label = "my-scene";
    expect(warnMessages(proj).some((m) => m.includes("special characters"))).toBe(true);
  });

  it("warns when label contains an exclamation mark", () => {
    const proj = makeProj();
    proj.scenes[0].label = "Scene!";
    expect(warnMessages(proj).some((m) => m.includes("special characters"))).toBe(true);
  });

  it("does not warn for an empty label (that's a check-3 error)", () => {
    const proj = makeProj();
    proj.scenes[0].label = "";
    // The special-chars check skips empty labels
    expect(warnMessages(proj).some((m) => m.includes("special characters"))).toBe(false);
  });
});

// ─── Check 6: Broken jump / choice / if targets ───────────────────────────────

describe("validateProject – check 6: broken jump targets", () => {
  it("is ok when jump target exists", () => {
    const proj = makeProj();
    const s2 = newScene("end");
    s2.ending_type = "normal";
    proj.scenes.push(s2);
    const ev = newEvent("jump");
    ev.scene_id = s2.id;
    proj.scenes[0].events.push(ev);
    expect(validateProject(proj).ok).toBe(true);
  });

  it("errors when jump target has been deleted", () => {
    const proj = makeProj();
    const ev = newEvent("jump");
    ev.scene_id = "ghost_id";
    proj.scenes[0].events.push(ev);
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("jump target scene no longer exists"))).toBe(true);
  });

  it("errors when if-true target has been deleted", () => {
    const proj = makeProj();
    const ev = newEvent("if");
    ev.scene_true = "gone";
    ev.scene_false = null;
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("if-true target"))).toBe(true);
  });

  it("errors when if-false target has been deleted", () => {
    const proj = makeProj();
    const ev = newEvent("if");
    ev.scene_true = null;
    ev.scene_false = "gone";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("if-false target"))).toBe(true);
  });

  it("errors when a choice option target has been deleted", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "Go", scene: "missing_id" }];
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("jump target no longer exists"))).toBe(true);
  });

  it("is ok when choice option target is null (unlinked option)", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "Nowhere", scene: null }];
    proj.scenes[0].events.push(ev);
    expect(validateProject(proj).errors.length).toBe(0);
  });
});

// ─── Check 7: Missing character references ────────────────────────────────────

describe("validateProject – check 7: missing character references", () => {
  it("is ok when dialogue references an existing character", () => {
    const proj = makeProj();
    const char = newCharacter("Alice");
    proj.characters.push(char);
    const ev = newEvent("dialogue");
    ev.char_id = char.id;
    proj.scenes[0].events.push(ev);
    expect(validateProject(proj).ok).toBe(true);
  });

  it("errors when dialogue references a deleted character ID", () => {
    const proj = makeProj();
    const ev = newEvent("dialogue");
    ev.char_id = "deleted_char";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("deleted character"))).toBe(true);
  });

  it("is ok when dialogue char_id is null (narrator)", () => {
    const proj = makeProj();
    const ev = newEvent("dialogue");
    ev.char_id = null;
    proj.scenes[0].events.push(ev);
    expect(validateProject(proj).errors.length).toBe(0);
  });
});

// ─── Check 8: Unreachable scenes ─────────────────────────────────────────────

describe("validateProject – check 8: unreachable scenes", () => {
  it("no warning when all scenes are reachable", () => {
    const proj = makeProj();
    const s2 = newScene("act2");
    proj.scenes.push(s2);
    const ev = newEvent("jump");
    ev.scene_id = s2.id;
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("unreachable"))).toBe(false);
  });

  it("warns about a scene that has no incoming jumps from start", () => {
    const proj = makeProj();
    // Add an explicit jump to scene 1 so it doesn't naturally fall through to the orphan
    const ev = newEvent("jump");
    ev.scene_id = proj.scenes[0].id;
    proj.scenes[0].events.push(ev);
    
    const orphan = newScene("orphan");
    proj.scenes.push(orphan);
    // No jump or choice leads to orphan
    expect(warnMessages(proj).some((m) => m.includes("unreachable"))).toBe(true);
  });

  it("follows choice branches when calculating reachability", () => {
    const proj = makeProj();
    const s2 = newScene("branch");
    proj.scenes.push(s2);
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "Go", scene: s2.id }];
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("unreachable"))).toBe(false);
  });

  it("follows if branches when calculating reachability", () => {
    const proj = makeProj();
    const s2 = newScene("true_path");
    const s3 = newScene("false_path");
    proj.scenes.push(s2, s3);
    const ev = newEvent("if");
    ev.scene_true = s2.id;
    ev.scene_false = s3.id;
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("unreachable"))).toBe(false);
  });
});

// ─── Check 9: Empty dialogue text ────────────────────────────────────────────

describe("validateProject – check 9: empty dialogue text", () => {
  it("no warning when dialogue has text", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = "Hello world";
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("empty"))).toBe(false);
  });

  it("warns when narration text is empty", () => {
    const proj = makeProj();
    const ev = newEvent("narration");
    ev.text = "";
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("empty narration text"))).toBe(true);
  });

  it("warns when dialogue text is whitespace-only", () => {
    const proj = makeProj();
    const ev = newEvent("dialogue");
    ev.text = "   ";
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("empty dialogue text"))).toBe(true);
  });
});

// ─── Check 10: Empty choice options ─────────────────────────────────────────

describe("validateProject – check 10: choice options", () => {
  it("warns when a choice event has no options", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [];
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("no options"))).toBe(true);
  });

  it("warns when a choice option has empty text", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "  ", scene: null }];
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("empty text"))).toBe(true);
  });

  it("is ok when all options have text", () => {
    const proj = makeProj();
    const ev = newEvent("choice");
    ev.opts = [{ id: "o1", text: "Yes", scene: null }, { id: "o2", text: "No", scene: null }];
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("no options"))).toBe(false);
  });
});

// ─── Check 11: setvar variable name ──────────────────────────────────────────

describe("validateProject – check 11: setvar var_name", () => {
  it("errors when var_name is empty", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("no variable name"))).toBe(true);
  });

  it("errors when var_name is not a valid Python identifier", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "my-var";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("valid Python identifier"))).toBe(true);
  });

  it("is ok when var_name is a valid Python identifier", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "my_flag";
    ev.var_val  = "True";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("variable name"))).toBe(false);
  });
});

// ─── Check 12: if event condition ────────────────────────────────────────────

describe("validateProject – check 12: if condition", () => {
  it("errors when condition is empty", () => {
    const proj = makeProj();
    const ev = newEvent("if");
    ev.condition = "";
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("empty condition"))).toBe(true);
  });

  it("is ok when condition is non-empty", () => {
    const proj = makeProj();
    const s2 = newScene("branch");
    proj.scenes.push(s2);
    const ev = newEvent("if");
    ev.condition   = "flag == True";
    ev.scene_true  = s2.id;
    ev.scene_false = null;
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("empty condition"))).toBe(false);
  });
});

// ─── Check 13: wait duration ──────────────────────────────────────────────────

describe("validateProject – check 13: wait duration", () => {
  it("warns when wait duration is zero", () => {
    const proj = makeProj();
    const ev = newEvent("wait");
    ev.dur = 0;
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("non-positive duration"))).toBe(true);
  });

  it("warns when wait duration is negative", () => {
    const proj = makeProj();
    const ev = newEvent("wait");
    ev.dur = -1;
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("non-positive duration"))).toBe(true);
  });

  it("is ok when wait duration is positive", () => {
    const proj = makeProj();
    const ev = newEvent("wait");
    ev.dur = 2;
    proj.scenes[0].events.push(ev);
    expect(warnMessages(proj).some((m) => m.includes("non-positive duration"))).toBe(false);
  });
});

// ─── Check 15: Unused characters ──────────────────────────────────────────────

describe("validateProject – check 15: unused characters", () => {
  it("warns when a character is defined but never used in dialogue", () => {
    const proj = makeProj();
    const char = newCharacter("Bob");
    proj.characters.push(char);
    // Bob is not used in any dialogue event
    const msgs = warnMessages(proj);
    expect(msgs.some((m) => m.includes("never speaks"))).toBe(true);
  });

  it("is ok when all defined characters speak at least once", () => {
    const proj = makeProj();
    const char = newCharacter("Bob");
    proj.characters.push(char);
    const ev = newEvent("dialogue");
    ev.char_id = char.id;
    proj.scenes[0].events.push(ev);
    const msgs = warnMessages(proj);
    expect(msgs.some((m) => m.includes("never speaks"))).toBe(false);
  });
});

// ─── Check 16: Dead-end scenes ────────────────────────────────────────────────

describe("validateProject – check 16: dead-end scenes", () => {
  it("errors when a scene has no navigation and is not the last scene", () => {
    const proj = makeProj();
    const s2 = newScene("dead_end");
    const s3 = newScene("final");
    proj.scenes.push(s2, s3);
    // s2 has no events, no fall-through (since it's not the last scene), and no ending_type
    const errs = errorMessages(proj);
    expect(errs.some((m) => m.includes("dead end"))).toBe(true);
  });

  it("is ok when a scene has a jump event", () => {
    const proj = makeProj();
    const s2 = newScene("s2");
    s2.ending_type = "normal";
    proj.scenes.push(s2);
    const ev = newEvent("jump");
    ev.scene_id = s2.id;
    proj.scenes[0].events.push(ev);
    expect(errorMessages(proj).some((m) => m.includes("dead end"))).toBe(false);
  });

  it("is ok when a scene falls through to the next scene", () => {
    const proj = makeProj();
    const s2 = newScene("s2");
    s2.ending_type = "normal";
    proj.scenes.push(s2);
    // proj.scenes[0] falls through to s2
    expect(errorMessages(proj).some((m) => m.includes("dead end"))).toBe(false);
  });

  it("is ok when the last scene is marked as an ending", () => {
    const proj = makeProj();
    proj.scenes[0].ending_type = "good";
    expect(errorMessages(proj).some((m) => m.includes("dead end"))).toBe(false);
  });
});

// ─── Check 17: Unused variables ───────────────────────────────────────────────

describe("validateProject – check 17: unused variables", () => {
  it("warns when a variable is set but never evaluated", () => {
    const proj = makeProj();
    const ev = newEvent("setvar");
    ev.var_name = "flag";
    proj.scenes[0].events.push(ev);
    const msgs = warnMessages(proj);
    expect(msgs.some((m) => m.includes("never evaluated"))).toBe(true);
  });

  it("is ok when a set variable is evaluated in an if condition", () => {
    const proj = makeProj();
    const ev1 = newEvent("setvar");
    ev1.var_name = "flag";
    const ev2 = newEvent("if");
    ev2.condition = "flag == True";
    ev2.scene_true = proj.scenes[0].id;
    proj.scenes[0].events.push(ev1, ev2);
    const msgs = warnMessages(proj);
    expect(msgs.some((m) => m.includes("never evaluated"))).toBe(false);
  });
});

// ─── ok flag ─────────────────────────────────────────────────────────────────

describe("validateProject – ok flag", () => {
  it("ok is true when there are only warnings", () => {
    const proj = makeProj();
    const orphan = newScene("orphan");
    orphan.ending_type = "normal";
    proj.scenes.push(orphan); // triggers unreachable warning
    expect(validateProject(proj).ok).toBe(true);
  });

  it("ok is false when any error is present", () => {
    const proj = makeProj();
    proj.start = null;
    expect(validateProject(proj).ok).toBe(false);
  });
});
