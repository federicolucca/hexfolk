import { describe, expect, it } from 'vitest';
import { neighbours, offsetToAxial } from '../src/core/hex';
import { hexCorners, hexToPixel, mapBounds, pixelToHex, type TileMetrics } from '../src/render/layout';

const M: TileMetrics = { width: 256, columnStep: 256, rowStep: 142.51, faceHeight: 190.01 };

describe('hexToPixel', () => {
  it('puts the origin at 0, 0 and steps by column and row', () => {
    expect(hexToPixel({ q: 0, r: 0 }, M)).toEqual({ x: 0, y: 0 });
    expect(hexToPixel({ q: 1, r: 0 }, M)).toEqual({ x: 256, y: 0 });
    expect(hexToPixel({ q: 0, r: 1 }, M)).toEqual({ x: 128, y: 142.51 });
  });

  it('shifts odd offset rows half a tile right', () => {
    const even = hexToPixel(offsetToAxial(3, 2), M);
    const odd = hexToPixel(offsetToAxial(3, 3), M);
    expect(odd.x - even.x).toBeCloseTo(128);
  });
});

describe('pixelToHex', () => {
  it('inverts hexToPixel', () => {
    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        const hex = offsetToAxial(col, row);
        expect(pixelToHex(hexToPixel(hex, M), M)).toEqual(hex);
      }
    }
  });

  it('maps points just inside each corner of the top face to that hex', () => {
    const hex = { q: 2, r: 3 };
    const centre = hexToPixel(hex, M);
    for (const corner of hexCorners(hex, M)) {
      const inside = { x: centre.x + (corner.x - centre.x) * 0.95, y: centre.y + (corner.y - centre.y) * 0.95 };
      expect(pixelToHex(inside, M)).toEqual(hex);
    }
  });

  it('maps points just past an edge midpoint to the neighbour', () => {
    const hex = { q: 0, r: 0 };
    const c = hexToPixel(hex, M);
    for (const n of neighbours(hex)) {
      const p = hexToPixel(n, M);
      // 55% of the way to the neighbour's centre is past the shared edge.
      const beyond = { x: c.x + (p.x - c.x) * 0.55, y: c.y + (p.y - c.y) * 0.55 };
      expect(pixelToHex(beyond, M)).toEqual(n);
    }
  });
});

describe('hexCorners', () => {
  it('spans the tile width and the face height', () => {
    const corners = hexCorners({ q: 0, r: 0 }, M);
    expect(corners).toHaveLength(6);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(256);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(190.01);
  });
});

describe('mapBounds', () => {
  it('covers every tile plus the sprite overhang', () => {
    const b = mapBounds([{ q: 0, r: 0 }, { q: 1, r: 1 }], M, 300, 100);
    expect(b).toEqual({ minX: -128, maxX: 384 + 128, minY: -300, maxY: 142.51 + 100 });
  });
});
