/**
 * assetRefs.test.ts — Tests for assetRefs.ts
 *
 * The Export panel deletes what findUnusedAssets returns, for good, so most of
 * these check that files in use are kept, whichever way they are referred to.
 */

import { collectAssetRefs, findUnusedAssets, isCleanable } from "../assetRefs";
import type { ProjectScript } from "../assetRefs";
import { newProject, newCharacter, newEvent } from "../types";
import type { EventType, VNEvent, VNProject } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A project with one empty scene. */
function emptyProject(): VNProject {
  const proj = newProject("Test", "Tester");
  proj.scenes[0].events = [];
  return proj;
}

function event(type: EventType, fields: Partial<VNEvent> = {}): VNEvent {
  return { ...newEvent(type), ...fields };
}

/** A project whose one scene has these events. */
function withEvents(...events: VNEvent[]): VNProject {
  const proj = emptyProject();
  proj.scenes[0].events = events;
  return proj;
}

function rpy(content: string, name = "game/script.rpy"): ProjectScript[] {
  return [{ name, content }];
}

/** The files in `files` the cleaner would delete. */
function unused(project: VNProject, files: string[], scripts: ProjectScript[] = []): string[] {
  return findUnusedAssets(files, collectAssetRefs(project, scripts));
}

/** The files in `files` the cleaner would keep. */
function kept(project: VNProject, files: string[], scripts: ProjectScript[] = []): string[] {
  const deleted = new Set(unused(project, files, scripts));
  return files.filter(f => !deleted.has(f));
}

// ─── Project fields ───────────────────────────────────────────────────────────

