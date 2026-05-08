/**
 * colorUtils.ts
 * Color manipulation utilities — ported from legacy IDE.
 * Mirrors the Ren'Py SDK's gui7/parameters.py GuiParameters logic.
 */

export interface RGBA { r: number; g: number; b: number; a: number; }
export interface HSV  { h: number; s: number; v: number; }

export class RenpyColor {
  r: number; g: number; b: number; a: number;

  constructor(hex: string) {
    const cleaned = hex.replace('#', '');
    if (cleaned.length === 3) {
      this.r = parseInt(cleaned[0] + cleaned[0], 16) / 255;
      this.g = parseInt(cleaned[1] + cleaned[1], 16) / 255;
      this.b = parseInt(cleaned[2] + cleaned[2], 16) / 255;
      this.a = 1.0;
    } else if (cleaned.length === 6) {
      this.r = parseInt(cleaned.substring(0, 2), 16) / 255;
      this.g = parseInt(cleaned.substring(2, 4), 16) / 255;
      this.b = parseInt(cleaned.substring(4, 6), 16) / 255;
      this.a = 1.0;
    } else if (cleaned.length === 8) {
      this.r = parseInt(cleaned.substring(0, 2), 16) / 255;
      this.g = parseInt(cleaned.substring(2, 4), 16) / 255;
      this.b = parseInt(cleaned.substring(4, 6), 16) / 255;
      this.a = parseInt(cleaned.substring(6, 8), 16) / 255;
    } else {
      throw new Error(`Invalid hex color: ${hex}`);
    }
  }

  rgbToHsv(): HSV {
    const max = Math.max(this.r, this.g, this.b);
    const min = Math.min(this.r, this.g, this.b);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === this.r)      h = ((this.g - this.b) / delta) % 6;
      else if (max === this.g) h = (this.b - this.r) / delta + 2;
      else                     h = (this.r - this.g) / delta + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h: h / 360, s: max === 0 ? 0 : delta / max, v: max };
  }

  static hsvToRgb(h: number, s: number, v: number): RGBA {
    h = h * 360;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else              { r = c; g = 0; b = x; }
    return { r: r + m, g: g + m, b: b + m, a: 1 };
  }

  tint(factor: number): RenpyColor {
    const c = new RenpyColor('#000000');
    c.r = this.r + (1.0 - this.r) * factor;
    c.g = this.g + (1.0 - this.g) * factor;
    c.b = this.b + (1.0 - this.b) * factor;
    c.a = this.a;
    return c;
  }

  shade(factor: number): RenpyColor {
    const c = new RenpyColor('#000000');
    c.r = this.r * (1.0 - factor);
    c.g = this.g * (1.0 - factor);
    c.b = this.b * (1.0 - factor);
    c.a = this.a;
    return c;
  }

  replaceHSVSaturation(newSat: number): RenpyColor {
    const hsv = this.rgbToHsv();
    const rgb = RenpyColor.hsvToRgb(hsv.h, newSat, hsv.v);
    const c = new RenpyColor('#000000');
    c.r = rgb.r; c.g = rgb.g; c.b = rgb.b; c.a = this.a;
    return c;
  }

  replaceValue(newVal: number): RenpyColor {
    const hsv = this.rgbToHsv();
    const rgb = RenpyColor.hsvToRgb(hsv.h, hsv.s, newVal);
    const c = new RenpyColor('#000000');
    c.r = rgb.r; c.g = rgb.g; c.b = rgb.b; c.a = this.a;
    return c;
  }

  replaceOpacity(newAlpha: number): RenpyColor {
    const c = new RenpyColor('#000000');
    c.r = this.r; c.g = this.g; c.b = this.b; c.a = newAlpha;
    return c;
  }

  toHex(includeAlpha = true): string {
    const r = Math.round(this.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(this.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(this.b * 255).toString(16).padStart(2, '0');
    if (includeAlpha && this.a < 1.0) {
      const a = Math.round(this.a * 255).toString(16).padStart(2, '0');
      return `#${r}${g}${b}${a}`;
    }
    return `#${r}${g}${b}`;
  }
}

/** Derive all Ren'Py GUI colors from an accent hex + theme. */
export function deriveGuiColors(accentHex: string, isLight: boolean): Record<string, string> {
  const accent = new RenpyColor(accentHex);
  const hoverColor     = isLight ? accent : accent.tint(0.6);
  const mutedColor     = isLight ? accent.tint(0.6) : accent.shade(0.4);
  const hoverMuted     = isLight ? accent.tint(0.4) : accent.shade(0.6);
  const menuColor      = isLight
    ? accent.replaceHSVSaturation(0.25).replaceValue(0.75)
    : accent.replaceHSVSaturation(0.25).replaceValue(0.25);
  const titleColor     = accent.replaceHSVSaturation(0.5).replaceValue(1.0);
  const selectedColor  = new RenpyColor(isLight ? '#555555' : '#ffffff');
  const idleColor      = new RenpyColor(isLight ? '#707070' : '#888888');
  const idleSmallColor = new RenpyColor(isLight ? '#606060' : '#aaaaaa');
  const textColor      = new RenpyColor(isLight ? '#404040' : '#ffffff');
  const insensitive    = idleColor.replaceOpacity(0.5);
  return {
    accent_color:                         accent.toHex(false),
    hover_color:                          hoverColor.toHex(false),
    muted_color:                          mutedColor.toHex(false),
    hover_muted_color:                    hoverMuted.toHex(false),
    menu_color:                           menuColor.toHex(false),
    title_color:                          titleColor.toHex(false),
    selected_color:                       selectedColor.toHex(false),
    idle_color:                           idleColor.toHex(false),
    idle_small_color:                     idleSmallColor.toHex(false),
    text_color:                           textColor.toHex(false),
    interface_text_color:                 textColor.toHex(false),
    insensitive_color:                    insensitive.toHex(true),
    choice_button_text_idle_color:        idleColor.toHex(false),
    choice_button_text_insensitive_color: insensitive.toHex(true),
  };
}

/** Parse any CSS hex color into {r,g,b,a} 0-255 components. */
export function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const c = new RenpyColor(hex);
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: c.a };
}

