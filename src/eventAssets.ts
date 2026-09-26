/**
 * eventAssets.ts — Which field of an event a file picked for it goes in.
 *
 * Each event type that shows or plays a file reads it from one field when it
 * compiles (see `compileEvent` in compiler.ts): a background from `bg`, a
 * sound effect from `sfx`, a dialogue line's voice from `voice`, and so on.
 * The scene editor's asset sidebar uses this to put a picked file there.
 */

import type { EventType } from "./types";

/** The kinds of file the asset sidebar lists (asset types of `listAssetFiles`). */
export type AssetKind = "images" | "audio" | "video";

/** Event fields that hold a file. */
export type AssetField = "bg" | "image" | "movie" | "music" | "sfx" | "voice";

/** The kind of file each event type takes, and the field it goes in. */
const EVENT_ASSETS: Partial<Record<EventType, { kind: AssetKind; field: AssetField }>> = {
  bg:        { kind: "images", field: "bg" },
  image:     { kind: "images", field: "image" },
  animation: { kind: "images", field: "image" },
  movie:     { kind: "video",  field: "movie" },
  music:     { kind: "audio",  field: "music" },
  sfx:       { kind: "audio",  field: "sfx" },
  dialogue:  { kind: "audio",  field: "voice" },
  narration: { kind: "audio",  field: "voice" },
};

/** The kind of file an event of type `type` takes, or null if it takes none. */
export function assetKindFor(type: EventType): AssetKind | null {
  return EVENT_ASSETS[type]?.kind ?? null;
}

/**
 * The field a file of kind `kind` goes in on an event of type `type`, or null
 * if the event doesn't take that kind of file: a sound picked for a
 * background, or any file picked for a jump.
 */
export function assetFieldFor(type: EventType, kind: AssetKind): AssetField | null {
  const asset = EVENT_ASSETS[type];
  return asset?.kind === kind ? asset.field : null;
}

/**
 * The value `field` stores for a file listed as `path`, relative to the project
 * folder (`game/audio/door.ogg`). Voice files are stored relative to `game/`
 * (`voice/line_001.ogg`), the way the Voice Director records, plays and deletes
 * them; the other fields store the path as listed, as they always have.
 */
export function assetFieldValue(field: AssetField, path: string): string {
  return field === "voice" ? path.replace(/^game\//, "") : path;
}
