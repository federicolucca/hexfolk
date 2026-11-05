import { createRng, toSeed } from './rng';

/** Visual themes (biomes). Each game uses one; it changes the art, never the rules. */
export const THEMES = ['greenlands', 'drylands', 'icelands', 'deadlands'] as const;
export type Theme = (typeof THEMES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * The theme a seed plays in. It draws from its own PRNG stream (the seed mixed with a constant),
 * so it is independent of the map layout drawn from the same seed.
 */
export function themeFromSeed(seed: number): Theme {
  const rng = createRng(toSeed(seed) ^ 0x7e4e5a11);
  return THEMES[Math.floor(rng.next() * THEMES.length)] ?? 'greenlands';
}
