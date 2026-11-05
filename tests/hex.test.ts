import { describe, expect, it } from 'vitest';
import { axialToOffset, distance, neighbours, offsetToAxial, roundHex, sameHex } from '../src/core/hex';

describe('hex helpers', () => {
  it('lists six distinct neighbours, each at distance 1', () => {
    const centre = { q: 2, r: -1 };
    const ns = neighbours(centre);
    expect(ns).toHaveLength(6);
    expect(new Set(ns.map((n) => `${n.q},${n.r}`)).size).toBe(6);
    for (const n of ns) expect(distance(centre, n)).toBe(1);
  });

  it('is symmetric: a hex is a neighbour of each of its neighbours', () => {
    const hex = { q: 0, r: 0 };
    for (const n of neighbours(hex)) {
      expect(neighbours(n).some((m) => sameHex(m, hex))).toBe(true);
    }
  });

  it('computes distances', () => {
    const origin = { q: 0, r: 0 };
    expect(distance(origin, origin)).toBe(0);
    expect(distance(origin, { q: 3, r: 0 })).toBe(3);
    expect(distance(origin, { q: 0, r: -4 })).toBe(4);
    expect(distance(origin, { q: 2, r: -5 })).toBe(5);
    expect(distance(origin, { q: -2, r: -1 })).toBe(3);
    expect(distance({ q: 1, r: 2 }, { q: -1, r: 4 })).toBe(2);
    expect(distance({ q: 4, r: -2 }, { q: -1, r: 3 })).toBe(distance({ q: -1, r: 3 }, { q: 4, r: -2 }));
  });

  it('converts odd-r offset coordinates to axial and back', () => {
    expect(offsetToAxial(0, 0)).toEqual({ q: 0, r: 0 });
    expect(offsetToAxial(3, 1)).toEqual({ q: 3, r: 1 });
    expect(offsetToAxial(3, 2)).toEqual({ q: 2, r: 2 });
    expect(offsetToAxial(0, 10)).toEqual({ q: -5, r: 10 });
    for (let row = 0; row < 11; row++) {
      for (let col = 0; col < 11; col++) {
        expect(axialToOffset(offsetToAxial(col, row))).toEqual({ col, row });
      }
    }
  });

  it('places offset neighbours where odd-r expects them', () => {
    // In odd-r, (col 1, row 1) touches (1, 0), (2, 0), (0, 1), (2, 1), (1, 2) and (2, 2).
    const ns = neighbours(offsetToAxial(1, 1)).map(axialToOffset);
    const expected = [
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 0, row: 1 },
      { col: 2, row: 1 },
      { col: 1, row: 2 },
      { col: 2, row: 2 },
    ];
    expect(ns).toHaveLength(6);
    for (const e of expected) expect(ns).toContainEqual(e);
  });
});

describe('roundHex', () => {
  it('returns the hex itself for whole coordinates', () => {
    expect(roundHex(3, -2)).toEqual({ q: 3, r: -2 });
    expect(roundHex(0, 0)).toEqual({ q: 0, r: 0 });
  });

  it('rounds points inside a hex to that hex', () => {
    expect(roundHex(0.3, 0.1)).toEqual({ q: 0, r: 0 });
    expect(roundHex(0.9, -0.2)).toEqual({ q: 1, r: 0 });
    expect(roundHex(-0.1, -0.35)).toEqual({ q: 0, r: 0 });
    expect(roundHex(2.2, -1.1)).toEqual({ q: 2, r: -1 });
  });

  it('keeps the cube constraint when q and r round the wrong way', () => {
    // q = 0.45 and r = 0.45 both round down, but s = -0.9 is far from 0: the hex is (0, 1) or (1, 0).
    const h = roundHex(0.45, 0.45);
    expect(distance(h, { q: 0, r: 0 })).toBe(1);
  });
});