describe("collectAssetRefs – project fields", () => {
  it("collects every asset field of the project, its scenes, events and characters", () => {
    const proj = emptyProject();
    proj.cover = "images/cover.png";
    proj.scenes[0].bg = "bg scene";
    proj.scenes[0].music = "audio/scene.ogg";
    proj.scenes[0].events = [
      event("bg", { bg: "game/images/bg.png" }),
      event("image", { image: "images/sprite.png" }),
      event("animation", { image: "anim.png" }),
      event("movie", { movie: "intro.webm" }),
      event("music", { music: "theme.ogg" }),
      event("sfx", { sfx: "audio/door.ogg" }),
      event("dialogue", { voice: "voice/line1.ogg", text_beep: "beep.ogg" }),
    ];
    const eileen = newCharacter("Eileen");
    eileen.sprites = { neutral: "images/eileen neutral.png", happy: "" };
    eileen.side_images = { neutral: "images/side eileen.png" };
    eileen.layered_sprites = { neutral: { base: "images/eileen/base.png", eyes: "images/eileen/eyes.png" } };
    eileen.textbox_bg = "gui/eileen_box.png";
    eileen.ctc = "ctc_arrow";
    eileen.custom_font = "fonts/eileen.ttf";
    eileen.text_beep = "audio/beep_eileen.ogg";
    proj.characters = [eileen];
    proj.text_tpls[0].font = "fonts/body.otf";
    proj.main_menu = {
      background: "images/menu_bg.png",
      titleImage: "images/logo.png",
      buttons: [{ id: "b1", label: "Start", action: "start", x: 50, y: 50, visible: true, style: { font: "fonts/menu.ttf" } }],
    };
    proj.achievements = [{ id: "a1", name: "Done", description: "", hidden: false, icon: "game/images/trophy.png" }];

    const { names } = collectAssetRefs(proj);
    expect([...names]).toEqual(expect.arrayContaining([
      "images/cover.png", "bg scene", "audio/scene.ogg",
      "game/images/bg.png", "images/sprite.png", "anim.png", "intro.webm", "theme.ogg", "audio/door.ogg",
      "voice/line1.ogg", "beep.ogg",
      "images/eileen neutral.png", "images/side eileen.png", "images/eileen/base.png", "images/eileen/eyes.png",
      "gui/eileen_box.png", "ctc_arrow", "fonts/eileen.ttf", "audio/beep_eileen.ogg",
      "fonts/body.otf", "images/menu_bg.png", "images/logo.png", "fonts/menu.ttf", "game/images/trophy.png",
    ]));
    expect(names.has("")).toBe(false);
  });

  it("counts asset fields left on events of another type", () => {
    // The scene editor's sidebar writes `music` on any event in audio mode, and
    // `image` on any event that isn't a background; changing an event's type
    // keeps its old fields.
    const proj = withEvents(
      event("sfx", { music: "game/audio/knock.ogg" }),
      event("dialogue", { text: "Hi", image: "game/images/wave.png" }),
      event("image", { bg: "game/images/old_bg.png" }),
    );
    const files = ["game/audio/knock.ogg", "game/images/wave.png", "game/images/old_bg.png", "game/images/spare.png"];
    expect(unused(proj, files)).toEqual(["game/images/spare.png"]);
  });

  it("reads {image=…} and {font=…} text tags in dialogue, choices and translations", () => {
    const choice = event("choice", { prompt: "Pick {image=images/icons/star.png}" });
    choice.opts![0].text = "{font=fonts/fancy.ttf}Left{/font}";
    const proj = withEvents(event("narration", { text: "A {image=heart.png} for you" }), choice);
    proj.translations = { French: { line1: "Un {image=images/flags/fr.png}" } };
    const files = ["game/images/icons/star.png", "game/images/heart.png", "game/images/flags/fr.png", "game/images/flags/de.png"];
    expect(unused(proj, files)).toEqual(["game/images/flags/de.png"]);
  });

  it("finds assets in fields it doesn't know about", () => {
    const ev = event("image", { image: "" });
    (ev as Record<string, unknown>).layer1 = { type: "image", image: "lucy wave" };
    const proj = withEvents(ev);
    (proj as unknown as Record<string, unknown>).extras = { thumbnail: "images/extra/thumb.png" };
    const files = ["game/images/lucy wave.png", "game/images/extra/thumb.png", "game/images/spare.png"];
    expect(unused(proj, files)).toEqual(["game/images/spare.png"]);
  });

  it("doesn't read dialogue text as code", () => {
    const proj = withEvents(event("narration", { text: "show eileen angry" }));
    expect(unused(proj, ["game/images/eileen angry.png"])).toEqual(["game/images/eileen angry.png"]);
  });

  it("leaves out where the project is on this machine", () => {
    const proj = emptyProject();
    proj._rootPath = "/home/me/games/My VN";
    proj._filePath = "/home/me/games/My VN/project.vnvmaker";
    const { names } = collectAssetRefs(proj);
    expect(names.has(proj._rootPath)).toBe(false);
    expect(names.has(proj._filePath)).toBe(false);
  });

  it("handles malformed, deeply nested and self-referencing project content", () => {
    const proj = withEvents(event("image", { image: "game/images/ok.png" }));
    let nested: Record<string, unknown> = { image: "images/deep.png" };
    for (let i = 0; i < 100_000; i++) nested = { child: nested };
    const loop: Record<string, unknown> = { music: "loop.ogg" };
    loop.self = loop;
    const raw = proj as unknown as Record<string, unknown>;
    raw.nested = nested;
    raw.loop = loop;
    raw.junk = [null, 42, true, [], {}, { sprites: ["images/listed.png", null] }];
    proj.characters = [{ ...newCharacter("X"), sprites: null } as unknown as VNProject["characters"][number]];

    const files = ["game/images/ok.png", "game/images/deep.png", "game/audio/loop.ogg", "game/images/listed.png", "game/images/spare.png"];
    expect(unused(proj, files)).toEqual(["game/images/spare.png"]);
  });
});

// ─── Code in the project ──────────────────────────────────────────────────────

