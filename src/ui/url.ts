// URL parameters: pure parsing, no DOM.
import { DEFAULT_DIFFICULTY, type Difficulty, isDifficulty } from '../core/ai';
import { MAX_PLAYERS, MIN_PLAYERS } from '../core/map';
import { isTheme, type Theme } from '../core/theme';

export const DEFAULT_PLAYERS = 4;
const MAX_SEED = 0xffffffff;

/** ?seed= as an unsigned 32-bit integer, or undefined when absent or invalid. */
export function parseSeed(search: string): number | undefined {
  const raw = new URLSearchParams(search).get('seed')?.trim();
  if (!raw || !/^\d{1,10}$/.test(raw)) return undefined;
  const seed = Number(raw);
  return seed <= MAX_SEED ? seed : undefined;
}

/** ?players= from 2 to 4, or the default. */
export function parsePlayers(search: string): number {
  const raw = new URLSearchParams(search).get('players');
  const players = raw === null ? NaN : Number(raw);
  return Number.isInteger(players) && players >= MIN_PLAYERS && players <= MAX_PLAYERS ? players : DEFAULT_PLAYERS;
}

/** ?theme= when it names a theme; otherwise undefined (the theme then follows the seed). */
export function parseTheme(search: string): Theme | undefined {
  const raw = new URLSearchParams(search).get('theme')?.trim().toLowerCase();
  return isTheme(raw) ? raw : undefined;
}

/** ?difficulty= easy or normal; the default is easy. */
export function parseDifficulty(search: string): Difficulty {
  const raw = new URLSearchParams(search).get('difficulty')?.trim().toLowerCase();
  return isDifficulty(raw) ? raw : DEFAULT_DIFFICULTY;
}

/** A random seed from a [0, 1) source (Math.random by default). */
export function randomSeed(random: () => number = Math.random): number {
  return Math.floor(random() * (MAX_SEED + 1)) >>> 0;
}

/** The same search string with ?seed= set and ?theme= set or removed, keeping other parameters. */
export function withParams(search: string, seed: number, theme: Theme | undefined, difficulty?: Difficulty): string {
  const params = new URLSearchParams(search);
  params.set('seed', String(seed));
  if (difficulty) params.set('difficulty', difficulty);
  if (theme) params.set('theme', theme);
  else params.delete('theme');
  return `?${params.toString()}`;
}
