import { describe, it, expect } from 'vitest';
import { paletteFromPixels } from '../imagePalette';

/** RGBA data for `count` pixels, each produced by `pixel(index)`. */
function pixels(count: number, pixel: (i: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const [r, g, b] = pixel(i);
    data.set([r, g, b, 255], i * 4);
  }
  return data;
}

const HEX = /^#[0-9a-f]{6}$/;

describe('paletteFromPixels', () => {
  it('returns hex colors that gui.rpy accepts', () => {
    const palette = paletteFromPixels(pixels(1000, i => [i % 256, (i * 7) % 256, (i * 13) % 256]));
    expect(palette.accent).toMatch(HEX);
    expect(palette.idle).toMatch(HEX);
    expect(palette.hover).toMatch(HEX);
  });

  it('uses the average color for idle and the most saturated sample for the accent', () => {
    // Sampled pixels (every 100th) alternate between gray and a saturated red.
    const palette = paletteFromPixels(pixels(400, i => (Math.floor(i / 100) % 2 ? [200, 40, 40] : [100, 100, 100])));
    expect(palette.accent).toBe('#c82828');
    expect(palette.idle).toBe('#964646');
    expect(palette.hover).toBe('#fa5a5a');
  });

  it('clamps the lightened hover color', () => {
    const palette = paletteFromPixels(pixels(1, () => [240, 30, 30]));
    expect(palette.accent).toBe('#f01e1e');
    expect(palette.hover).toBe('#ff5050');
  });

  it('falls back to the default accent for gray or empty images', () => {
    expect(paletteFromPixels(pixels(200, () => [90, 90, 90])).accent).toBe('#cc6600');
    expect(paletteFromPixels(new Uint8ClampedArray(0))).toEqual({ accent: '#cc6600', idle: '#cc6600', hover: '#fe9832' });
  });
});
