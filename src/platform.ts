/**
 * platform.ts — Which desktop platform the app runs on, and the keyboard
 * conventions that follow from it: macOS uses ⌘ where Windows and Linux use
 * Ctrl, and a Mac keyboard's delete key sends Backspace.
 */

const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";

export const IS_WINDOWS = userAgent.includes("Windows");
export const IS_MAC = userAgent.includes("Macintosh");

/** Whether `e` is the key that deletes the selection: Delete, or a Mac keyboard's delete key (Backspace). */
export function isDeleteKey(e: { key: string }, mac = IS_MAC): boolean {
  return e.key === "Delete" || (mac && e.key === "Backspace");
}

/** macOS symbols for the modifiers, in the order its menus list them. */
const MAC_MODIFIERS: [string, string][] = [["Alt", "⌥"], ["Shift", "⇧"], ["Ctrl", "⌘"]];

/**
 * A shortcut the way this platform writes it. "Ctrl+Shift+Z" stays as it is
 * on Windows and Linux; on a Mac it becomes "⇧⌘Z".
 */
export function shortcutLabel(keys: string, mac = IS_MAC): string {
  if (!mac) return keys;
  const parts = keys.split("+");
  const key = parts.pop() ?? "";
  const known = MAC_MODIFIERS.filter(([name]) => parts.includes(name));
  if (known.length !== parts.length) return keys;
  return known.map(([, symbol]) => symbol).join("") + key;
}
