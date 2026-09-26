/**
 * assetRefs.ts — Which images and sounds a project uses, for the Export panel's
 * unused-asset cleaner.
 *
 * Cleaning deletes files for good, so every rule here errs towards "used": a
 * file only counts as unused when nothing could refer to it, neither the way
 * Ren'Py resolves a name nor the looser way the editor's previews and
 * diagnostics do.
 *
 * References come from:
 * - Every asset field in the project: backgrounds, sprites, layered and side
 *   images, music, sounds, voices, movies, text beeps, fonts, textboxes, the
 *   cover, main menu images and achievement icons. Fields are found by name
 *   anywhere in the project, so a field left on an event of another type still
 *   counts. Any other string that looks like a file path counts too, as do
 *   `{image=…}` and `{font=…}` text tags.
 * - Code: raw-code events, ATL, conditions, variable values, custom menu
 *   actions, and the game's own `.rpy` scripts (an imported game's story, its
 *   `image` definitions, its screens), which stay live in the project folder.
 *
 * The stored values come in every shape: root-relative (`game/images/bg.png`),
 * game-relative (`images/bg.png`), bare (`theme.ogg`), absolute, and Ren'Py
 * image names (`bg meadow`) or audio names (`audio.theme`).
 *
 * Pure functions, no I/O: the Export panel reads the files and scripts.
 */

import type { VNProject } from "./types";

// ─── Public API ───────────────────────────────────────────────────────────────

/** A `.rpy` file in the project folder: its path relative to the folder, and its text. */
export interface ProjectScript {
  /** e.g. `game/script.rpy` */
  name: string;
  content: string;
}

/** Everything a project and its scripts could be referring to when they name an asset. */
export interface AssetRefs {
  /** File paths and Ren'Py image or audio names, as written (trimmed). */
  names: Set<string>;
  /**
   * Names that are only complete at runtime, like `"cg[n].png"` or
   * `"eileen " + mood`, with `*` for the unknown parts. Lowercase, with
   * spaces and underscores written as `_`.
   */
  patterns: Set<string>;
  /** Every word in the project's code and scripts, lowercase: image tags and attributes, audio names. */
  words: Set<string>;
}

/** The folders the cleaner deletes from, relative to the project folder. */
export const CLEANABLE_FOLDERS = ["game/images/", "game/audio/"] as const;

/**
 * Collect every reference to an asset in `project` and in `scripts`, the
 * project folder's `.rpy` files. The live-preview script is skipped: it's
 * generated from the project, which is read directly.
 */
export function collectAssetRefs(project: VNProject, scripts: readonly ProjectScript[] = []): AssetRefs {
  const refs: AssetRefs = { names: new Set(), patterns: new Set(), words: new Set() };

  // Walk every value without recursing: project files are untrusted and can
  // nest deeply.
  const stack: [unknown, Use][] = [[project, "text"]];
  const visited = new Map<object, Set<Use>>();
  while (stack.length > 0) {
    const [value, use] = stack.pop()!;
    if (typeof value === "string") {
      addString(refs, value, use);
    } else if (typeof value === "object" && value !== null && !visited.get(value)?.has(use)) {
      visited.set(value, (visited.get(value) ?? new Set<Use>()).add(use));
      if (Array.isArray(value)) {
        for (const item of value) stack.push([item, use]);
      } else {
        for (const [key, item] of Object.entries(value)) {
          if (!SKIPPED_FIELDS.has(key)) stack.push([item, fieldUse(key, use)]);
        }
      }
    }
  }

  for (const script of scripts) {
    if (!isPreviewScript(script.name)) scanCode(refs, script.content);
  }
  return refs;
}

/**
 * The files in `files` that can be deleted: inside `game/images/` or
 * `game/audio/`, and not referred to by anything in `refs`.
 *
 * @param files - Paths relative to the project folder, as `listAssetFiles`
 *                returns them (`game/images/bg.png`).
 */
export function findUnusedAssets(files: readonly string[], refs: AssetRefs): string[] {
  const index = indexRefs(refs);
  return [...new Set(files)].filter(f => isCleanable(f) && !isUsed(f, index));
}

/** Whether the cleaner may delete `path` (relative to the project folder) when nothing uses it. */
export function isCleanable(path: string): boolean {
  const parts = path.split(/[\\/]/);
  return CLEANABLE_FOLDERS.some(folder => path.startsWith(folder))
    && parts[parts.length - 1] !== ""
    && !parts.some(part => part === "..");
}

// ─── Project fields ───────────────────────────────────────────────────────────

/** How a string found in the project is used. */
type Use = "text" | "asset" | "code";

