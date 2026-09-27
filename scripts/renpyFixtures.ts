/**
 * renpyFixtures.ts — Build Ren'Py games from VNVMaker projects, laid out the
 * way the app writes them, so scripts/check-renpy.sh can lint and play them
 * with a real Ren'Py SDK.
 *
 * Usage (see check-renpy.sh): node renpyFixtures.mjs <outDir> <renpyCheckout> <repoRoot>
 *
 * Each project is written in the layouts the app produces:
 *   <name>-export   Export → Project folder (compiled script.rpy + scene files)
 *   <name>-single   Export → Save .rpy (one compiled script.rpy)
 *   <name>-preview  the preview file written on every save, next to the game's own scripts
 *   <name>-play     Play from Here on the start scene (linted only: it loops by design)
 *   <name>-later    Play from Here on the scene furthest into the story, which
 *                   replays the route there first (linted only, like -play)
 *   <name>-line     the same from the middle line of that scene
 * The replay-* games check what Play from Here sets up in a running game.
 * Playable layouts get a vnv_testcases.rpy (next to game/, since lint reports
 * testcase statements as unreachable) that clicks through to the end. An
 * export whose translations must still match its dialogue gets a
 * vnv_translations.txt listing the languages to check.
 */
import fs from "node:fs";
import path from "node:path";
import { newProject, newDemoProject, newCharacter, newEvent, newScene } from "../src/types";
import type { VNProject, VNCharacter, VNEvent, VNScene } from "../src/types";
import { compileProject, compileProjectToFiles, compilePreview } from "../src/compiler";
import { findRoute } from "../src/routeReplay";
import { importFromRpyFiles } from "../src/rpyImporter";
import { declaredVarNames, declaredLabelNames } from "../src/rpyDeclarations";
import { isReplacedByExport } from "../src/exportScripts";

const [OUT, RENPY, ROOT] = process.argv.slice(2);
if (!OUT || !RENPY || !ROOT) throw new Error("usage: renpyFixtures.mjs <outDir> <renpyCheckout> <repoRoot>");
const TEMPLATE = path.join(ROOT, "Templet/game");
const PLACEHOLDER = fs.readFileSync(path.join(TEMPLATE, "gui/window_icon.png"));

// ─── File helpers ─────────────────────────────────────────────────────────────

function copyDir(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === "cache" || e.name === "saves" || e.name.endsWith(".rpyc")) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function walk(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).replace(/\\/g, "/")];
  });
}

/** A fresh game folder copied from `fromGame`; returns its game/ directory. */
function newGame(name: string, fromGame: string): string {
  const game = path.join(OUT, name, "game");
  fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
  copyDir(fromGame, game);
  return game;
}

/** Placeholder files for the images and audio a project references. */
function addPlaceholders(game: string, files: string[]): void {
  for (const f of files) {
    const p = path.join(game, f);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) fs.writeFileSync(p, PLACEHOLDER);
  }
}

/** The game's other scripts, as the app reads them (without the preview script). */
function scriptsIn(game: string): string[] {
  return walk(game)
    .filter(f => f.endsWith(".rpy") && !f.endsWith("vnv_preview.rpy"))
    .map(f => fs.readFileSync(path.join(game, f), "utf8"));
}

/** What the app passes as declaredElsewhere: names the other scripts declare. */
function declaredIn(game: string): Set<string> {
  return declaredVarNames(scriptsIn(game));
}

/** A testcase that starts the game, makes the given choices and plays to the end. */
function addPlaythrough(game: string, choices: string[]): void {
  const steps = choices.flatMap(c => ['    advance until screen "choice"', `    click "${c}"`]);
  fs.writeFileSync(path.join(game, "..", "vnv_testcases.rpy"), [
    "testsuite global:",
    "    before testcase:",
    "        $ _test.transition_timeout = 0.05",
    "        $ _test.timeout = 20.0",
    '        if not screen "main_menu":',
    "            run MainMenu(confirm=False)",
    "    teardown:",
    "        exit",
    "",
    "testcase vnv_play:",
    '    click "Start"',
    ...steps,
    '    advance until screen "main_menu"',
    "",
  ].join("\n"));
}

/**
 * Write every layout for `proj`. `fromGame` is the game folder the project
 * lives in (the template for new projects, the original game for imports);
 * `replaced` lists the scripts an export removes.
 */
