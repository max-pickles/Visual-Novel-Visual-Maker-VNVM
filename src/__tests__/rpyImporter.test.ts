/**
 * rpyImporter.test.ts — Tests for rpyImporter.ts
 *
 * Tests cover all major parse paths of the 6-phase Ren'Py import pipeline.
 */

import { importFromRpyFiles } from "../rpyImporter";
import type { ImportResult } from "../rpyImporter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a raw .rpy string as a single file object. */
function rpy(content: string, name = "game/script.rpy") {
  return [{ name, content }];
}

/** Run the importer with one inline script. */
function imp(content: string, name = "game/script.rpy"): ImportResult {
  return importFromRpyFiles(rpy(content, name), "/test/project", "Test VN", "Author");
}

// ─── Characters ───────────────────────────────────────────────────────────────

describe("rpyImporter – character definitions", () => {
  it("parses a define Character(...) line into a VNCharacter", () => {
    const { project } = imp(`define e = Character("Eileen")`);
    expect(project.characters.length).toBe(1);
    expect(project.characters[0].display).toBe("Eileen");
  });

  it("captures the variable name as VNCharacter.name", () => {
    const { project } = imp(`define mc = Character("Hero")`);
    expect(project.characters[0].name).toBe("mc");
  });

  it("captures a color attribute from the Character(...) call", () => {
    const { project } = imp(`define e = Character("Eileen", color="#c8d0ff")`);
    expect(project.characters[0].color).toBe("#c8d0ff");
  });

  it("handles multiple character definitions", () => {
    const { project } = imp(
      `define a = Character("Alice")\ndefine b = Character("Bob")`
    );
    expect(project.characters.length).toBe(2);
  });
});

// ─── Labels → Scenes ─────────────────────────────────────────────────────────

describe("rpyImporter – labels", () => {
  it("creates one scene per label", () => {
    const { project } = imp(
      `label chapter1:\n    pass\nlabel chapter2:\n    pass`
    );
    // chapter1 and chapter2 only (no 'start' label, so placeholder is filtered)
    const labeled = project.scenes.filter((s) => ["chapter1", "chapter2"].includes(s.label));
    expect(labeled.length).toBe(2);
  });

  it("sets proj.start when a 'start' label is found", () => {
    const { project } = imp(`label start:\n    pass`);
    const startScene = project.scenes.find((s) => s.id === project.start);
    expect(startScene?.label).toBe("start");
  });

  it("auto-sets proj.start to first scene when no 'start' label exists", () => {
    const { project } = imp(`label prologue:
    pass`);
    const prologue = project.scenes.find((s) => s.label === "prologue")!;
    expect(prologue).toBeDefined();
    expect(project.start).toBe(prologue.id);
  });

  it("imports vns_scene_ labels but skips vn_ internal labels", () => {
    const { project } = imp(
      `label vns_scene_abc123:\n    pass\nlabel vn_internal:\n    pass\nlabel real_label:\n    pass`
    );
    expect(project.scenes.length).toBe(2);
    expect(project.scenes[0].label).toBe("abc123");
    expect(project.scenes[1].label).toBe("real_label");
  });
});

// ─── Dialogue & narration ─────────────────────────────────────────────────────

describe("rpyImporter – dialogue events", () => {
  it("maps a known character variable to a dialogue event with char_id", () => {
    const content = `define e = Character("Eileen")\nlabel prologue:\n    e "Hello!"`;
    const { project } = imp(content);
    const scene = project.scenes.find((s) => s.label === "prologue")!;
    const ev = scene.events.find((e) => e.type === "dialogue");
    expect(ev).toBeDefined();
    expect(ev!.text).toBe("Hello!");
    expect(ev!.char_id).toBe(project.characters[0].id);
  });

  it("maps an unknown variable to a narration event with speaker prefix", () => {
    const { project } = imp(`label prologue:\n    bob "Howdy!"`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "narration");
    expect(ev).toBeDefined();
    expect(ev!.text).toBe("bob: Howdy!");
  });
});

describe("rpyImporter – narration events", () => {
  it("maps a bare quoted string to a narration event", () => {
    const { project } = imp(`label prologue:\n    "The world is dark."`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "narration");
    expect(ev).toBeDefined();
    expect(ev!.text).toBe("The world is dark.");
  });
});