describe("collectAssetRefs – code in the project", () => {
  it("reads raw code, ATL, conditions, variable values and custom menu actions", () => {
    const choice = event("choice");
    choice.opts![0].condition = 'renpy.loadable("audio/secret.ogg")';
    const proj = withEvents(
      event("raw", { raw_code: 'play sound "audio/crash.ogg"\nshow eileen surprised' }),
      event("bg", { bg: "game/images/room.png", atl_code: '"images/frame1.png"\npause 0.1\n"images/frame2.png"\nrepeat' }),
      event("if", { condition: 'renpy.showing("bg lake")' }),
      event("setvar", { var_name: "photo", var_val: '"images/lake.png"' }),
      choice,
    );
    proj.main_menu = {
      buttons: [{ id: "b1", label: "Music", action: "custom", customAction: 'Play("music", "audio/menu.ogg")', x: 0, y: 0, visible: true }],
    };
    const files = [
      "game/audio/crash.ogg", "game/images/eileen surprised.png", "game/images/frame1.png", "game/images/frame2.png",
      "game/images/bg lake.png", "game/images/lake.png", "game/audio/secret.ogg", "game/audio/menu.ogg",
      "game/images/room.png", "game/images/spare.png",
    ];
    expect(unused(proj, files)).toEqual(["game/images/spare.png"]);
  });

  it("skips comments, but not a # inside a string", () => {
    const proj = withEvents(event("raw", { raw_code: '# play music "old.ogg"\nplay music "track#2.ogg"  # was "track1.ogg"' }));
    const files = ["game/audio/old.ogg", "game/audio/track#2.ogg", "game/audio/track1.ogg"];
    expect(unused(proj, files)).toEqual(["game/audio/old.ogg", "game/audio/track1.ogg"]);
  });

  it("reads code with unterminated strings", () => {
    const proj = withEvents(
      event("raw", { raw_code: 'e "It\'s broken\nplay music "theme.ogg"' }),
      event("raw", { raw_code: "'''never closed\nshow expression \"images/inside.png\"" }),
    );
    expect(kept(proj, ["game/audio/theme.ogg", "game/images/inside.png"])).toEqual(["game/audio/theme.ogg", "game/images/inside.png"]);
  });
});

// ─── Which files it offers ────────────────────────────────────────────────────

describe("findUnusedAssets – which files it offers", () => {
  it("only offers files in game/images and game/audio", () => {
    const files = [
      "game/images/a.png", "game/audio/b.ogg",
      "game/gui/textbox.png", "game/gui/fonts/x.png", "game/x.png", "game/voice/v.ogg",
      "game/tl/french/images/a.png", "images/a.png", "audio/b.ogg", "game/images/../gui/c.png",
    ];
    expect(unused(emptyProject(), files)).toEqual(["game/images/a.png", "game/audio/b.ogg"]);
  });

  it("lists each file once", () => {
    expect(unused(emptyProject(), ["game/images/a.png", "game/images/a.png"])).toEqual(["game/images/a.png"]);
  });

  it("isCleanable accepts only files under the asset folders", () => {
    expect(isCleanable("game/images/bg/park.png")).toBe(true);
    expect(isCleanable("game/audio/theme.ogg")).toBe(true);
    expect(isCleanable("game/images/")).toBe(false);
    expect(isCleanable("game/images/../../project.vnvmaker")).toBe(false);
    expect(isCleanable("game/gui/main_menu.png")).toBe(false);
    expect(isCleanable("/game/images/a.png")).toBe(false);
  });
});

// ─── The ways paths are stored ────────────────────────────────────────────────

describe("findUnusedAssets – the ways paths are stored", () => {
  it("matches root-relative, game-relative, bare, absolute and Windows paths", () => {
    const proj = withEvents(
      event("bg", { bg: "game/images/bg/park.png" }),                              // scene editor
      event("music", { music: "illurock.opus" }),                                  // imported game
      event("sfx", { sfx: "audio/door.ogg" }),
      event("dialogue", { voice: "C:\\Users\\me\\VN\\game\\audio\\voice\\l1.ogg" }), // voice director
      event("narration", { voice: "/home/me/VN/game/audio/voice/l2.ogg" }),
    );
    const eileen = newCharacter("Eileen");
    eileen.sprites = { happy: "images/eileen/happy.png" };                         // character editor
    proj.characters = [eileen];
    const files = [
      "game/images/bg/park.png", "game/audio/illurock.opus", "game/audio/door.ogg", "game/audio/voice/l1.ogg",
      "game/audio/voice/l2.ogg", "game/images/eileen/happy.png", "game/images/eileen/sad.png",
    ];
    expect(unused(proj, files)).toEqual(["game/images/eileen/sad.png"]);
  });

  it("ignores quotes, case, Unicode normalization, and spaces versus underscores", () => {
    const proj = withEvents(
      event("music", { music: "'theme.ogg'" }),
      event("image", { image: "Images/CAFÉ.PNG" }),
      event("image", { image: "eileen happy.png" }),
    );
    const files = ["game/audio/theme.ogg", "game/images/cafe\u0301.png", "game/images/eileen_happy.png", "game/images/spare.png"];
    expect(unused(proj, files)).toEqual(["game/images/spare.png"]);
  });

  it("keeps a file of the same name in another folder, as the diagnostics panel does", () => {
    const proj = withEvents(event("image", { image: "images/a/x.png" }));
    expect(unused(proj, ["game/images/a/x.png", "game/images/b/x.png", "game/images/b/y.png"])).toEqual(["game/images/b/y.png"]);
  });
});

