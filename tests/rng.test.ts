import { describe, expect, it } from 'vitest';
import { createRng, toSeed } from '../src/core/rng';

describe('createRng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 5 }, () => a.next())).not.toEqual(Array.from({ length: 5 }, () => b.next()));
  });

  it('stays in range', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = rng.int(3, 5);
      expect([3, 4, 5]).toContain(n);
    }
  });

  it('picks from the array and rejects an empty one', () => {
    const rng = createRng(3);
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('normalises seeds to unsigned 32-bit integers', () => {
    expect(toSeed(-1)).toBe(0xffffffff);
    expect(toSeed(5.9)).toBe(5);
    expect(createRng(-1).next()).toBe(createRng(0xffffffff).next());
  });
});