function emit(
  name: string,
  proj: VNProject,
  opts: { fromGame?: string; files?: string[]; choices?: string[]; replaced?: string[]; translations?: string[] } = {},
): void {
  const { fromGame = TEMPLATE, files = [], choices = [], replaced = ["script.rpy"], translations = [] } = opts;

  let game = newGame(`${name}-export`, fromGame);
  addPlaceholders(game, files);
  for (const f of replaced) fs.rmSync(path.join(game, f), { force: true });
  const kept = scriptsIn(game);
  for (const f of compileProjectToFiles(proj, { declaredElsewhere: declaredVarNames(kept), labelsElsewhere: declaredLabelNames(kept) })) {
    fs.writeFileSync(path.join(game, f.filename), f.content);
  }
  addPlaythrough(game, choices);
  if (translations.length) fs.writeFileSync(path.join(game, "..", "vnv_translations.txt"), translations.join("\n") + "\n");

  if (fromGame === TEMPLATE) {
    game = newGame(`${name}-single`, fromGame);
    addPlaceholders(game, files);
    fs.writeFileSync(path.join(game, "script.rpy"), compileProject(proj, { asExport: true }));
    addPlaythrough(game, choices);
  }

  game = newGame(`${name}-preview`, fromGame);
  addPlaceholders(game, files);
  fs.writeFileSync(path.join(game, "vnv_preview.rpy"),
    compilePreview(proj, "main_menu", { declaredElsewhere: declaredIn(game) }));
  addPlaythrough(game, choices);

  game = newGame(`${name}-play`, fromGame);
  addPlaceholders(game, files);
  fs.writeFileSync(path.join(game, "vnv_preview.rpy"),
    compilePreview(proj, proj.start ?? undefined, { declaredElsewhere: declaredIn(game) }));

  const later = furthestScene(proj);
  if (later) {
    game = newGame(`${name}-later`, fromGame);
    addPlaceholders(game, files);
    fs.writeFileSync(path.join(game, "vnv_preview.rpy"), compilePreview(proj, later.id, { declaredElsewhere: declaredIn(game) }));

    game = newGame(`${name}-line`, fromGame);
    addPlaceholders(game, files);
    const startEventId = later.events[Math.floor(later.events.length / 2)]?.id;
    fs.writeFileSync(path.join(game, "vnv_preview.rpy"), compilePreview(proj, later.id, { declaredElsewhere: declaredIn(game), startEventId }));
  }
}

/** The scene with the longest route from the start, where Play from Here replays the most. */
function furthestScene(proj: VNProject): VNScene | null {
  let furthest: VNScene | null = null;
  let steps = 0;
  for (const sc of proj.scenes) {
    const route = findRoute(proj, sc.id);
    if (route && route.length > steps) { furthest = sc; steps = route.length; }
  }
  return furthest;
}

// ─── The demo project from the New Project wizard ────────────────────────────

emit("demo", newDemoProject("Demo", "Tester"), { choices: ["See a good ending"] });

// ─── Names, variables and events that used to produce invalid Ren'Py ─────────

