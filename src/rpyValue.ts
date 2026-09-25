/**
 * rpyValue.ts — Read and rewrite the values of `define` lines in Ren'Py
 * config files (gui.rpy, options.rpy) without disturbing anything else on the
 * line.
 */

/**
 * Split the right-hand side of a `define` into its value and whatever follows
 * it (spacing, a trailing comment, a `\r` from CRLF files). A `#` only starts a
 * comment outside quotes, so a color such as `'#cc6600'` stays intact.
 */
export function splitComment(rhs: string): { value: string; rest: string } {
  let end = rhs.length;
  let quote = '';
  for (let i = 0; i < rhs.length; i++) {
    const c = rhs[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#') {
      end = i;
      break;
    }
  }
  const value = rhs.slice(0, end).trimEnd();
  return { value, rest: rhs.slice(value.length) };
}

/** The text of a Python string literal (`'…'` or `"…"`), or null if `value` isn't one. */
export function parsePyString(value: string): string | null {
  const m = value.trim().match(/^(['"])((?:\\.|(?!\1)[^\\])*)\1$/);
  if (!m) return null;
  return m[2].replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

/** `s` as a double-quoted Python string literal. */
export function pyString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `define <name> = <rest>`. `[\s\S]` because `.` doesn't match the `\r` of CRLF files. */
const defineRe = (name: string) => new RegExp(`^(\\s*define\\s+${escapeRe(name)}\\s*=\\s*)([\\s\\S]*)$`);

/**
 * If `line` is `define <name> = …`, return it with the value replaced by
 * `value` (inserted verbatim) and any trailing comment kept. Otherwise null.
 */
export function replaceDefine(line: string, name: string, value: string): string | null {
  const m = line.match(defineRe(name));
  if (!m) return null;
  const { rest } = splitComment(m[2]);
  return `${m[1]}${value}${rest.startsWith('#') ? ' ' : ''}${rest}`;
}

/** The raw value of the first `define <name> = …` line, without its comment, or null. */
export function readDefine(lines: string[], name: string): string | null {
  const re = defineRe(name);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return splitComment(m[2]).value;
  }
  return null;
}