// ─── Ren'Py image and audio names ─────────────────────────────────────────────

describe("findUnusedAssets – Ren'Py image and audio names", () => {
  it("resolves image names the way Ren'Py names the files in game/images", () => {
    // Imported games store `scene bg meadow` as the image name "bg meadow".
    const proj = withEvents(event("bg", { bg: "bg meadow" }), event("image", { image: "eileen happy" }));
    const files = [
      "game/images/bg meadow.png", "game/images/backgrounds/bg meadow.jpg", "game/images/bg_meadow.webp",
      "game/images/Eileen Happy.png", "game/images/bg room.png", "game/images/eileen sad.png",
    ];
    expect(unused(proj, files)).toEqual(["game/images/bg room.png", "game/images/eileen sad.png"]);
  });

  it("keeps the image a name falls back to", () => {
    // `eileen happy` shows the image `eileen` with the attribute happy, if
    // there's no image called `eileen happy`.
    const proj = withEvents(event("image", { image: "eileen happy" }));
    expect(unused(proj, ["game/images/eileen.png", "game/images/lucy.png"])).toEqual(["game/images/lucy.png"]);
  });

  it("keeps every image an interpolated name could be", () => {
    const proj = withEvents(event("image", { image: "eileen [mood]" }));
    const files = ["game/images/eileen happy.png", "game/images/eileen/eileen sad.png", "game/images/lucy happy.png"];
    expect(unused(proj, files)).toEqual(["game/images/lucy happy.png"]);
  });

  it("resolves audio names without an extension, and audio.<name>", () => {
    const proj = withEvents(event("music", { music: "theme" }), event("music", { music: "audio.rain" }));
    const files = ["game/audio/theme.ogg", "game/audio/rain.opus", "game/audio/wind.ogg"];
    expect(unused(proj, files)).toEqual(["game/audio/wind.ogg"]);
  });
});

// ─── The game's scripts ───────────────────────────────────────────────────────

