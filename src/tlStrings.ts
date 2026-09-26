/**
 * tlStrings.ts — The string translations in Ren'Py `tl/` scripts.
 */
import { parsePyString, splitComment } from "./rpyValue";

/**
 * The strings a script translates in its `translate <language> strings:`
 * blocks: the text of each `old "…"` line. Ren'Py stops with an error when a
 * string is translated twice for one language, so a new translation file must
 * leave these out.
 */
export function translatedStrings(script: string): Set<string> {
  const found = new Set<string>();
  let inStrings = false;
  for (const line of script.split(/\r?\n/)) {
    const text = line.trim();
    if (/^translate\s+\S+\s+\S+\s*:$/.test(text)) {
      inStrings = /\sstrings\s*:$/.test(text);
      continue;
    }
    const old = inStrings ? text.match(/^old\s+(.*)$/) : null;
    const value = old ? parsePyString(splitComment(old[1]).value) : null;
    if (value !== null) found.add(value);
  }
  return found;
}
