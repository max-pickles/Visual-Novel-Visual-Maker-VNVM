// ─── VNV Authoring Project Types ──────────────────────────────────────────────
// Native types for the .vnvmaker JSON format.
// Ported from: VNVMaker/game/vn_maker/vn_data.rpy (legacy Ren'Py version)

// ─── Primitive Aliases ────────────────────────────────────────────────────────

export type EventType =
  | 'dialogue' | 'narration' | 'choice' | 'jump' | 'wait'
  | 'bg' | 'image' | 'music' | 'sfx' | 'effect'
  | 'setvar' | 'if' | 'random' | 'animation' | 'movie' | 'camera' | 'raw'
  | 'achievement' | '';

export type Side = 'left' | 'center' | 'right';

// All recognized effect/transition kinds (mirrors Ren'Py built-ins)
export type EffectKind =
  | 'dissolve' | 'fade' | 'flash' | 'pixellate'
  | 'wiperight' | 'wipeleft' | 'wipeup' | 'wipedown'
  | 'slideright' | 'slideleft' | 'slideup' | 'slidedown'
  | string; // allow custom ATL names

// Standard pose names — users can add custom ones
export type Pose = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'custom1' | 'custom2' | string;

// ─── Sub-types ────────────────────────────────────────────────────────────────

export interface VNChoiceOpt {
  id: string;
  text: string;
  /** Target scene id */
  scene: string | null;
  /** Optional Python condition string — only show option if true */
  condition?: string;
  /** Indicates if this is the 'correct' choice that helps later */
  is_correct?: boolean;
  /** Indicates if this is a 'bad' or 'incorrect' choice (e.g. leads to bad end) */
  is_incorrect?: boolean;
  /** Indicates this choice is consequential — gives a key item, unlocks something, etc. */
  is_key?: boolean;
  /** Player must choose before a countdown expires */
  is_timed?: boolean;
  /** Choosing this is irreversible — burns a bridge, kills an NPC, locks a door (kept as it might be structural) */
  // is_irreversible?: boolean; // Removed per plan, use variables
  
  /** Only available when a condition is met; hidden/greyed until unlocked */
  is_hidden?: boolean;
  /** Player can freely revisit this branch (hub-spoke loop) */
  is_repeatable?: boolean;
  /** System-driven repeat until a condition is met (training arc, puzzle retry) */
  is_cond_loop?: boolean;
  /** Target is chosen randomly at runtime (RNG, gacha, dice roll) */
  is_random?: boolean;
}

/** A variable discovered in the project via setvar/if events */
export interface VNVariable {
  name: string;
  /** Inferred default — 'False' for booleans, '0' for numbers, '' for strings */
  default_val: string;
}

export type ATLEasing = 'linear' | 'ease' | 'easein' | 'easeout' | 'none';

export interface VNKeyframe {
  id: string;
  /** Time (in seconds) to transition TO this keyframe from the previous one. (0 for the initial state) */
  duration: number;
  easing: ATLEasing;
  props: {
    // Transform
    xalign?: number;
    yalign?: number;
    xpos?: number;
    ypos?: number;
    xanchor?: number;
    yanchor?: number;
    zoom?: number;
    xzoom?: number;
    yzoom?: number;
    rotate?: number;
    
    // Crop (x, y, w, h)
    cropX?: number;
    cropY?: number;
    cropW?: number;
    cropH?: number;

    // Effects
    alpha?: number;
    additive?: number;
    blur?: number;

    // MatrixColor
    hue?: number;
    contrast?: number;
    saturate?: number;
    bright?: number;
    invert?: number;
  };
}

// ─── Event ────────────────────────────────────────────────────────────────────

export interface VNEvent {
  id: string;
  type: EventType;

  // ── dialogue / narration ──
  /** The speaker. On a choice, the character who says its prompt. */
  char_id?: string | null;
  pose?: Pose;
  text?: string;
  side?: Side;
  dialogue_mode?: 'adv' | 'nvl' | 'bubble';
  /** Text template id */
  tpl_id?: string | null;

  // ── choice / menu ──
  prompt?: string;
  opts?: VNChoiceOpt[];