// ─── Menu / Choice ────────────────────────────────────────────────────────────

describe("rpyImporter – menu / choice", () => {
  it("creates a single choice event from a menu: block", () => {
    const script = `
label prologue:
    menu:
        "Go left":
            jump left_path
        "Go right":
            jump right_path
label left_path:
    pass
label right_path:
    pass
`.trim();
    const { project } = imp(script);
    const startScene = project.scenes.find((s) => s.label === "prologue")!;
    const choiceEv = startScene.events.find((e) => e.type === "choice");
    expect(choiceEv).toBeDefined();
    expect(choiceEv!.opts!.length).toBe(2);
  });

  it("wires choice option targets to the correct scene IDs", () => {
    const script = `
label prologue:
    menu:
        "Option A":
            jump act2
label act2:
    pass
`.trim();
    const { project } = imp(script);
    const startScene = project.scenes.find((s) => s.label === "prologue")!;
    const choiceEv = startScene.events.find((e) => e.type === "choice")!;
    const act2 = project.scenes.find((s) => s.label === "act2")!;
    expect(choiceEv.opts![0].scene).toBe(act2.id);
  });

  it("captures a menu prompt string", () => {
    const script = `
label prologue:
    menu:
        "What will you do?"
        "Fight":
            pass
`.trim();
    const { project } = imp(script);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const choiceEv = sc.events.find((e) => e.type === "choice")!;
    expect(choiceEv.prompt).toBe("What will you do?");
  });
});

// ─── Jump / Call ──────────────────────────────────────────────────────────────

describe("rpyImporter – jump / call", () => {
  it("creates a jump event and resolves target scene ID", () => {
    const script = `
label prologue:
    jump act2
label act2:
    pass
`.trim();
    const { project } = imp(script);
    const startScene = project.scenes.find((s) => s.label === "prologue")!;
    const jumpEv = startScene.events.find((e) => e.type === "jump");
    const act2 = project.scenes.find((s) => s.label === "act2")!;
    expect(jumpEv!.scene_id).toBe(act2.id);
  });

  it("treats call the same as jump", () => {
    const script = `
label prologue:
    call act2
label act2:
    pass
`.trim();
    const { project } = imp(script);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const jumpEv = sc.events.find((e) => e.type === "jump");
    expect(jumpEv).toBeDefined();
  });

  it("warns when jump target label is not found", () => {
    const { warnings } = imp(`label start:\n    jump ghost_label`);
    expect(warnings.some((w) => w.includes("ghost_label"))).toBe(true);
  });
});

// ─── Background / Scene ───────────────────────────────────────────────────────

