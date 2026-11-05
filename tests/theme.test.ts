import { describe, expect, it } from 'vitest';
import { hashHex } from '../src/core/rng';
import { isTheme, THEMES, themeFromSeed } from '../src/core/theme';

describe('themeFromSeed', () => {
  it('is deterministic', () => {
    for (const seed of [0, 1, 42, 3846861248, 4294967295]) expect(themeFromSeed(seed)).toBe(themeFromSeed(seed));
  });

  it('always returns a known theme and uses all of them', () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 400; seed++) {
      const theme = themeFromSeed(seed * 7919);
      expect(isTheme(theme)).toBe(true);
      seen.add(theme);
    }
    expect([...seen].sort()).toEqual([...THEMES].sort());
  });

  it('spreads seeds roughly evenly over the themes', () => {
    const counts: Record<string, number> = {};
    for (let seed = 0; seed < 4000; seed++) {
      const t = themeFromSeed(seed);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const t of THEMES) expect(counts[t]).toBeGreaterThan(800);
  });
});

describe('isTheme', () => {
  it('accepts only the four themes', () => {
    expect(isTheme('greenlands')).toBe(true);
    expect(isTheme('sandlands')).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('hashHex', () => {
  it('is deterministic and unsigned 32-bit', () => {
    expect(hashHex(1, 2, 3)).toBe(hashHex(1, 2, 3));
    const h = hashHex(3846861248, -5, 10);
    expect(Number.isInteger(h) && h >= 0 && h <= 0xffffffff).toBe(true);
  });

  it('changes with the seed and with each coordinate', () => {
    const base = hashHex(7, 3, 4);
    expect(hashHex(8, 3, 4)).not.toBe(base);
    expect(hashHex(7, 4, 4)).not.toBe(base);
    expect(hashHex(7, 3, 5)).not.toBe(base);
    expect(hashHex(7, 4, 3)).not.toBe(base);
  });

  it('picks each of three variants about a third of the time', () => {
    const counts = [0, 0, 0];
    for (let q = -5; q < 15; q++) for (let r = 0; r < 20; r++) counts[hashHex(99, q, r) % 3]! += 1;
    for (const c of counts) expect(c).toBeGreaterThan(100);
  });
});
