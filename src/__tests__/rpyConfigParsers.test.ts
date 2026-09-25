import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseGuiRpy, patchGuiRpy, rpyColor, rpyStr } from '../guiParser';
import { parseOptionsRpy, patchOptionsRpy } from '../optionsParser';
import { splitComment, parsePyString, pyString } from '../rpyValue';

const templet = (file: string) => fs.readFileSync(new URL(`../../Templet/game/${file}`, import.meta.url), 'utf8');
const linesMatching = (text: string, re: RegExp) => text.split('\n').filter(l => re.test(l));

describe('rpyValue', () => {
  it('only treats # outside quotes as a comment', () => {
    expect(splitComment("'#cc6600'  # accent")).toEqual({ value: "'#cc6600'", rest: '  # accent' });
    expect(splitComment('"a # b" # c')).toEqual({ value: '"a # b"', rest: ' # c' });
    expect(splitComment("'it\\'s # here'")).toEqual({ value: "'it\\'s # here'", rest: '' });
    expect(splitComment('42\r')).toEqual({ value: '42', rest: '\r' });
  });

  it('reads Python string literals', () => {
    expect(parsePyString("'#fff'")).toBe('#fff');
    expect(parsePyString('"Tom\'s Game"')).toBe("Tom's Game");
    expect(parsePyString('"say \\"hi\\""')).toBe('say "hi"');
    expect(parsePyString('""')).toBe('');
    expect(parsePyString('gui.accent_color')).toBeNull();
    expect(parsePyString("'unterminated")).toBeNull();
  });

  it('quotes strings so they read back unchanged', () => {
    for (const s of ['Tom\'s "Big" Game', 'back\\slash', 'two\nlines', '']) {
      expect(parsePyString(pyString(s))).toBe(s);
    }
  });
});

describe('guiParser', () => {
  it('reads quoted colors from the template', () => {
    const cfg = parseGuiRpy(templet('gui.rpy'));
    expect(cfg.accent_color).toBe('#0099cc');
    expect(cfg.idle_color).toBe('#888888');
    expect(cfg.hover_color).toBe('#66c1e0');
    expect(cfg.text_color).toBe('#ffffff');
    expect(cfg.text_font).toBe('DejaVuSans.ttf');
    expect(cfg.main_menu_background).toBe('gui/main_menu.png');
    expect(cfg.text_size).toBe(33);
    expect(cfg.textbox_height).toBe(278);
  });

  it('reads negative numbers and ignores comments', () => {
    const cfg = parseGuiRpy('define gui.name_ypos = -12  # above the box\ndefine gui.text_size = 30 # body\n');
    expect(cfg.name_ypos).toBe(-12);
    expect(cfg.text_size).toBe(30);
  });

  it('replaces a color without leaving the old one behind', () => {
    let gui = templet('gui.rpy');
    gui = patchGuiRpy(gui, { accent_color: rpyColor('#123456') });
    gui = patchGuiRpy(gui, { accent_color: rpyColor('#abcdef') });
    expect(linesMatching(gui, /define gui\.accent_color\b/)).toEqual(["define gui.accent_color = '#abcdef'"]);
    expect(parseGuiRpy(gui).accent_color).toBe('#abcdef');
  });

  it('keeps comments and CRLF line endings', () => {
    const gui = 'define gui.text_size = 22  # body text\r\ndefine gui.accent_color = "#fff"\r\n';
    expect(patchGuiRpy(gui, { text_size: '30', accent_color: rpyColor('#000') }))
      .toBe("define gui.text_size = 30  # body text\r\ndefine gui.accent_color = '#000'\r\n");
  });

  it('escapes quoted strings', () => {
    expect(rpyStr('gui/fonts/"odd".ttf')).toBe('"gui/fonts/\\"odd\\".ttf"');
  });
});

describe('optionsParser', () => {
  it('reads the template', () => {
    const opt = parseOptionsRpy(templet('options.rpy'));
    expect(opt.name).toBe('Templet');
    expect(opt.version).toBe('1.0');
  });

  it('reads names with apostrophes and quotes', () => {
    expect(parseOptionsRpy('define config.name = _("Tom\'s Game")').name).toBe("Tom's Game");
    expect(parseOptionsRpy("define config.name = _('Say \"hi\"')").name).toBe('Say "hi"');
  });

  it('writes names that Python can parse', () => {
    const opts = patchOptionsRpy(templet('options.rpy'), { name: 'Tom\'s "Big" Game', version: '2.0' });
    expect(linesMatching(opts, /^define config\.name\b/)).toEqual(['define config.name = _("Tom\'s \\"Big\\" Game")']);
    expect(linesMatching(opts, /^define config\.version\b/)).toEqual(['define config.version = "2.0"']);
    const opt = parseOptionsRpy(opts);
    expect(opt.name).toBe('Tom\'s "Big" Game');
    expect(opt.version).toBe('2.0');
  });

  it('can clear a name and set it again', () => {
    let opts = patchOptionsRpy(templet('options.rpy'), { name: '' });
    expect(parseOptionsRpy(opts).name).toBe('');
    opts = patchOptionsRpy(opts, { name: 'Back' });
    expect(parseOptionsRpy(opts).name).toBe('Back');
  });

  it('adds a define the file lacks', () => {
    const opts = patchOptionsRpy('define config.name = _("A")\n', { version: '1.2' });
    expect(opts).toBe('define config.name = _("A")\ndefine config.version = "1.2"\n');
  });
});