describe("rpyImporter – scene (background) events", () => {
  it("creates a bg event from a scene statement", () => {
    const { project } = imp(`label prologue:\n    scene bg_forest`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "bg");
    expect(ev).toBeDefined();
    expect(ev!.bg).toBe("bg_forest");
  });

  it("sets scene.bg to the parsed background name", () => {
    const { project } = imp(`label prologue:\n    scene bg_city`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    expect(sc.bg).toBe("bg_city");
  });
});

// ─── Show / Image ─────────────────────────────────────────────────────────────

describe("rpyImporter – show (image) events", () => {
  it("creates an image event with default side center", () => {
    const { project } = imp(`label prologue:\n    show eileen_happy`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "image");
    expect(ev).toBeDefined();
    expect(ev!.image).toBe("eileen_happy");
    expect(ev!.side).toBe("center");
  });

  it("captures the at-position as side", () => {
    const { project } = imp(`label prologue:\n    show eileen_happy at left`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "image")!;
    expect(ev.side).toBe("left");
  });
});

// ─── Music ───────────────────────────────────────────────────────────────────

describe("rpyImporter – music events", () => {
  it("creates a music event from play music", () => {
    const { project } = imp(`label prologue:\n    play music "bgm.ogg"`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "music");
    expect(ev!.music).toBe("bgm.ogg");
  });

  it("creates an empty-music event from stop music", () => {
    const { project } = imp(`label prologue:\n    stop music`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "music");
    expect(ev).toBeDefined();
    expect(ev!.music).toBe("");
  });

  it("sets scene.music to the parsed music path", () => {
    const { project } = imp(`label prologue:\n    play music "theme.ogg"`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    expect(sc.music).toBe("theme.ogg");
  });
});

// ─── Pause / Wait ─────────────────────────────────────────────────────────────

describe("rpyImporter – pause events", () => {
  it("creates a wait event from pause", () => {
    const { project } = imp(`label prologue:\n    pause 2.5`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "wait");
    expect(ev!.dur).toBe(2.5);
  });

  it("silently ignores non-numeric pause arguments (regex requires digits)", () => {
    // The pauseRe only matches /^pause\s+([\d.]+)/ so 'pause abc' is skipped entirely.
    const { project } = imp(`label prologue:\n    pause abc`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "wait");
    // No wait event should be created for a non-numeric duration
    expect(ev).toBeUndefined();
  });
});

// ─── With / Transition ────────────────────────────────────────────────────────

describe("rpyImporter – with (transition) events", () => {
  it("creates an effect event from a standalone with statement", () => {
    const { project } = imp(`label prologue:\n    with dissolve`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "effect");
    expect(ev).toBeDefined();
    expect(ev!.kind).toBe("dissolve");
  });

  it("maps Ren'Py 'None' transition to 'none'", () => {
    const { project } = imp(`label prologue:\n    with None`);
    const sc = project.scenes.find((s) => s.label === "prologue")!;
    const ev = sc.events.find((e) => e.type === "effect")!;
    expect(ev.kind).toBe("none");
  });
});

// ─── Skipped files ────────────────────────────────────────────────────────────

describe("rpyImporter – skipped files", () => {
  const guiFiles = ["options.rpy", "gui.rpy", "screens.rpy", "styles.rpy"];

  guiFiles.forEach((filename) => {
    it(`ignores ${filename}`, () => {
      const { project } = importFromRpyFiles(
        [{ name: filename, content: `label gui_content:\n    pass` }],
        "/test",
      );
      // No scenes should be imported from GUI-only files
      expect(project.scenes.filter((s) => s.label === "gui_content").length).toBe(0);
    });
  });

  it("ignores files inside the tl/ directory", () => {
    const { project } = importFromRpyFiles(
      [{ name: "tl/english/script.rpy", content: `label tl_start:\n    pass` }],
      "/test",
    );
    expect(project.scenes.filter((s) => s.label === "tl_start").length).toBe(0);
  });
});

// ─── Default variable warnings ───────────────────────────────────────────────

describe("rpyImporter – default variable warnings", () => {
  it("produces a warning for each default statement (not imported as event)", () => {
    const { warnings } = imp(
      `label start:\n    default score = 0\n    default has_key = False`
    );
    // The first warning is the summary, rest are per-variable
    const varWarnings = warnings.filter((w) => w.startsWith("Variable:"));
    expect(varWarnings.length).toBe(2);
    expect(varWarnings[0]).toContain("score");
    expect(varWarnings[1]).toContain("has_key");
  });
});

// ─── Summary warning ─────────────────────────────────────────────────────────

describe("rpyImporter – summary warning (index 0)", () => {
  it("always puts a summary string at warnings[0]", () => {
    const { warnings } = imp(`label start:\n    "Hello"`);
    expect(warnings[0]).toMatch(/^Imported \d+ scenes?/);
  });

  it("warns 'No labels found' when file has no label statements", () => {
    const { warnings } = imp(`# just a comment`);
    expect(warnings.some((w) => w.includes("No labels found"))).toBe(true);
  });
});

// ─── Layout ───────────────────────────────────────────────────────────────────

describe("rpyImporter – layout grid", () => {
  it("assigns every scene a position in proj.layout", () => {
    const script = [
      "label s1:\n    pass",
      "label s2:\n    pass",
      "label s3:\n    pass",
    ].join("\n");
    const { project } = imp(script);
    for (const sc of project.scenes) {
      expect(project.layout[sc.id]).toBeDefined();
      expect(project.layout[sc.id].length).toBe(2);
    }
  });
});
