/**
 * imagePalette.ts — Pick GUI colors from a background image.
 *
 * Used by the GUI editor's magic palette button: the accent is the most
 * saturated mid-brightness pixel, the idle color is the image's average, and
 * the hover color is the accent lightened a little.
 */

export interface ImagePalette {
  accent: string;
  idle: string;
  hover: string;
}

const DEFAULT_ACCENT: [number, number, number] = [204, 102, 0];

const toHex = (c: number) => Math.min(255, Math.max(0, c)).toString(16).padStart(2, '0');
const hexColor = (r: number, g: number, b: number) => `#${toHex(r)}${toHex(g)}${toHex(b)}`;

/**
 * `data` is RGBA pixel data, as returned by `CanvasRenderingContext2D.getImageData`.
 * Every 100th pixel is sampled.
 */
export function paletteFromPixels(data: ArrayLike<number>): ImagePalette {
  let maxSaturation = 0;
  let accent = DEFAULT_ACCENT;
  let rSum = 0, gSum = 0, bSum = 0, count = 0;

  for (let i = 0; i + 2 < data.length; i += 400) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rSum += r; gSum += g; bSum += b; count++;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let s = 0;
    if (max !== min) {
      s = l > 127 ? (max - min) / (510 - max - min) : (max - min) / (max + min);
    }
    if (s > maxSaturation && l > 50 && l < 200) {
      maxSaturation = s;
      accent = [r, g, b];
    }
  }

  const avg = count > 0
    ? [Math.floor(rSum / count), Math.floor(gSum / count), Math.floor(bSum / count)]
    : accent;

  return {
    accent: hexColor(accent[0], accent[1], accent[2]),
    idle: hexColor(avg[0], avg[1], avg[2]),
    hover: hexColor(accent[0] + 50, accent[1] + 50, accent[2] + 50),
  };
}
