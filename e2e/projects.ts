/** Saved projects the smoke tests open through the mocked games folder. */
import type { VNProject, VNScene } from "../src/types";

const project = (title: string, fields: Partial<VNProject>): VNProject => ({
  id: title.toLowerCase(), title, author: "Tester", created: 0, updated: 0, cover: null, resolution: [1280, 720],
  characters: [], scenes: [], folders: [], start: null, text_tpls: [], trans_tpls: [], layout: {},
  ...fields,
});

const scene = (id: string, events: VNScene["events"]): VNScene => ({ id, label: id, bg: null, music: null, events });

/**
 * Dialogue whose Ren'Py text tags try to smuggle an event handler into the
 * preview's HTML. Only the {b} tag should take effect.
 */
export const markupProject = project("Markup", {
  characters: [{ id: "eve", name: "Eve", display: "Eve", color: "#ff99c2", sprites: {}, poses: ["neutral"] }],
  scenes: [scene("start", [
    {
      id: "e1", type: "dialogue", char_id: "eve", pose: "neutral", side: "center",
      text: "{color=red' onmouseover='window.__xss=1' style='position:fixed;inset:0;z-index:99999}Hover me{/color} and {b}bold{/b}",
    },
    { id: "e2", type: "narration", text: "Second line" },
  ])],
  start: "start",
  layout: { start: [200, 200] },
});

/** Events that each take a different kind of file, and a jump, which takes none. */
export const assetsProject = project("Assets", {
  scenes: [
    scene("start", [
      { id: "sfx", type: "sfx", sfx: "" },
      { id: "music", type: "music", music: "" },
      { id: "line", type: "narration", text: "A voiced line" },
      { id: "movie", type: "movie", movie: "" },
      { id: "bg", type: "bg", bg: "" },
      { id: "talk", type: "dialogue", char_id: null, text: "A voiced line of dialogue." },
      { id: "jump", type: "jump", scene_id: "end", transition: "dissolve" },
    ]),
    scene("end", [{ id: "end1", type: "narration", text: "The end" }]),
  ],
  start: "start",
  layout: { start: [0, 0], end: [300, 0] },
});

/**
 * A second scene whose preview has to start with what the first one left on
 * screen (a background, an image and a speaker), then show a layered
 * character who speaks first in it.
 */
export const stageProject = project("Stage", {
  characters: [
    { id: "eve", name: "Eve", display: "Eve", color: "#c8d0ff", sprites: { neutral: "images/eve.png" }, poses: ["neutral"] },
    {
      id: "lay", name: "Lay", display: "Lay", color: "#c8d0ff", sprites: {}, poses: ["neutral"],
      is_layered: true, layer_order: ["base", "eyes"], layered_sprites: { neutral: { base: "images/base.png", eyes: "images/eyes.png" } },
    },
  ],
  scenes: [
    scene("first", [
      { id: "f1", type: "bg", bg: "images/room.png" },
      { id: "f2", type: "image", image: "images/cat.png", side: "left" },
      { id: "f3", type: "dialogue", char_id: "eve", pose: "neutral", side: "right", text: "Hello from the first scene." },
      { id: "f4", type: "jump", scene_id: "second" },
    ]),
    scene("second", [
      { id: "s1", type: "dialogue", char_id: "lay", pose: "neutral", side: "center", text: "Layered hello." },
      { id: "s2", type: "narration", text: "The end." },
    ]),
  ],
  start: "first",
  layout: { first: [0, 0], second: [300, 0] },
});

/** One achievement, whose icon is chosen with the asset picker. */
export const pickerProject = project("Picker", {
  scenes: [scene("start", [{ id: "a", type: "narration", text: "Hello" }])],
  start: "start",
  layout: { start: [0, 0] },
  achievements: [{ id: "first", name: "First Steps", description: "Start the game", hidden: false }],
});

/** Variables and a condition that the playtest has to evaluate to pick a branch. */
export const logicProject = project("Logic", {
  scenes: [
    scene("start", [
      { id: "a", type: "narration", text: "Starting" },
      { id: "b", type: "setvar", var_name: "points", var_val: "1" },
      { id: "c", type: "setvar", var_name: "points", var_val: "points + 2" },
      { id: "d", type: "setvar", var_name: "name", var_val: "'Bob'" },
      { id: "e", type: "if", condition: "points >= 3 and name == 'Bob' and 'o' in name", scene_true: "good", scene_false: "bad" },
      { id: "f", type: "narration", text: "Fell through" },
    ]),
    scene("good", [{ id: "g", type: "narration", text: "Good path reached" }]),
    scene("bad", [{ id: "h", type: "narration", text: "Bad path reached" }]),
  ],
  start: "start",
  layout: { start: [0, 0], good: [300, 0], bad: [300, 200] },
});

/**
 * A route through three scenes that sets a background and variables on the
 * way, for starting play partway through.
 */
export const routeProject = project("Route", {
  scenes: [
    scene("opening", [
      { id: "o1", type: "narration", text: "Opening line" },
      { id: "o2", type: "bg", bg: "park.png" },
      { id: "o3", type: "setvar", var_name: "met", var_val: "True" },
      { id: "o4", type: "setvar", var_name: "points", var_val: "2" },
      { id: "o5", type: "jump", scene_id: "middle" },
    ]),
    scene("middle", [
      { id: "m1", type: "narration", text: "Middle line" },
      { id: "m2", type: "setvar", var_name: "points", var_val: "points + 1" },
      { id: "m3", type: "narration", text: "Second middle line" },
      { id: "m4", type: "setvar", var_name: "points", var_val: "points + 10" },
      { id: "m5", type: "jump", scene_id: "finale" },
    ]),
    scene("finale", [{ id: "f1", type: "narration", text: "Finale line" }]),
  ],
  start: "opening",
  layout: { opening: [0, 0], middle: [300, 0], finale: [600, 0] },
});