/** WCAG relative luminance of a hex color. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgba(hex);
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = luminance(hex1);
  const l2 = luminance(hex2);
  const bright = Math.max(l1, l2);
  const dark   = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

/** Return '#ffffff' or '#000000' based on which has better contrast against bg. */
export function bestContrastColor(bgHex: string): string {
  return contrastRatio(bgHex, '#ffffff') >= contrastRatio(bgHex, '#000000')
    ? '#ffffff'
    : '#000000';
}

export const SDK_COLOR_SWATCHES = {
  dark: [
    '#0099cc', '#99ccff', '#66cc00', '#cccc00', '#cc6600',
    '#0066cc', '#9933ff', '#00cc99', '#cc0066', '#cc0000',
  ],
  light: [
    '#003366', '#0099ff', '#336600', '#000000', '#cc6600',
    '#000066', '#660066', '#006666', '#cc0066', '#990000',
  ],
};

// ── Shade generation ───────────────────────────────────────────────────────

/** Convert hex to HSL. Returns [h 0-360, s 0-100, l 0-100]. */
function hexToHsl(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgba(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn)      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else                 h = ((rn - gn) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100;
  const c  = (1 - Math.abs(2 * ln - 1)) * sn;
  const x  = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m  = ln - c / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else              { r = c; b = x; }
  const toB = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toB(r)}${toB(g)}${toB(b)}`;
}

/**
 * Generate 5 shade variants from a base hex colour:
 * [lightest, lighter, base, darker, darkest]
 * The lightness steps are ±15 and ±28 from the base.
 */
export function generateShades(hex: string): string[] {
  try {
    const [h, s, l] = hexToHsl(hex);
    const clamp = (v: number) => Math.max(4, Math.min(96, v));
    return [
      hslToHex(h, s, clamp(l + 28)),
      hslToHex(h, s, clamp(l + 15)),
      hslToHex(h, s, l),
      hslToHex(h, s, clamp(l - 15)),
      hslToHex(h, s, clamp(l - 28)),
    ];
  } catch {
    return [hex, hex, hex, hex, hex];
  }
}