/** Fields that hold one asset: a file path, or a Ren'Py image or audio name. */
const ASSET_FIELDS = new Set([
  "bg", "image", "movie", "music", "sfx", "voice", "audio", "text_beep", // events, scenes
  "cover",                                                              // project
  "textbox_bg", "ctc", "custom_font",                                   // characters
  "font", "box_bg",                                                     // text templates, menu buttons
  "background", "titleImage",                                           // main menu
  "icon",                                                               // achievements
]);

/** Fields that hold assets by pose, or by pose and layer. */
const ASSET_MAP_FIELDS = new Set(["sprites", "side_images", "layered_sprites"]);

/** Fields that hold Ren'Py or Python code. */
const CODE_FIELDS = new Set(["raw_code", "atl_code", "condition", "var_val", "customAction"]);

/** Where the project is on this machine (runtime only, never part of the game). */
const SKIPPED_FIELDS = new Set(["_rootPath", "_filePath"]);

function fieldUse(key: string, parent: Use): Use {
  if (CODE_FIELDS.has(key)) return "code";
  if (ASSET_FIELDS.has(key) || ASSET_MAP_FIELDS.has(key)) return "asset";
  return parent;
}

function isPreviewScript(name: string): boolean {
  return /^(?:\.\/)?game\/vnv_preview\.rpy$/.test(name.replace(/\\/g, "/"));
}

/** File extensions of the images, audio, video and fonts Ren'Py loads. */
const ASSET_EXT = /\.(?:png|jpe?g|webp|gif|bmp|avif|svg|tga|ogg|oga|mp3|wav|opus|flac|m4a|aac|webm|mp4|m4v|mkv|avi|mov|ogv|mpe?g|ttf|otf|ttc|woff2?)$/i;

/** Ren'Py text tags that show an image or switch font: `{image=icon.png}`, `{font=f.ttf}`. */
const FILE_TEXT_TAG = /\{\s*(?:image|font)\s*=\s*([^}]*)\}/gi;

/** Longer strings are dialogue or code, never a file name. */
const MAX_NAME_LENGTH = 1000;

