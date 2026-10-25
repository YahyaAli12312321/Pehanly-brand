import { describe, it, expect } from 'vitest';
import { cropSize, cropRect, outputSize, previewStyle, CROP_PRESETS } from './imageCrop';

describe('imageCrop maths', () => {
  it('presets expose real ratios (original = no crop)', () => {
    const by = Object.fromEntries(CROP_PRESETS.map((p) => [p.id, p.ratio]));
    expect(by.original).toBeNull();
    expect(by.square).toBe(1);
    expect(by.portrait).toBeCloseTo(0.8);
    expect(by.landscape).toBeCloseTo(1.5);
  });

  it.each([[4000, 3000], [3000, 4000], [2000, 2000], [1200, 3000]])('crop window of a %ix%i image keeps the exact frame ratio', (w, h) => {
    for (const ratio of [1, 4 / 5, 3 / 2]) {
      for (const zoom of [1, 1.7, 3]) {
        const c = cropSize(w, h, ratio, zoom);
        expect(c.w / c.h).toBeCloseTo(ratio, 6);
        expect(c.w).toBeLessThanOrEqual(w + 1e-6);
        expect(c.h).toBeLessThanOrEqual(h + 1e-6);
        const o = outputSize(c.w, c.h);
        expect(Math.abs(o.width / o.height - ratio)).toBeLessThan(0.01); // no distortion after rounding
      }
    }
  });

  it('never leaves the image bounds, however far it is dragged', () => {
    const r = cropRect(4000, 3000, 1, 1.5, -5, 9);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y + r.h).toBeLessThanOrEqual(3000 + 1e-6);
    expect(r.x + r.w).toBeLessThanOrEqual(4000 + 1e-6);
  });

  it('zoom below 1 is treated as 1 (image always covers the frame)', () => {
    expect(cropSize(1000, 1000, 1, 0.2)).toEqual(cropSize(1000, 1000, 1, 1));
  });

  it('caps the long side at 2400 and never upscales', () => {
    expect(outputSize(6000, 3000)).toEqual({ width: 2400, height: 1200 });
    expect(outputSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('preview style shows exactly the crop rect', () => {
    const rect = { x: 500, y: 0, w: 3000, h: 3000 };
    const s = previewStyle(4000, 3000, rect);
    expect(parseFloat(s.width)).toBeCloseTo((4000 / 3000) * 100);
    expect(parseFloat(s.left)).toBeCloseTo(-(500 / 3000) * 100);
    expect(parseFloat(s.top)).toBeCloseTo(0);
  });
});