  // ── jump ──
  scene_id?: string | null;
  transition?: EffectKind;

  // ── wait ──
  dur?: number;

  // ── bg / image / animation / movie / camera ──
  bg?: string;
  image?: string;
  movie?: string;
  /** Inline ATL block for transforms */
  atl_code?: string;
  /** Structured keyframes for ActionEditor-style animations */
  animation_keyframes?: VNKeyframe[];
  
  // ── camera properties ──
  camera_z?: number;
  camera_x?: number;
  camera_y?: number;
  camera_zoom?: number;
  camera_pitch?: number;
  camera_yaw?: number;
  camera_roll?: number;
  camera_dur?: number;

  // ── raw code ──
  raw_code?: string;

  // ── achievement ──
  /** Achievement name/id to grant at runtime */
  achievement_id?: string;

  // ── random branch ──
  /** Ordered list of target scene IDs; Ren'Py picks one at random */
  random_scenes?: string[];
  /** Optional probability weights matching random_scenes (must sum to any positive number) */
  random_weights?: number[];

  // ── music / sfx ──
  music?: string;
  sfx?: string;
  text_beep?: string;
  voice?: string;
  
  /** Audio volume from 0.0 to 1.0 */
  volume?: number;
  fadein?: number;
  fadeout?: number;
  loop?: boolean;

  // ── effect (transition) ──
  kind?: EffectKind;

  // ── setvar ──
  var_name?: string;
  var_val?: string;

  // ── if / branch ──
  condition?: string;
  scene_true?: string | null;
  scene_false?: string | null;

  // ── auto-advance timing ──
  /** Seconds to auto-advance after this event (0 = wait for click) */
  duration?: number;

  // Allow layer sub-events (parallel events on the same click-slot: layer1, layer2...)
  [key: string]: unknown;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

export interface VNScene {
  id: string;
  label: string;
  /** Default background for this scene */
  bg: string | null;
  /** Default music for this scene */
  music: string | null;
  events: VNEvent[];
  /** Manual override: ID of the specific event to use as the scene's thumbnail snapshot */
  thumbnail_event_id?: string;
  /** Override: if true, sprites will not be rendered on the thumbnail */
  thumbnail_hide_sprites?: boolean;
  /**
   * 'dialogue' (default) — a narrative scene with character dialogue.
   * 'screen'   — a menu/navigation screen (main menu, image-button nav, etc.).
   */
  scene_type?: 'dialogue' | 'screen';
  /** Per-scene color grading overlay (maps to Ren'Py MatrixColor on bg events) */
  color_grade?: VNColorGrade;
  /**
   * For END scenes (no outgoing jumps): marks whether this is a good or bad ending.
   * Drives auto-coloring of choice paths on the graph.
   * 'good' = green paths lead here, 'bad' = red dashed paths lead here.
   */
  ending_type?: 'good' | 'bad' | 'odd' | 'stuck' | 'true' | 'normal';
  /** Author notes / synopsis for this scene (IDE-only, not compiled) */
  description?: string;
  /** Scenes contained within this scene (if it acts as a folder) */
  scene_ids?: string[];
  /**
   * The label this scene had in the Ren'Py game it was imported from. Exports
   * keep it, so the game's translations still match its dialogue.
   */
  renpy_label?: string;
}

/** Color grading settings applied to all bg events in this scene.
 *  saturation/contrast use CSS/Ren'Py scale: 1.0 = normal, 0.0 = grayscale/flat.
 *  brightness uses Ren'Py BrightnessMatrix scale: 0.0 = normal, ±1.0 = max shift. */
export interface VNColorGrade {
  saturation: number;   // 0..2  (1 = normal)
  brightness: number;   // -1..1 (0 = normal)
  contrast:   number;   // 0..2  (1 = normal)
  sepia:      number;   // 0..1
  tint?:      string;   // hex color e.g. "#334466"
  tint_mix?:  number;   // 0..1 tint opacity
}

// ─── Character ────────────────────────────────────────────────────────────────

export interface VNCharacter {
  id: string;
  /** Internal identifier name */
  name: string;
  /** Name shown in the dialogue box */
  display: string;
  /**
   * The variable this character had in the Ren'Py game it was imported from
   * (`define s = Character(…)`). Exports keep it, so the game's translations
   * still match its dialogue.
   */
  renpy_name?: string;
  /** Hex color for the character name in dialogue */
  color: string;
  /** Dialogue Mode: ADV (default), NVL (full screen), or Speech Bubble */
  // ── dialogue mode ──
  // removed per user request: moved to VNEvent level
  /** pose name -> flat image file path */
  sprites: Record<string, string>;
  /** If true, uses layered composition instead of flat sprites */
  is_layered?: boolean;
  /** Ordered layer groups (e.g., ["base", "outfit", "eyes", "mouth"]) */
  layer_order?: string[];
  /** pose name -> { layerGroup: filePath } */
  layered_sprites?: Record<string, Record<string, string>>;
  /** Ordered list of pose names for this character */
  poses: string[];
  /** Text prepended to the character name in dialogue, e.g. "~" → "~Eileen says..." */
  name_prefix?: string;
  /** Text appended after the character name in dialogue */
  name_suffix?: string;
  /** Text prepended before every line of dialogue this character speaks */
  dialogue_prefix?: string;
  /** Text appended after every line of dialogue this character speaks */
  dialogue_suffix?: string;
  /** Author notes / profile text (not exported to Ren'Py) */
  notes?: string;
  /** Custom color for the dialogue text */
  what_color?: string;
  /** Click-to-continue displayable */
  ctc?: string;
  /** Click-to-continue position */
  ctc_position?: 'nestled' | 'fixed';
  /** Use slow text (typing effect) */
  slow?: boolean;
  /** Characters per second */
  slow_speed?: number;
  /** Can the player skip the slow text */
  slow_abortable?: boolean;
  // ── Audio & Voice ──
  /** Audio file path for text typing sound (beep) */
  text_beep?: string;
  /** Default voice tag for Ren'Py (e.g. 'v_eileen') */
  voice_tag?: string;

