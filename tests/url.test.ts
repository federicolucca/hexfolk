import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { describeHex } from '../src/ui/describe';
import { DEFAULT_PLAYERS, parsePlayers, parseSeed, parseTheme, randomSeed, withParams } from '../src/ui/url';

describe('parseSeed', () => {
  it('reads an unsigned 32-bit seed', () => {
    expect(parseSeed('?seed=42')).toBe(42);
    expect(parseSeed('?players=3&seed=0')).toBe(0);
    expect(parseSeed('?seed=4294967295')).toBe(4294967295);
  });

  it('ignores missing or invalid seeds', () => {
    expect(parseSeed('')).toBeUndefined();
    expect(parseSeed('?seed=')).toBeUndefined();
    expect(parseSeed('?seed=-1')).toBeUndefined();
    expect(parseSeed('?seed=1.5')).toBeUndefined();
    expect(parseSeed('?seed=abc')).toBeUndefined();
    expect(parseSeed('?seed=4294967296')).toBeUndefined();
  });
});

describe('parsePlayers', () => {
  it('reads 2 to 4 players, else the default', () => {
    expect(parsePlayers('?players=2')).toBe(2);
    expect(parsePlayers('?players=4')).toBe(4);
    expect(parsePlayers('?players=5')).toBe(DEFAULT_PLAYERS);
    expect(parsePlayers('?players=x')).toBe(DEFAULT_PLAYERS);
    expect(parsePlayers('')).toBe(DEFAULT_PLAYERS);
  });
});

describe('parseTheme', () => {
  it('reads a known theme, case-insensitively', () => {
    expect(parseTheme('?theme=icelands')).toBe('icelands');
    expect(parseTheme('?seed=1&theme=DeadLands')).toBe('deadlands');
  });

  it('ignores missing or unknown themes', () => {
    expect(parseTheme('')).toBeUndefined();
    expect(parseTheme('?theme=sandlands')).toBeUndefined();
  });
});

describe('randomSeed and withParams', () => {
  it('maps [0, 1) onto the full seed range', () => {
    expect(randomSeed(() => 0)).toBe(0);
    expect(randomSeed(() => 0.999999999999)).toBe(4294967295);
    const seed = randomSeed();
    expect(Number.isInteger(seed) && seed >= 0 && seed <= 4294967295).toBe(true);
  });

  it('sets the seed and the theme and keeps other parameters', () => {
    expect(withParams('', 7, undefined)).toBe('?seed=7');
    expect(withParams('?players=2&seed=1', 9, undefined)).toBe('?players=2&seed=9');
    expect(withParams('?seed=1', 9, 'drylands')).toBe('?seed=9&theme=drylands');
    expect(withParams('?seed=1&theme=icelands', 9, undefined)).toBe('?seed=9');
  });
});

describe('describeHex', () => {
  it('names the unit, the city and the terrain on a hex', () => {
    const state = newGame({ seed: 5, players: 2 });
    const capital = state.cities.find((c) => c.capital && c.owner === 1);
    if (!capital) throw new Error('no capital');
    const d = describeHex(state, capital);
    expect(d?.title).toBe('Red warrior · 10/10 HP');
    expect(d?.detail).toBe('Red capital · Grass');
    const village = state.cities.find((c) => c.owner === null);
    if (!village) throw new Error('no village');
    expect(describeHex(state, village)).toEqual({ title: 'Neutral village', detail: 'Grass' });
    expect(describeHex(state, { q: 99, r: 99 })).toBeNull();
  });
});
