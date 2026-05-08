export interface OptionsConfig {
  name: string;
  version: string;
  _raw: string[];
}

export function parseOptionsRpy(content: string): OptionsConfig {
  const lines = content.split('\n');

  const getString = (key: string, fallback: string): string => {
    // Matches: define config.name = _("My Game")
    // Matches: define config.version = "1.0"
    const re = new RegExp(`^\\s*define\\s+config\\.${key}\\s*=\\s*(?:_\\()?['"](.+?)['"](?:\\))?`);
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1];
    }
    return fallback;
  };

  return {
    name: getString('name', 'The Question'),
    version: getString('version', "Ren'Py 7+ Edition"),
    _raw: lines,
  };
}

export function patchOptionsRpy(rawContent: string, patches: Record<string, string>): string {
  const lines = rawContent.split('\n');
  const result = lines.map(line => {
    for (const [key, value] of Object.entries(patches)) {
      const isTranslatable = key === 'name'; // config.name uses _("...")
      const re = new RegExp(`^(\\s*define\\s+config\\.${key}\\s*=\\s*)(?:_\\()?['"].+?['"](?:\\))?(.*)$`);
      const m = line.match(re);
      if (m) {
        const newVal = isTranslatable ? `_("${value}")` : `"${value}"`;
        return `${m[1]}${newVal}${m[2]}`;
      }
    }
    return line;
  });
  return result.join('\n');
}