function addString(refs: AssetRefs, value: string, use: Use): void {
  if (use === "code") {
    scanCode(refs, value);
    return;
  }
  addTextTags(refs, value);
  if (use === "asset") {
    addName(refs, value);
    // Values like `expression "bg.png"` or `Solid("#000")` are code.
    if (/["'(]/.test(value)) scanCode(refs, value);
    // Ren'Py fills in [interpolations] in an image name at runtime.
    if (value.includes("[")) addPattern(refs, runtimeParts(value, ""));
  } else if (looksLikePath(value)) {
    addName(refs, value);
  }
}

function looksLikePath(value: string): boolean {
  const s = value.trim();
  return s.length <= MAX_NAME_LENGTH && !s.includes("\n") && (ASSET_EXT.test(s) || /[\\/]/.test(s));
}

function addTextTags(refs: AssetRefs, text: string): void {
  if (!text.includes("{")) return;
  for (const m of text.matchAll(FILE_TEXT_TAG)) addName(refs, m[1]);
}

function addName(refs: AssetRefs, value: string): void {
  const name = value.trim();
  if (!name || name.length > MAX_NAME_LENGTH) return;
  refs.names.add(name);
  // The editor's audio previews ignore quotes around a file name.
  const unquoted = name.replace(/["']/g, "").trim();
  if (unquoted && unquoted !== name) refs.names.add(unquoted);
}

function addWords(refs: AssetRefs, text: string): void {
  for (const m of text.normalize("NFC").matchAll(/[\p{L}\p{M}\p{N}]+/gu)) refs.words.add(m[0].toLowerCase());
}

function addPattern(refs: AssetRefs, value: string): void {
  const pattern = loose(gameRelative(value)).replace(/\*+/g, "*");
  if (!pattern.includes("*") || pattern.length > MAX_NAME_LENGTH) return;
  // "*" or "*.png" doesn't narrow anything down. The values filled in are
  // references of their own.
  const known = pattern.replace(/\*/g, "").replace(/\.[a-z0-9]{1,5}$/, "");
  if (/[\p{L}\p{N}]/u.test(known)) refs.patterns.add(pattern);
}

// ─── Code ─────────────────────────────────────────────────────────────────────

const WORD = /[\p{L}\p{M}\p{N}_]+/uy;
const STRING_PREFIX = /^(?:[rubf]|rb|br|fr|rf)$/i;

/**
 * Collect what Ren'Py or Python code could be referring to. Every string
 * literal is a name; a literal joined to others or filled in at runtime is a
 * pattern; and the words of the code, and of literals that look like names,
 * go in `words` (image tags and attributes in `show`, say attributes, `audio.`
 * names). Comments are skipped.
 */
function scanCode(refs: AssetRefs, code: string): void {
  let i = 0;
  let prev = "";     // the last character outside strings and whitespace
  let prevPrev = ""; // the one before it, to spot `+=`
  while (i < code.length) {
    const c = code[i];
    if (c === "#") {
      const eol = code.indexOf("\n", i);
      i = eol < 0 ? code.length : eol;
      continue;
    }
    WORD.lastIndex = i;
    const word = WORD.exec(code)?.[0];
    let raw = false;
    if (word) {
      i += word.length;
      const next = code[i];
      if (!((next === '"' || next === "'") && STRING_PREFIX.test(word))) {
        addWords(refs, word);
        prevPrev = prev;
        prev = word[word.length - 1];
        continue;
      }
      raw = /r/i.test(word); // a string prefix: r"…", f"…", rb"…"
    }
    const quote = code[i];
    if (quote === '"' || quote === "'") {
      const { value, end } = readString(code, i, quote, raw);
      const joinedBefore = prev === "+" || (prev === "=" && prevPrev === "+");
      addLiteral(refs, value, joinedBefore, operatorAfter(code, end));
      prevPrev = prev;
      prev = quote;
      i = end;
      continue;
    }
    if (!/\s/.test(c)) {
      prevPrev = prev;
      prev = c;
    }
    i++;
  }
}

/**
 * Read the string literal starting at `start`. An unterminated literal ends at
 * the end of its line, or of the code for a triple-quoted one.
 */
function readString(code: string, start: number, quote: string, raw: boolean): { value: string; end: number } {
  const close = code.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
  let value = "";
  let i = start + close.length;
  let run = i;
  while (i < code.length) {
    const c = code[i];
    if (c === "\\") {
      const next = code[i + 1] ?? "";
      value += code.slice(run, i) + (raw ? c + next : next === "n" ? "\n" : next === "t" ? "\t" : next);
      i += 2;
      run = i;
    } else if (code.startsWith(close, i)) {
      return { value: value + code.slice(run, i), end: i + close.length };
    } else if (c === "\n" && close.length === 1) {
      break;
    } else {
      i++;
    }
  }
  return { value: value + code.slice(run, Math.min(i, code.length)), end: i };
}

/** `+` or `%` right after a literal, which joins or formats it. */
function operatorAfter(code: string, end: number): string {
  let i = end;
  while (i < code.length && /\s/.test(code[i])) i++;
  return code[i] === "+" || code[i] === "%" ? code[i] : "";
}

function addLiteral(refs: AssetRefs, value: string, joinedBefore: boolean, after: string): void {
  // Image tags and attributes in strings (`Character(image="eileen")`,
  // `$ mood = "happy"`) are lowercase; dialogue and button labels aren't.
  if (!/[\p{Lu}\p{Lt},;:?!"'()\n]/u.test(value)) addWords(refs, value);
  addTextTags(refs, value);
  addName(refs, value);
  // Joined to other values (`"cg" + str(n)`) or filled in at runtime
  // (`"cg[n].png"`, `"cg%d.png" % n`, `"cg{}".format(n)`), a literal is only
  // part of a name.
  const pattern = (joinedBefore ? "*" : "") + runtimeParts(value, after) + (after === "+" ? "*" : "");
  if (pattern.includes("*")) {
    addPattern(refs, pattern);
  } else if (/[\\/]/.test(value) && !/[,;?!"()\n]/.test(value) && !ASSET_EXT.test(value.trim())) {
    // A folder or the start of a path (`"music/"`, `"images/cg"`), used to find files.
    addPattern(refs, `${neverMatches(value.trim())}*`);
  }
}

const WILDCARD = "\u0000";
const PERCENT_FORMAT = /%%|%(?:\([^)]*\))?[#0\- +]*(?:\*|\d+)?(?:\.(?:\*|\d+))?[hlL]?[diouxXeEfFgGcrsa]/g;

/** Ren'Py text tags (not format fields), from `{b}` and `{size=+10}` to `{/i}` and `{#comment}`. */
const TEXT_TAGS = new Set([
  "a", "alpha", "alt", "art", "b", "clear", "color", "cps", "done", "fast", "font", "i", "image", "k",
  "noalt", "nw", "outlinecolor", "p", "plain", "rb", "rt", "s", "shader", "size", "space", "u", "vspace", "w",
]);

function isTextTag(body: string): boolean {
  const tag = body.trim();
  return tag.startsWith("/") || tag.startsWith("#") || TEXT_TAGS.has(tag.split("=")[0].trim().toLowerCase());
}

/**
 * `value` with `*` for the parts only known at runtime: `[interpolations]`,
 * `{format}` fields and, when `%` follows the literal, `%s`-style fields.
 */
function runtimeParts(value: string, after: string): string {
  let s = value;
  if (after === "%") s = s.replace(PERCENT_FORMAT, m => (m === "%%" ? "%" : WILDCARD));
  s = s
    .replace(/\[\[/g, "\u0002") // [[ is an escaped [
    .replace(/\[[^\]]*\]?/g, WILDCARD)
    .replace(/\{\{/g, "\u0003") // {{ is an escaped {
    .replace(/\{([^{}]*)\}?/g, (_m, body: string) => (isTextTag(body) ? "" : WILDCARD));
  return neverMatches(s)
    .replace(/\u0002/g, "[")
    .replace(/\u0003/g, "{")
    .replace(/\u0000/g, "*");
}

/**
 * `value` with its own `*`s made unmatchable, so they aren't wildcards: they're
 * build patterns (`build.classify("game/images/**", …)`), never part of a name.
 */
function neverMatches(value: string): string {
  return value.replace(/\*/g, "\u0001");
}

// ─── Matching files ───────────────────────────────────────────────────────────

interface RefIndex {
  /** File names, with an extension, that references end in. */
  files: Set<string>;
  /** Names without a file extension. */
  names: Set<string>;
  /** Image tag → the attributes of each image name with that tag. */
  tags: Map<string, Set<string>[]>;
  words: Set<string>;
  patterns: { glob: string; longestPart: string }[];
}

function indexRefs(refs: AssetRefs): RefIndex {
  const index: RefIndex = { files: new Set(), names: new Set(), tags: new Map(), words: refs.words, patterns: [] };
  for (const ref of refs.names) {
    const base = baseName(gameRelative(ref));
    if (!base) continue;
    if (ASSET_EXT.test(base)) {
      index.files.add(loose(base));
      continue;
    }
    // A name without a file extension: an image name (`bg meadow`), an audio
    // name (`theme`, `audio.theme`), or a file name missing its extension.
    for (const name of new Set([base, base.replace(/^audio\./i, "")])) {
      index.names.add(loose(name));
      const [tag, ...attributes] = components(name);
      if (!tag) continue;
      const list = index.tags.get(tag) ?? [];
      list.push(new Set(attributes));
      index.tags.set(tag, list);
    }
  }
  for (const glob of refs.patterns) {
    const longestPart = glob.split("*").reduce((a, b) => (b.length > a.length ? b : a), "");
    index.patterns.push({ glob, longestPart });
  }
  return index;
}

function isUsed(file: string, index: RefIndex): boolean {
  const path = gameRelative(file);
  const base = baseName(path);
  const stem = base.replace(/\.[^.]*$/, "");
  if (index.files.has(loose(base)) || index.names.has(loose(stem))) return true;

  // Ren'Py names an image in game/images after its file: "Eileen Happy.png" is
  // `eileen happy`. The editor's previews also treat `_` as a space.
  const [tag, ...attributes] = components(stem);
  if (tag) {
    // An image name that is this image's, or starts with it (Ren'Py passes the
    // rest on as attributes).
    if (index.tags.get(tag)?.some(named => attributes.every(a => named.has(a)))) return true;
    // Code that mentions every part of the name: `show eileen happy`, say
    // attributes, `play music theme`, layered-image parts. Side images are
    // shown without being named.
    const parts = tag === "side" && attributes.length > 0 ? attributes : [tag, ...attributes];
    if (parts.every(part => index.words.has(part))) return true;
  }

  if (index.patterns.length > 0) {
    const looseBase = loose(base);
    const loosePath = loose(path);
    // Ren'Py also looks for a name in images/ and audio/.
    const targets = [loosePath, loosePath.replace(/^(?:images|audio)\//, ""), looseBase, loose(stem)];
    const all = targets.join("\n");
    for (const { glob, longestPart } of index.patterns) {
      if (longestPart && !all.includes(longestPart)) continue;
      if (targets.some(target => globMatch(glob, target))) return true;
    }
  }
  return false;
}

/** Whether `text` matches `glob`, where `*` matches anything. Linear-time, whatever the input. */
function globMatch(glob: string, text: string): boolean {
  let g = 0, t = 0, star = -1, starText = 0;
  while (t < text.length) {
    if (g < glob.length && glob[g] === "*") {
      star = g++;
      starText = t;
    } else if (g < glob.length && glob[g] === text[t]) {
      g++;
      t++;
    } else if (star >= 0) {
      g = star + 1;
      t = ++starText;
    } else {
      return false;
    }
  }
  while (glob[g] === "*") g++;
  return g === glob.length;
}

// ─── Name helpers ─────────────────────────────────────────────────────────────

/** `path` with forward slashes and without a leading `./`, `/` or `game/`. */
function gameRelative(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^(?:\.?\/)+/, "").replace(/^game\//i, "");
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** The loosest spelling two references to one file can share: lowercase, spaces and underscores as `_`. */
function loose(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s_]+/g, "_");
}

/** The parts of an image name: `"Eileen happy_2"` → `["eileen", "happy", "2"]`. */
function components(name: string): string[] {
  return name.normalize("NFC").toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
}
