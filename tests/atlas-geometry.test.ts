import { describe, expect, it } from 'vitest';
import {
  type AlphaMask,
  faceCentreY,
  fitLine,
  longestRun,
  measureHex,
  packGrid,
  themeGeometry,
} from '../scripts/atlas-geometry.ts';

/**
 * A synthetic pointy-top hex mask: width w, top triangle `cap` tall, vertical sides `side` long,
 * optional thickness below (a darker slab that extends the sides), and optional stray marks.
 */
function hexMask(w: number, cap: number, side: number, options: { thickness?: number; stray?: boolean; top?: number } = {}): AlphaMask {
  const top = options.top ?? 2;
  const thickness = options.thickness ?? 0;
  const width = w + 20;
  const height = top + 2 * cap + side + thickness + 4;
  const alpha = new Uint8Array(width * height);
  const cx = width / 2;
  const halfWidthAt = (y: number): number => {
    const t = y - top;
    if (t < 0) return -1;
    if (t < cap) return (w / 2) * (t / cap);
    if (t < cap + side + thickness) return w / 2;
    const b = t - cap - side - thickness;
    return b < cap ? (w / 2) * (1 - b / cap) : -1;
  };
  for (let y = 0; y < height; y++) {
    const hw = halfWidthAt(y + 0.5);
    for (let x = 0; x < width; x++) if (hw > 0 && Math.abs(x + 0.5 - cx) <= hw) alpha[y * width + x] = 255;
  }
  if (options.stray) {
    // A few marks outside the hex, in the bottom-left corner.
    for (const [x, y] of [[1, height - 3], [3, height - 3], [2, height - 10]] as const) alpha[y * width + x] = 255;
  }
  return { width, height, alpha };
}

/** Within one pixel: the masks are rasterised, so edges are only exact to the pixel. */
function expectNear(actual: number, expected: number, tolerance = 1): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('longestRun and fitLine', () => {
  it('takes the longest opaque run in a row', () => {
    const mask: AlphaMask = { width: 10, height: 1, alpha: Uint8Array.from([255, 0, 255, 255, 255, 0, 0, 255, 255, 0]) };
    expect(longestRun(mask, 0)).toEqual({ start: 2, length: 3 });
  });

  it('fits a line exactly through collinear points', () => {
    const line = fitLine([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }]);
    expect(line.slope).toBeCloseTo(2);
    expect(line.intercept).toBeCloseTo(1);
  });
});

describe('measureHex', () => {
  it('measures a regular-ish pointy-top hex', () => {
    const m = measureHex(hexMask(256, 72, 142));
    expectNear(m.width, 256);
    expectNear(m.centreX, 138);
    expectNear(m.top, 2);
    expectNear(m.shoulder, 74);
    expectNear(m.sideEnd, 216);
    expectNear(m.bottom, 288);
  });

  it('ignores stray marks outside the hex', () => {
    const clean = measureHex(hexMask(256, 72, 142));
    const stray = measureHex(hexMask(256, 72, 142, { stray: true }));
    expect(stray.width).toBe(clean.width);
    expectNear(stray.shoulder, clean.shoulder, 0.1);
    expectNear(stray.sideEnd, clean.sideEnd, 0.5);
  });

  it('puts the face centre in the same place whatever the thickness below', () => {
    const plain = measureHex(hexMask(256, 72, 142));
    const thick = measureHex(hexMask(256, 72, 142, { thickness: 14 }));
    const g = themeGeometry([plain, plain, thick]);
    expectNear(g.side, 142);
    expectNear(faceCentreY(thick, g), faceCentreY(plain, g), 0.25);
    expectNear(faceCentreY(plain, g), 2 + 72 + 71);
  });

  it('rejects an empty tile', () => {
    expect(() => measureHex({ width: 4, height: 4, alpha: new Uint8Array(16) })).toThrow(/transparent/);
  });
});

describe('packGrid', () => {
  it('lays tiles out row by row in equal padded cells', () => {
    const grid = packGrid(
      [
        { width: 256, height: 280 },
        { width: 256, height: 290 },
        { width: 250, height: 270 },
      ],
      2,
      4,
    );
    expect(grid.width).toBe(2 * 264);
    expect(grid.height).toBe(2 * 298);
    expect(grid.positions).toEqual([
      { x: 4, y: 4 },
      { x: 268, y: 4 },
      { x: 4, y: 302 },
    ]);
  });
});
