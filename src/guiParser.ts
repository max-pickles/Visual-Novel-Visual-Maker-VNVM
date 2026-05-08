/**
 * guiParser.ts — Parse and write back to a Ren'Py gui.rpy file.
 *
 * Reads `define gui.X = Y` and `define config.X = Y` lines into a typed
 * {@link GuiConfig} object. All raw lines are preserved so the file can be
 * serialised back without touching comments or whitespace.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GuiConfig {
  // Init
  init_width: number;
  init_height: number;
  // Colors
  accent_color: string;
  idle_color: string;
  hover_color: string;
  main_menu_text_color: string;
  text_color: string;
  interface_text_color: string;
  // Font sizes
  title_text_size: number;
  label_text_size: number;
  interface_text_size: number;
  text_size: number;
  name_text_size: number;
  // Fonts
  text_font: string;
  name_text_font: string;
  interface_text_font: string;
  // Layout
  navigation_xpos: number;
  navigation_spacing: number;
  main_menu_text_xalign: number;
  // Backgrounds
  main_menu_background: string;
  game_menu_background: string;
  // Textbox
  textbox_height: number;
  name_xpos: number;
  name_ypos: number;
  dialogue_xpos: number;
  dialogue_ypos: number;
  dialogue_width: number;
  // Parsed from screens.rpy constants (hardcoded from Ren'Py defaults)
  sidebar_width: number; // px — from `style main_menu_frame: xsize 280`
  title_vbox_xsize: number; // px — from `style main_menu_vbox: xsize 960`
  title_vbox_xoffset: number; // px — from `xoffset -20`
  // Raw lines — preserved for lossless write-back
  _raw: string[];
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseGuiRpy(content: string): GuiConfig {
  const lines = content.split('\n');

  let init_width = 1280;
  let init_height = 720;
  const initRe = /gui\.init\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/;
  for (const line of lines) {
    const m = line.match(initRe);
    if (m) {
      init_width = parseInt(m[1], 10);
      init_height = parseInt(m[2], 10);
      break;
    }
  }

  const getString = (key: string, fallback: string): string => {
    const re = new RegExp(`^\\s*define\\s+gui\\.${key}\\s*=\\s*(.+)`);
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const val = m[1].trim().replace(/\s*#.*$/, ''); // strip inline comments
        // Unquote strings
        const unquoted = val.replace(/^['"]|['"]$/g, '');
        return unquoted;
      }
    }
    return fallback;
  };

  const getNum = (key: string, fallback: number): number => {
    const re = new RegExp(`^\\s*define\\s+gui\\.${key}\\s*=\\s*([\\d.]+)`);
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const n = parseFloat(m[1]);
        return isNaN(n) ? fallback : n;
      }
    }
    return fallback;
  };

  return {
    init_width,
    init_height,
    accent_color:             getString('accent_color', '#cc6600'),
    idle_color:               getString('idle_color', '#555555'),
    hover_color:              getString('hover_color', '#e0a366'),
    main_menu_text_color:     getString('main_menu_text_color', '#ffaa22'),
    text_color:               getString('text_color', '#ffffff'),
    interface_text_color:     getString('interface_text_color', '#ffffff'),
    title_text_size:          getNum('title_text_size', 50),
    label_text_size:          getNum('label_text_size', 24),
    interface_text_size:      getNum('interface_text_size', 24),
    text_size:                getNum('text_size', 22),
    name_text_size:           getNum('name_text_size', 30),
    text_font:                getString('text_font', 'DejaVuSans.ttf'),
    name_text_font:           getString('name_text_font', 'DejaVuSans.ttf'),
    interface_text_font:      getString('interface_text_font', 'DejaVuSans.ttf'),
    navigation_xpos:          getNum('navigation_xpos', 40),
    navigation_spacing:       getNum('navigation_spacing', 4),
    main_menu_text_xalign:    getNum('main_menu_text_xalign', 0.0),
    main_menu_background:     getString('main_menu_background', 'gui/main_menu.png'),
    game_menu_background:     getString('game_menu_background', 'gui/game_menu.png'),
    textbox_height:           getNum('textbox_height', 185),
    name_xpos:                getNum('name_xpos', 240),
    name_ypos:                getNum('name_ypos', 0),
    dialogue_xpos:            getNum('dialogue_xpos', 268),
    dialogue_ypos:            getNum('dialogue_ypos', 50),
    dialogue_width:           getNum('dialogue_width', 744),
    // These come from screens.rpy style blocks — we treat them as fixed for now
    // but could be extended by parsing screens.rpy in the future.
    sidebar_width:    280,
    title_vbox_xsize: 960,
    title_vbox_xoffset: -20,
    _raw: lines,
  };
}

// ─── Writer ───────────────────────────────────────────────────────────────────

/**
 * Replace the value of a single `define gui.<key> = <value>` line in the
 * raw content and return the updated full file text.
 *
 * @param config  Current config (containing `_raw`).
 * @param key     gui.rpy key name (e.g. `"accent_color"`).
 * @param value   The new raw Ren'Py value string, already formatted —
 *                e.g. `"'#ff0000'"` for a color or `"50"` for a number.
 * @returns       New complete file content with the line replaced.
 */
export function setGuiValue(config: GuiConfig, key: string, value: string): string {
  const re = new RegExp(`^(\\s*define\\s+gui\\.${key}\\s*=\\s*)(.+?)\\s*(#.*)?$`);
  const newLines = config._raw.map(line => {
    const m = line.match(re);
    if (!m) return line;
    const comment = m[3] ? `  ${m[3]}` : '';
    return `${m[1]}${value}${comment}`;
  });
  return newLines.join('\n');
}

/**
 * Apply multiple key/value patches at once and return the new file text.
 * More efficient than calling `setGuiValue` in a loop (single pass).
 */
export function patchGuiRpy(rawContent: string, patches: Record<string, string>): string {
  const lines = rawContent.split('\n');
  const result = lines.map(line => {
    for (const [key, value] of Object.entries(patches)) {
      const re = new RegExp(`^(\\s*define\\s+gui\\.${key}\\s*=\\s*)(.+?)\\s*(#.*)?$`);
      const m = line.match(re);
      if (m) {
        const comment = m[3] ? `  ${m[3]}` : '';
        return `${m[1]}${value}${comment}`;
      }
    }
    return line;
  });
  return result.join('\n');
}

/** Format a hex color string for insertion into gui.rpy — e.g. `"'#cc6600'"` */
export const rpyColor = (hex: string) => `'${hex}'`;
/** Format a number for insertion into gui.rpy — e.g. `"50"` */
export const rpyNum   = (n: number)  => String(n);
/** Format a quoted string for gui.rpy — e.g. `'"gui/main_menu.png"'` */
export const rpyStr   = (s: string)  => `"${s}"`;