describe("findUnusedAssets – the game's own scripts", () => {
  it("keeps files that image and audio definitions point to", () => {
    const scripts = rpy('image bg meadow = "backgrounds/meadow_day.jpg"\ndefine audio.rain = "sfx/rain loop.ogg"');
    const files = ["game/images/backgrounds/meadow_day.jpg", "game/audio/sfx/rain loop.ogg", "game/images/backgrounds/city.jpg"];
    expect(unused(emptyProject(), files, scripts)).toEqual(["game/images/backgrounds/city.jpg"]);
  });

  it("keeps images shown by name, including say attributes and side images", () => {
    const scripts = rpy([
      'define e = Character("Eileen", image="eileen")',
      "label start:",
      "    scene bg street",
      "    show eileen happy",
      '    e sad "I love the beach at sunset."',
    ].join("\n"));
    const files = [
      "game/images/bg street.png", "game/images/eileen happy.png", "game/images/eileen sad.png",
      "game/images/side eileen sad.png", "game/images/side eileen.png",
      "game/images/eileen angry.png", "game/images/bg beach.png", "game/images/beach sunset.png", "game/images/lucy happy.png",
    ];
    expect(unused(emptyProject(), files, scripts)).toEqual([
      "game/images/eileen angry.png", "game/images/bg beach.png", "game/images/beach sunset.png", "game/images/lucy happy.png",
    ]);
  });

  it("keeps audio played by its audio-namespace name", () => {
    const scripts = rpy("label start:\n    play music sunflower\n    play sound audio.door_slam");
    const files = ["game/audio/sunflower.ogg", "game/audio/sfx/Door Slam.ogg", "game/audio/unused theme.ogg"];
    expect(unused(emptyProject(), files, scripts)).toEqual(["game/audio/unused theme.ogg"]);
  });

  it("keeps files whose names are completed at runtime", () => {
    const scripts = rpy([
      "init python:",
      "    for i in range(1, 4):",
      '        renpy.image("cg %d" % i, "gallery/cg%02d.png" % i)',
      '    config.auto_voice = "voice/{id}.ogg"',
      "label start:",
      '    $ renpy.music.play("bgm/" + track)',
      '    $ renpy.show("lucy " + mood)',
      '    show expression "photos/[photo].jpg"',
      '    $ renpy.sound.play(f"sfx/step{n}.ogg")',
      '    $ sprite += "_blush"',
    ].join("\n"));
    const files = [
      "game/images/cg 1.png", "game/images/gallery/cg01.png", "game/audio/voice/start_a170b500.ogg",
      "game/audio/bgm/calm.ogg", "game/images/lucy happy.png", "game/images/photos/beach.jpg",
      "game/audio/sfx/step2.ogg", "game/images/eileen_blush.png", "game/images/gallery/sketch.png", "game/audio/other.ogg",
    ];
    expect(unused(emptyProject(), files, scripts)).toEqual(["game/images/gallery/sketch.png", "game/audio/other.ogg"]);
  });

  it("keeps the files in a folder a script looks in", () => {
    const scripts = rpy('init python:\n    tracks = [f for f in renpy.list_files() if f.startswith("audio/music/")]');
    const files = ["game/audio/music/a.ogg", "game/audio/sfx/b.ogg"];
    expect(unused(emptyProject(), files, scripts)).toEqual(["game/audio/sfx/b.ogg"]);
  });

  it("doesn't let strings that are only filled in at runtime keep every file", () => {
    const scripts = rpy([
      "screen say(who, what):",
      '    text "[who]"',
      "init python:",
      '    label = "%s" % title',
      '    page = "{}".format(n)',
      '    icon = "[name].png"',
      '    build.classify("game/images/**", "archive")',
      '    build.classify("game/**.ogg", None)',
    ].join("\n"));
    const files = ["game/images/unrelated.png", "game/audio/unrelated.ogg"];
    expect(unused(emptyProject(), files, scripts)).toEqual(files);
  });

  it("skips comments", () => {
    const scripts = rpy('label start:\n    # scene bg old\n    ## play music "old theme.ogg"\n    "Hello."');
    const files = ["game/images/bg old.png", "game/audio/old theme.ogg"];
    expect(unused(emptyProject(), files, scripts)).toEqual(files);
  });

  it("skips the live-preview script, which is generated from the project", () => {
    const content = 'label vnv_preview_entry:\n    show expression "images/stale.png"';
    expect(unused(emptyProject(), ["game/images/stale.png"], rpy(content, "game/vnv_preview.rpy"))).toEqual(["game/images/stale.png"]);
    expect(unused(emptyProject(), ["game/images/stale.png"], rpy(content, "game/custom.rpy"))).toEqual([]);
  });
});

// ─── The new-project template ─────────────────────────────────────────────────

describe("findUnusedAssets – the new-project template", () => {
  const templateScripts: ProjectScript[] = Object.entries(
    import.meta.glob<string>("../../Templet/game/*.rpy", { query: "?raw", import: "default", eager: true }),
  ).map(([path, content]) => ({ name: `game/${path.split("/").pop()}`, content }));

  it("reads the template's scripts", () => {
    expect(templateScripts.map(s => s.name)).toEqual(expect.arrayContaining(["game/gui.rpy", "game/screens.rpy"]));
  });

  it("doesn't keep a new project's story assets because of the template's scripts", () => {
    const files = [
      "game/images/bg room.png", "game/images/eileen happy.png", "game/images/side eileen happy.png",
      "game/images/cg01.png", "game/audio/theme.ogg", "game/audio/door.ogg", "game/audio/click.ogg",
    ];
    expect(unused(emptyProject(), files, templateScripts)).toEqual(files);
  });
});
