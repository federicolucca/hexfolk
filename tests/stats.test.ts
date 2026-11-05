import { describe, expect, it } from 'vitest';
import { fitElo, renderReport, summarise, wilson, type GameRecord } from '../src/core/stats';

const stats = { decisions: 10, actions: 50, illegal: 1, timeouts: 0, errors: 0, latencyMs: [1, 2, 3] };
const game = (a: string, b: string, winner: number | null): GameRecord => ({ seats: [a, b], winner, turns: 12, reason: 'domination', stats: [stats, stats] });

describe('wilson', () => {
  it('matches known values', () => {
    const [lo, hi] = wilson(7, 10);
    expect(lo).toBeCloseTo(0.397, 2);
    expect(hi).toBeCloseTo(0.892, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
    expect(wilson(10, 10)[1]).toBe(1);
  });
});

describe('fitElo', () => {
  it('ranks the stronger agent higher, is centred on 1000 and ignores game order', () => {
    const games = [game('a', 'b', 0), game('b', 'a', 1), game('a', 'b', 0), game('b', 'a', 0)];
    const elo = fitElo(['a', 'b'], games);
    expect(elo.get('a')!).toBeGreaterThan(elo.get('b')!);
    expect((elo.get('a')! + elo.get('b')!) / 2).toBeCloseTo(1000, 3);
    expect(fitElo(['a', 'b'], [...games].reverse()).get('a')).toBeCloseTo(elo.get('a')!, 6);
  });

  it('stays finite after a clean sweep and puts equal agents together', () => {
    const sweep = fitElo(['a', 'b'], [game('a', 'b', 0), game('a', 'b', 0), game('b', 'a', 1)]);
    expect(Number.isFinite(sweep.get('a')!)).toBe(true);
    const even = fitElo(['a', 'b'], [game('a', 'b', null), game('b', 'a', null)]);
    expect(even.get('a')!).toBeCloseTo(even.get('b')!, 3);
  });
});

describe('summarise / renderReport', () => {
  it('counts wins by agent, not by seat, and renders a table', () => {
    const games = [game('a', 'b', 0), game('b', 'a', 0), game('a', 'b', null)];
    const rows = summarise(['a', 'b'], games);
    expect(rows[0]).toMatchObject({ name: 'a', matches: 3, wins: 1, draws: 1, losses: 1, illegal: 3, actions: 150 });
    expect(rows[1]).toMatchObject({ name: 'b', wins: 1 });
    const md = renderReport(['a', 'b'], games, { command: 'npm run sim', firstSeed: 1, seeds: 3, turnLimit: 30 });
    expect(md).toContain('| a | 3 | 1 / 1 / 1 |');
    expect(md).toContain('Endings: domination 3');
  });
});
