/** A seeded pseudo-random number generator. Same seed, same sequence, on every platform. */
export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** A random element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
}

/** Normalises any number to an unsigned 32-bit seed. */
export function toSeed(seed: number): number {
  return Math.trunc(seed) >>> 0;
}

/** mulberry32: a tiny, fast 32-bit generator, good enough for map generation. */
export function createRng(seed: number): Rng {
  let state = toSeed(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick() needs a non-empty array');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
  };
}

/** A well-mixed unsigned 32-bit hash of a seed and a hex, for per-tile choices such as art variants. */
export function hashHex(seed: number, q: number, r: number): number {
  let h = toSeed(seed) ^ Math.imul(q | 0, 0x9e3779b1) ^ Math.imul(r | 0, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** One mulberry32 step on a plain number state, so the generator can live inside the game state as JSON. */
export function stepRngState(state: number): { state: number; value: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: s, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

/** A 2d6 roll (2 to 12) from a stored generator state: the roll and the next state. */
export function rollTwoDice(state: number): { state: number; roll: number } {
  const a = stepRngState(state);
  const b = stepRngState(a.state);
  return { state: b.state, roll: 2 + Math.floor(a.value * 6) + Math.floor(b.value * 6) };
}

/** Chance (out of 36) that two dice add up to n. */
export function rollWays(n: number): number {
  return n < 2 || n > 12 ? 0 : 6 - Math.abs(n - 7);
}