  // ── Dialogue Styling ──
  /** Custom font file path for this character's dialogue */
  custom_font?: string;
  /** Background image path for this character's dialogue box */
  textbox_bg?: string;

  // ── RPG & Affection ──
  /** Whether to track affection points */
  track_affection?: boolean;
  /** Variable name for affection (e.g. eileen_points) */
  affection_var?: string;
  /** Starting value for affection */
  affection_start?: number;

  // ── Default Animations ──
  /** Default on-screen position (left, center, right, or custom transform) */
  default_pos?: string;
  /** Default entrance transition (dissolve, fade, etc) */
  default_trans?: EffectKind;

  // ── Side Images ──
  /** pose name -> side image path */
  side_images?: Record<string, string>;

  // ── Lore & Documentation ──
  /** Character role/title */
  role?: string;
  /** Character age */
  age?: string;
  /** Character motivations/goals */
  motivations?: string;
}

// ─── Folder (scene grouping for the graph view) ───────────────────────────────

export interface VNFolder {
  id: string;
  label: string;
  x: number;
  y: number;
  scene_ids: string[];
  folder_type?: 'folder' | 'hub';
}

// ─── Sticky Note (author notes on the canvas) ─────────────────────────────────

export type NoteColor = "yellow" | "blue" | "green" | "pink" | "purple" | "red";

export interface VNStickyNote {
  id: string;
  text: string;
  color: NoteColor;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Text Style Template ──────────────────────────────────────────────────────

export interface TextTemplate {
  id: string;
  name: string;
  font: string;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  outline: boolean;
  outline_color: string;
  outline_size: number;
  shadow: boolean;
  shadow_color: string;
  box_bg: string;
  box_pad: number;
  /** Characters per second (0 = instant) */
  typing_speed: number;
}

// ─── Transition Template ──────────────────────────────────────────────────────

export interface TransTemplate {
  id: string;
  name: string;
  type: EffectKind;
  dur: number;
  color: string;
}

// ─── Achievement ────────────────────────────────────────────────────────────────

export interface VNAchievement {
  id: string;
  name: string;
  description: string;
  hidden: boolean;
  icon?: string;
}

// ─── Project ──────────────────────────────────────────────────────────────────

export interface VNProject {
  id: string;
  title: string;
  author: string;
  created: number;
  updated: number;
  cover: string | null;
  /** [width, height] in pixels */
  resolution: [number, number];
  characters: VNCharacter[];
  scenes: VNScene[];
  folders: VNFolder[];
  /** id of the first scene to play */
  start: string | null;
  text_tpls: TextTemplate[];
  trans_tpls: TransTemplate[];
  /** scene_id → [x, y] position in graph view */
  layout: Record<string, [number, number]>;
  /** Absolute path to project folder on disk (runtime only, not saved) */
  _rootPath?: string;
  /** Filename of the .vnvmaker file (runtime only, not saved) */
  _filePath?: string;
  /** Author sticky notes on the canvas */
  sticky_notes?: VNStickyNote[];
  /** Configurable main menu layout */
  main_menu?: VNMainMenu;
  /** Defined achievements */
  achievements?: VNAchievement[];
  /**
   * In-app translations: langName → { stringId → translatedText }
   * e.g. { "French": { "sc1_ev0_text": "Bonjour" } }
   */
  translations?: Record<string, Record<string, string>>;
  /** The original source language of the game's text (e.g., 'English', 'Japanese') */
  originalLanguage?: string;
  /**
   * Scripts (relative to the project folder, e.g. "game/script.rpy") copied in
   * when the project was imported from an existing Ren'Py game. A project-folder
   * export replaces these with the compiled story and keeps any other scripts.
   * Missing on projects saved before this was tracked.
   */
  imported_scripts?: string[];
}

// ─── Main Menu Configuration ──────────────────────────────────────────────────

export interface VNMainMenuButton {
  id: string;
  label: string;
  action: 'start' | 'load' | 'preferences' | 'help' | 'about' | 'quit' | 'custom';
  /** Custom Ren'Py action string (when action === 'custom') */
  customAction?: string;
  /** x position 0-100 (percent of screen width) */
  x: number;
  /** y position 0-100 (percent of screen height) */
  y: number;
  visible: boolean;
  style?: {
    fontSize?: number;
    color?: string;
    hoverColor?: string;
    font?: string;
  };
}

export interface VNMainMenu {
  /** Background image name (from assets) */
  background?: string;
  /** Title/logo text shown on the menu */
  title?: string;
  /** Title image (overrides text if set) */
  titleImage?: string;
  buttons: VNMainMenuButton[];
  /** Overall style */
  style?: {
    bgColor?: string;
    titleColor?: string;
    titleFontSize?: number;
    buttonLayout?: 'vertical' | 'horizontal' | 'free';
  };
}

// ─── Canvas Graph Types ──────────────────────────────────────────────────────

export type LinkType = 'jump' | 'call';

// ─── Constants ────────────────────────────────────────────────────────────────

export const VN_POSES: string[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'custom1', 'custom2'];

export const VN_TRANSITIONS: EffectKind[] = [
  'dissolve', 'fade', 'flash', 'pixellate',
  'wiperight', 'wipeleft', 'wipeup', 'wipedown',
  'slideright', 'slideleft', 'none',
];

export const VN_EFFECTS: EffectKind[] = ['dissolve', 'fade', 'flash', 'pixellate'];

export const VN_SIDES: Side[] = ['left', 'center', 'right'];

// ─── Factory Functions ────────────────────────────────────────────────────────
// Mirrors the vn_new_* constructors in vn_data.rpy

export function newProject(
  title = 'My Visual Novel',
  author = 'Author',
  resolution: [number, number] = [1920, 1080],
): VNProject {
  const id = uid();
  const now = Date.now();
  const startScene = newScene('start');
  
  // Provide a placeholder narration event so the user can immediately click and type
  const evStart = newEvent('narration');
  evStart.text = "Start typing your story here...";
  startScene.events = [evStart];

  return {
    id, title, author,
    created: now, updated: now,
    cover: null, resolution,
    characters: [],
    scenes: [startScene],
    folders: [],
    achievements: [],
    imported_scripts: [],
    start: startScene.id,
    text_tpls: [defaultTextTpl()],
    trans_tpls: [defaultTransTpl()],
    layout: { [startScene.id]: [200, 200] },
  };
}

export function newDemoProject(
  title = 'My Visual Novel',
  author = 'Author',
  resolution: [number, number] = [1920, 1080],
): VNProject {
  const proj = newProject(title, author, resolution);
  
  // Character 1: Eileen
  const charEileen = newCharacter('Eileen');
  charEileen.name = 'Eileen';
  charEileen.display = 'Eileen';
  charEileen.color = '#ff99c2';
  // Character 2: System
  const charSys = newCharacter('System');
  charSys.name = 'System';
  charSys.display = 'System';
  charSys.color = '#99ccff';

  proj.characters = [charEileen, charSys];

  // Scenes
  const scStart = newScene('start');
  const scBranch1 = newScene('good_end');
  const scBranch2 = newScene('bad_end');

  scStart.bg = 'gui/game_menu.png'; // fallback to a known renpy built-in gui image
  
  const e1 = newEvent('narration');
  e1.text = 'Welcome to VNV Maker! This is a generated demo project.';
  
  const e2 = newEvent('dialogue');
  e2.char_id = charEileen.id;
  e2.pose = 'happy';
  e2.text = 'Hi there! I am a character. You can edit me in the Characters tab.';
  
  const e3 = newEvent('setvar');
  e3.var_name = 'met_eileen';
  e3.var_val = 'True';

  const e4 = newEvent('choice');
  e4.prompt = 'What do you want to do now?';
  const opt1 = newOpt('See a good ending');
  opt1.scene = scBranch1.id;
  opt1.is_correct = true;
  const opt2 = newOpt('See a bad ending');
  opt2.scene = scBranch2.id;
  opt2.is_incorrect = true;
  e4.opts = [opt1, opt2];

  scStart.events = [e1, e2, e3, e4];

  // Good End Scene
  scBranch1.ending_type = 'good';
  const ge1 = newEvent('dialogue');
  ge1.char_id = charEileen.id;
  ge1.pose = 'happy';
  ge1.text = 'You chose the good ending! Excellent choice.';
  scBranch1.events = [ge1];

  // Bad End Scene
  scBranch2.ending_type = 'bad';
  const be1 = newEvent('dialogue');
  be1.char_id = charSys.id;
  be1.pose = 'neutral';
  be1.text = 'CRITICAL ERROR. Just kidding. This is the bad end.';
  scBranch2.events = [be1];

  proj.scenes = [scStart, scBranch1, scBranch2];
  proj.start = scStart.id;
  
  // Layout nodes nicely
  proj.layout = {
    [scStart.id]: [200, 200],
    [scBranch1.id]: [600, 100],
    [scBranch2.id]: [600, 300]
  };

  return proj;
}

export function newScene(label = 'Scene'): VNScene {
  return { id: uid(), label, bg: null, music: null, events: [], scene_ids: [] };
}

export function newCharacter(name = 'New Character'): VNCharacter {
  return {
    id: uid(),
    name,
    display: name,
    color: '#c8d0ff',
    sprites: Object.fromEntries(VN_POSES.map(p => [p, ''])),
    poses: [...VN_POSES],
    is_layered: false,
    layer_order: ['base', 'outfit', 'eyes', 'mouth'],
    layered_sprites: Object.fromEntries(VN_POSES.map(p => [p, {}])),
  };
}

export function newEvent(type: EventType): VNEvent {
  const id = uid();
  switch (type) {
    case 'dialogue':  return { id, type, char_id: null, pose: 'neutral', text: '', side: 'center', tpl_id: null };
    case 'narration': return { id, type, text: '', tpl_id: null };
    case 'choice':    return { id, type, prompt: '', opts: [newOpt('Option 1'), newOpt('Option 2')] };
    case 'jump':      return { id, type, scene_id: null, transition: 'dissolve' };
    case 'wait':      return { id, type, dur: 1.0 };
    case 'bg':        return { id, type, bg: '' };
    case 'image':     return { id, type, image: '', side: 'center' };
    case 'music':     return { id, type, music: '' };
    case 'sfx':       return { id, type, sfx: '' };
    case 'effect':    return { id, type, kind: 'dissolve', dur: 0.5 };
    case 'setvar':    return { id, type, var_name: '', var_val: 'False' };
    case 'if':        return { id, type, condition: '', scene_true: null, scene_false: null };
    case 'movie':     return { id, type, movie: '' };
    case 'animation': return { id, type, image: '', animation_keyframes: [] };
    case 'camera':    return { id, type, camera_z: 0, camera_x: 0, camera_y: 0, camera_dur: 1.0, camera_zoom: 1.0 };
    case 'achievement': return { id, type, achievement_id: '' };
    case 'random':      return { id, type, random_scenes: ['', ''] };
    case 'raw':       return { id, type, raw_code: '' };
    default:          return { id, type: '' };
  }
}

export function newOpt(text = 'Option'): VNChoiceOpt {
  return { id: uid(6), text, scene: null };
}

// ─── Lookup Utilities ─────────────────────────────────────────────────────────
// Mirrors vn_find_char, vn_find_scene, vn_char_sprite from vn_data.rpy

export function findChar(project: VNProject, charId: string | null | undefined): VNCharacter | null {
  if (!charId) return null;
  return project.characters.find(c => c.id === charId) ?? null;
}

export function findScene(project: VNProject, sceneId: string | null | undefined): VNScene | null {
  if (!sceneId) return null;
  return project.scenes.find(s => s.id === sceneId) ?? null;
}

/**
 * Names that must never get an auto-generated `default`: Python keywords and
 * builtins, and the Ren'Py objects that conditions and generated code rely on.
 * `default renpy = False` or `default len = False` would break the game.
 */
export const RESERVED_VAR_NAMES = new Set([
  // Python keywords and constants
  'True', 'False', 'None', 'and', 'or', 'not', 'is', 'in', 'if', 'else', 'elif',
  'for', 'while', 'lambda', 'return', 'def', 'class', 'import', 'from', 'as',
  'with', 'pass', 'del', 'global', 'nonlocal', 'try', 'except', 'finally',
  'raise', 'yield', 'assert', 'break', 'continue', 'async', 'await',
  // Python builtins
  'len', 'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple', 'min',
  'max', 'abs', 'sum', 'any', 'all', 'range', 'round', 'sorted', 'reversed',
  'enumerate', 'zip', 'map', 'filter', 'isinstance', 'hasattr', 'getattr',
  'type', 'print', 'object', 'id', 'hash', 'chr', 'ord', 'divmod', 'pow',
  // Ren'Py objects and names used by the generated script
  'renpy', 'config', 'persistent', 'store', 'gui', 'preferences', 'achievement',
  'build', 'style', 'ui', 'im', 'layout', 'narrator', 'centered', 'extend',
  'nvl', 'adv', 'Character', 'Transform', 'Fixed', 'Solid', 'Dissolve', 'Fade',
  'Pixellate',
]);

const PY_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Names of story variables a Python condition reads.
 *
 * Skips attribute names (`persistent.seen` → neither), words inside string
 * literals, names starting with `_`, and everything in {@link RESERVED_VAR_NAMES}.
 * Names that are called, indexed or have attributes read (`f(x)`, `inv["key"]`,
 * `player.hp`) are skipped too unless `allReads` is set: they aren't plain
 * values, so they can't safely default to `False`.
 */
export function conditionVarNames(condition: string, { allReads = false } = {}): string[] {
  // Blank out string literals so words inside them aren't mistaken for names.
  const code = condition.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, '""');
  const names: string[] = [];
  for (const m of code.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const name = m[0];
    const start = m.index ?? 0;
    const before = code.slice(0, start);
    const after = code.slice(start + name.length).trimStart();
    if (/[0-9.]$/.test(before) || before.trimEnd().endsWith('.')) continue; // 1e5, 0xff, obj.attr
    if (!allReads && /^[.([]/.test(after)) continue;                        // obj.x, f(), x[0]
    if (name.startsWith('_') || RESERVED_VAR_NAMES.has(name)) continue;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

type ValueKind = 'bool' | 'number' | 'string' | 'list' | 'dict' | 'none' | 'unknown';

/** Rough Python type of a setvar value such as `True`, `3`, `"Bob"` or `points + 1`. */
function valueKind(raw: string): ValueKind {
  const v = raw.trim();
  if (v === 'True' || v === 'False') return 'bool';
  if (v === 'None') return 'none';
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return 'number';
  if (/^[rRuUbBfF]?(["'])[\s\S]*\1$/.test(v) && !/["']\s*[-+*/%]/.test(v)) return 'string';
  if (v.startsWith('[')) return 'list';
  if (v.startsWith('{')) return 'dict';
  if (/^not\b/.test(v) || /==|!=|<=|>=|<|>|\band\b|\bor\b/.test(v)) return 'bool';
  if (/[-+*/%]\s*[\d.]/.test(v) || /[\d.]\s*[-+*/%]/.test(v)) return 'number';
  return 'unknown';
}

const DEFAULT_FOR_KIND: Record<ValueKind, string> = {
  bool: 'False', number: '0', string: '""', list: '[]', dict: '{}', none: 'None', unknown: 'None',
};

/**
 * Scan all setvar, if and choice-condition events in a project to collect
 * auto-initializable variables.
 *
 * The default is the "empty" value of the variable's type — `False`, `0`,
 * `""`, `[]` — not the first value it is assigned: a flag set to `True` on one
 * branch must still start out `False`, and `points = points + 1` can't be its
 * own default. Names only read by conditions default to `False`.
 * Mirrors _vn_extract_vars from vn_compile.rpy.
 */
export function extractVars(project: VNProject): VNVariable[] {
  const assigned = new Map<string, string[]>();
  const read = new Set<string>();

  for (const sc of project.scenes) {
    for (const ev of sc.events) {
      if (ev.type === 'setvar' && ev.var_name?.trim()) {
        const name = ev.var_name.trim();
        const values = assigned.get(name) ?? [];
        values.push(ev.var_val ?? 'False');
        assigned.set(name, values);
      } else if (ev.type === 'if' && ev.condition) {
        conditionVarNames(ev.condition).forEach(n => read.add(n));
      } else if (ev.type === 'choice') {
        for (const opt of ev.opts ?? []) {
          if (opt.condition) conditionVarNames(opt.condition).forEach(n => read.add(n));
        }
      }
    }
  }

  const found = new Map<string, string>();
  for (const [name, values] of assigned) {
    const kind = values.map(valueKind).find(k => k !== 'unknown') ?? 'unknown';
    found.set(name, DEFAULT_FOR_KIND[kind]);
  }
  for (const name of read) {
    if (!found.has(name)) found.set(name, 'False');
  }

  return [...found.entries()]
    .filter(([name]) => PY_IDENT.test(name) && !RESERVED_VAR_NAMES.has(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, default_val]) => ({ name, default_val }));
}

/**
 * Migrate a raw JSON object loaded from disk into a valid VNProject,
 * filling in any missing fields with safe defaults.
 * Mirrors _vn_migrate_project from vn_data.rpy.
 *
 * Fields that aren't listed here are carried over untouched, so data saved by
 * newer features (or fields this function doesn't know about) survives a
 * load → save round-trip.
 */
export function migrateProject(raw: Record<string, unknown>, filePath?: string): VNProject {
  const now = Date.now();

  // Derive id from filepath if missing
  const id = (raw.id as string) ||
    (filePath ? filePath.replace(/\\/g, '/').split('/').pop()?.replace(/\.vnvmaker$/, '') ?? uid() : uid());

  const scenes = Array.isArray(raw.scenes)
    ? (raw.scenes as VNScene[]).map(migrateScene)
    : [];

  const start = (raw.start as string | null) ?? scenes[0]?.id ?? null;

  // Runtime-only paths are never restored from the file contents.
  const { _rootPath: _ignoredRoot, _filePath: _ignoredFile, ...rest } = raw;

  return {
    ...(rest as Partial<VNProject>),
    id,
    title: (raw.title as string) ?? 'Untitled Project',
    author: (raw.author as string) ?? 'Author',
    created: (raw.created as number) ?? now,
    updated: (raw.updated as number) ?? now,
    cover: (raw.cover as string | null) ?? null,
    resolution: (Array.isArray(raw.resolution) && raw.resolution.length === 2)
      ? [raw.resolution[0] as number, raw.resolution[1] as number]
      : [1920, 1080],
    characters: Array.isArray(raw.characters)
      ? (raw.characters as VNCharacter[]).map(migrateCharacter)
      : [],
    scenes,
    folders: Array.isArray(raw.folders) ? (raw.folders as VNFolder[]) : [],
    start,
    text_tpls: Array.isArray(raw.text_tpls) && (raw.text_tpls as unknown[]).length > 0
      ? (raw.text_tpls as TextTemplate[])
      : [defaultTextTpl()],
    trans_tpls: Array.isArray(raw.trans_tpls) && (raw.trans_tpls as unknown[]).length > 0
      ? (raw.trans_tpls as TransTemplate[])
      : [defaultTransTpl()],
    layout: (typeof raw.layout === 'object' && raw.layout !== null)
      ? (raw.layout as Record<string, [number, number]>)
      : {},
    sticky_notes: Array.isArray(raw.sticky_notes) ? (raw.sticky_notes as VNStickyNote[]) : [],
    achievements: Array.isArray(raw.achievements) ? (raw.achievements as VNAchievement[]) : [],
    main_menu: raw.main_menu as VNMainMenu | undefined,
    translations: (typeof raw.translations === 'object' && raw.translations !== null)
      ? (raw.translations as Record<string, Record<string, string>>)
      : undefined,
    _filePath: filePath,
  };
}

function migrateScene(raw: Partial<VNScene>): VNScene {
  return {
    ...raw,
    id: raw.id ?? uid(),
    label: raw.label ?? 'Scene',
    bg: raw.bg ?? null,
    music: raw.music ?? null,
    events: Array.isArray(raw.events) ? raw.events.map(migrateEvent) : [],
    scene_ids: Array.isArray(raw.scene_ids) ? (raw.scene_ids as string[]) : [],
  };
}

function migrateEvent(raw: Partial<VNEvent>): VNEvent {
  const base: VNEvent = {
    id: (raw.id as string) ?? uid(),
    type: (raw.type as EventType) ?? '',
  };
  // Copy all fields from the raw event, preserving unknown keys
  return { ...raw, ...base } as VNEvent;
}

function migrateCharacter(raw: Partial<VNCharacter>): VNCharacter {
  return {
    ...raw,
    id: raw.id ?? uid(),
    name: raw.name ?? 'Character',
    display: raw.display ?? raw.name ?? 'Character',
    color: raw.color ?? '#c8d0ff',
    sprites: raw.sprites ?? Object.fromEntries(VN_POSES.map(p => [p, ''])),
    poses: Array.isArray(raw.poses) && raw.poses.length > 0
      ? raw.poses
      : [...VN_POSES],
    name_prefix:     raw.name_prefix     ?? '',
    name_suffix:     raw.name_suffix     ?? '',
    dialogue_prefix: raw.dialogue_prefix ?? '',
    dialogue_suffix: raw.dialogue_suffix ?? '',
    notes:           raw.notes           ?? '',
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function defaultTextTpl(): TextTemplate {
  return {
    id: 'default', name: 'Default',
    font: 'DejaVuSans.ttf', size: 22,
    color: '#ffffff', bold: false, italic: false,
    outline: true, outline_color: '#000000', outline_size: 2,
    shadow: false, shadow_color: '#000000aa',
    box_bg: '#00000099', box_pad: 20, typing_speed: 0,
  };
}

function defaultTransTpl(): TransTemplate {
  return { id: 'default', name: 'Dissolve', type: 'dissolve', dur: 0.5, color: '#000000' };
}

export function uid(len = 8): string {
  return Math.random().toString(36).slice(2, 2 + len).padEnd(len, '0');
}
