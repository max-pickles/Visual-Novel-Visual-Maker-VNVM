import { parsePyString, pyString, readDefine, replaceDefine } from './rpyValue';

export interface OptionsConfig {
  name: string;
  version: string;
  _raw: string[];
}

export function parseOptionsRpy(content: string): OptionsConfig {
  const lines = content.split('\n');

  // define config.name = _("My Game")
  // define config.version = "1.0"
  const getString = (key: string): string => {
    const value = readDefine(lines, `config.${key}`);
    if (value === null) return '';
    const translatable = value.match(/^_\(\s*(.*?)\s*\)$/);
    return parsePyString(translatable ? translatable[1] : value) ?? '';
  };

  return {
    name: getString('name'),
    version: getString('version'),
    _raw: lines,
  };
}

/**
 * Set `config.<key>` to each string in `patches`, quoting it for Python.
 * `config.name` is written translatable, as `_("…")`. A define that the file
 * doesn't have yet is added at the end.
 */
export function patchOptionsRpy(rawContent: string, patches: Record<string, string>): string {
  const lines = rawContent.split('\n');
  for (const [key, text] of Object.entries(patches)) {
    const value = key === 'name' ? `_(${pyString(text)})` : pyString(text);
    let found = false;
    for (let i = 0; i < lines.length; i++) {
      const patched = replaceDefine(lines[i], `config.${key}`, value);
      if (patched !== null) {
        lines[i] = patched;
        found = true;
      }
    }
    if (!found) {
      const end = lines.length > 0 && lines[lines.length - 1].trim() === '' ? lines.length - 1 : lines.length;
      lines.splice(end, 0, `define config.${key} = ${value}`);
    }
  }
  return lines.join('\n');
}