{
  const p = newProject("Tricky", "Tester");
  const files: string[] = ["audio/theme.ogg", "audio/ding.ogg"];
  const file = (f: string) => { files.push(f); return f; };
  const say = (sc: VNScene, c: VNCharacter, text: string, pose = "neutral") => {
    const e = newEvent("dialogue"); e.char_id = c.id; e.text = text; e.pose = pose; sc.events.push(e);
  };

  const obrien = newCharacter("Dr. O'Brien");
  Object.assign(obrien, { display: "O'Brien", color: "#ff0000", name_prefix: "'", dialogue_suffix: " it's",
    side_images: { neutral: file("images/side_obrien.png") } });
  obrien.sprites.neutral = file("images/obrien.png");
  obrien.poses.push("very happy");
  obrien.sprites["very happy"] = file("images/obrien_vh.png");
  const mary = newCharacter("Mary Jane"); mary.sprites.neutral = file("images/mary.png");
  const keyword = newCharacter("at"); keyword.sprites.neutral = file("images/at.png");
  const sakura = newCharacter("さくら"); sakura.sprites.happy = file("images/sakura_happy.png");
  const layered = newCharacter("Layer Girl");
  Object.assign(layered, { is_layered: true, layer_order: ["base", "eyes"],
    layered_sprites: { neutral: { base: file("images/lg_base.png"), eyes: file("images/lg_eyes.png") } } });
  const badColor = newCharacter("Pinky"); badColor.color = "pinkish";
  p.characters.push(obrien, mary, keyword, sakura, layered, badColor);
  p.achievements = [{ id: "a1", name: "Finished", description: "d", hidden: false }];

  const s1 = p.scenes[0];
  s1.events = [];
  const good = newScene("good_path"), bad = newScene("bad_path"), other = newScene("random_other");
  p.scenes.push(good, bad, other);

  const bg = newEvent("bg"); bg.bg = file("images/bg_room.png"); bg.transition = "dissolve"; s1.events.push(bg);
  const n = newEvent("narration"); n.text = 'A "quoted" line with {b}tags{/b} and a \\ backslash.'; s1.events.push(n);
  say(s1, obrien, "Hello there."); say(s1, obrien, "Great news!", "very happy");
  say(s1, mary, "Hi."); say(s1, keyword, "I'm named after a keyword."); say(s1, sakura, "こんにちは", "happy");
  say(s1, layered, "Layered."); say(s1, badColor, "Bad color.");
  for (const [k, v] of [["met_eileen", "True"], ["points", "0"], ["points", "points + 1"], ["name", '"Bob"'],
                        ["items", '["key"]'], ["roll", "renpy.random.randint(1, 6)"]]) {
    const e = newEvent("setvar"); e.var_name = k; e.var_val = v; s1.events.push(e);
  }
  const cam = newEvent("camera");
  Object.assign(cam, { camera_x: 10, camera_zoom: 1.2, camera_pitch: 5, camera_yaw: -5, camera_roll: 2 });
  s1.events.push(cam);
  for (const kind of ["dissolve", "fade", "flash", "pixellate", "wipeleft"]) {
    const e = newEvent("effect"); e.kind = kind; s1.events.push(e);
  }
  const music = newEvent("music"); Object.assign(music, { music: "audio/theme.ogg", volume: 0.5, fadein: 1, loop: false }); s1.events.push(music);
  const sfx = newEvent("sfx"); sfx.sfx = "audio/ding.ogg"; s1.events.push(sfx);
  const wait = newEvent("wait"); wait.dur = 0.5; s1.events.push(wait);
  const anim = newEvent("animation"); anim.image = file("images/anim.png");
  anim.animation_keyframes = [
    { id: "k1", duration: 0, easing: "linear", props: { xalign: 0.2, alpha: 0 } },
    { id: "k2", duration: 1, easing: "ease", props: { xalign: 0.8, alpha: 1, zoom: 1.2, hue: 30, contrast: 1.2 } },
  ];
  s1.events.push(anim);
  const ach = newEvent("achievement"); ach.achievement_id = "Finished"; s1.events.push(ach);
  const raw = newEvent("raw"); raw.raw_code = '$ renpy.notify("raw code")'; s1.events.push(raw);
  const choice = newEvent("choice");
  choice.prompt = "Pick one";
  choice.opts![0].text = "Go good"; choice.opts![0].scene = good.id; choice.opts![0].condition = "points > 0 and has_key";
  choice.opts![1].text = "Go on"; choice.opts![1].scene = null;
  s1.events.push(choice);
  const cond = newEvent("if");
  cond.condition = 'persistent.seen_end and len(items) > 0 and renpy.seen_label("start") and name == "Bob"';
  cond.scene_true = good.id; cond.scene_false = bad.id;
  s1.events.push(cond);
  const rnd = newEvent("random"); rnd.random_scenes = [good.id, other.id]; rnd.random_weights = [2, 1]; bad.events.push(rnd);
  say(good, obrien, "The end."); good.ending_type = "good";
  say(other, mary, "Another end.");
  emit("tricky", p, { files, choices: ["Go on"] });
}

// ─── Ren'Py's sample game, imported through the app's importer ───────────────

{
  const source = path.join(RENPY, "the_question/game");
  const scripts = walk(source).filter(f => f.endsWith(".rpy"));
  const files = scripts.map(f => ({ name: f, content: fs.readFileSync(path.join(source, f), "utf8") }));
  const images = walk(source).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
  const { project } = importFromRpyFiles(files, source, "the_question", "Author", images);

  // The sample's own testcases.rpy doesn't pass lint on its own; leave it out.
  const game = path.join(OUT, "_question");
  copyDir(source, game);
  fs.rmSync(path.join(game, "testcases.rpy"), { force: true });
  const imported = scripts.filter(f => f !== "testcases.rpy").map(f => `game/${f}`);
  emit("question", project, {
    fromGame: game,
    choices: ["ask her right away", "an interactive book"],
    // What the app's export removes; the game's translations stay and must still match.
    replaced: imported.filter(f => isReplacedByExport(f, imported)).map(f => f.slice("game/".length)),
    translations: fs.readdirSync(path.join(source, "tl")).filter(l => l !== "None"),
  });
  fs.rmSync(game, { recursive: true, force: true });
}

// ─── An imported game that declares its own defaults, then edited in VNVMaker ─

{
  const source = path.join(OUT, "_affection");
  copyDir(TEMPLATE, source);
  fs.writeFileSync(path.join(source, "script.rpy"), [
    'define e = Character(_("Eileen"), color="#c8ffc8")',
    "default affection = 0",
    "default met_eileen = False",
    "",
    "label start:",
    '    e "Hello!"',
    "    $ affection += 1",
    "    jump ending",
    "",
    "label ending:",
    '    "The end."',
    "    return",
    "",
  ].join("\n"));
  const files = [{ name: "script.rpy", content: fs.readFileSync(path.join(source, "script.rpy"), "utf8") }];
  const { project } = importFromRpyFiles(files, source, "affection", "Author", []);
  const start = project.scenes.find(s => s.id === project.start) ?? project.scenes[0];
  for (const [k, v] of [["affection", "affection + 1"], ["met_eileen", "True"], ["route", '"eileen"']]) {
    const e = newEvent("setvar"); e.var_name = k; e.var_val = v;
    start.events.splice(start.events.length - 1, 0, e); // before the scene's final jump
  }
  emit("affection", project, { fromGame: source, replaced: ["script.rpy"] });
  fs.rmSync(source, { recursive: true, force: true });
}

// ─── Play from Here further into a story: what the replayed route sets up ─────

/** A short silent WAV, so the music a check listens for can really play. */
function silentWav(seconds = 1, rate = 8000): Buffer {
  const samples = seconds * rate;
  const wav = Buffer.alloc(44 + samples, 0x80); // 8-bit PCM silence
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + samples, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34);
  wav.write("data", 36); wav.writeUInt32LE(samples, 40);
  return wav;
}

{
  const p = newProject("Replay", "Tester");
  const e = (type: VNEvent["type"], fields: Partial<VNEvent> = {}): VNEvent => ({ ...newEvent(type), ...fields });
  const eileen = newCharacter("Eileen");
  eileen.sprites.happy = "images/eileen_happy.png";
  p.characters.push(eileen);
  const start = p.scenes[0];
  const later = newScene("later");
  p.scenes.push(later);
  start.events = [
    e("bg", { bg: "images/room.png", transition: "dissolve" }),
    e("image", { image: "images/old.png", side: "right" }),
    e("bg", { bg: "images/park.png" }),
    e("image", { image: "images/cat.png", side: "left" }),
    e("dialogue", { char_id: eileen.id, pose: "happy", side: "right", text: "Hi!" }),
    e("music", { music: "audio/theme.wav" }),
    e("sfx", { sfx: "audio/rain.wav", loop: true }),
    e("setvar", { var_name: "met", var_val: "True" }),
    e("raw", { raw_code: [
      'show expression "images/raw.png" as rawimg at center with dissolve',
      "$ met_count = 3",
      "$ met_count += 2",
      "$ renpy.pause(30.0)",
      "if met_count > 99:",
      "    $ secret = True",
    ].join("\n") }),
    e("camera", { camera_x: 10, camera_zoom: 1.2, camera_dur: 4 }),
    e("wait", { dur: 30 }),
    e("jump", { scene_id: later.id }),
  ];
  later.events = [e("narration", { text: "Later on." }), e("bg", { bg: "images/night.png" }), e("narration", { text: "At night." })];
  const images = ["room", "old", "park", "cat", "eileen_happy", "raw", "night"].map(f => `images/${f}.png`);

  // Each check waits until play stops at the first line of `label`, then looks
  // at what the replay set up. The long pauses above would time it out if the
  // replay ran them.
  const check = (name: string, label: string, asserts: string[], startEventId?: string) => {
    const game = newGame(`replay-${name}`, TEMPLATE);
    addPlaceholders(game, images);
    fs.mkdirSync(path.join(game, "audio"), { recursive: true });
    for (const f of ["audio/theme.wav", "audio/rain.wav"]) fs.writeFileSync(path.join(game, f), silentWav());
    const rpy = compilePreview(p, later.id, { declaredElsewhere: declaredIn(game), startEventId });
    fs.writeFileSync(path.join(game, "vnv_preview.rpy"), rpy);
    const lines = rpy.split("\n");
    const firstLine = lines.indexOf(`label ${label}:`) + 2; // 1-based line after the label
    fs.writeFileSync(path.join(game, "..", "vnv_testcases.rpy"), [
      "testcase vnv_play:",
      `    assert eval renpy.get_filename_line()[0].endswith("vnv_preview.rpy") and renpy.get_filename_line()[1] == ${firstLine} timeout 20.0`,
      ...asserts.map(a => `    assert eval ${a}`),
      '    assert eval renpy.music.get_playing("music") == "audio/theme.wav" timeout 10.0',
      '    assert eval renpy.music.get_playing("sound") == "audio/rain.wav" timeout 10.0',
      "    assert eval met is True and met_count == 5 and not hasattr(store, 'secret')",
      "    exit",
      "",
    ].join("\n"));
  };
  check("later", `vns_scene_${later.id}`, [
    'renpy.showing("images/cat.png") and renpy.showing("Eileen") and renpy.showing("rawimg")',
    'not renpy.showing("images/old.png")',
  ]);
  // From the last line, after the night background cleared the sprites.
  check("line", "vnv_preview_from", [
    'len(renpy.get_showing_tags("master")) == 1',
    'not renpy.showing("images/cat.png") and not renpy.showing("Eileen")',
  ], later.events[2].id);
}

console.log(`Wrote ${fs.readdirSync(OUT).length} games to ${OUT}`);
