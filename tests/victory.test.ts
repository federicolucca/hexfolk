import { describe, expect, it } from 'vitest';
import { score } from '../src/core/economy';
import { newGame, step } from '../src/core/engine';
import type { GameState } from '../src/core/state';
import { endSummary } from '../src/ui/describe';
import { loadGame, saveGame, SAVE_KEY } from '../src/ui/save';
import { addUnit, blankGame } from './helpers';

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

/** Plays end_turn until the game is over or the cap is hit. */
const run = (s: GameState): GameState => {
  let cur = s;
  for (let i = 0; i < 200 && !cur.over; i++) cur = step(cur, cur.current, [{ type: 'end_turn' }]).state;
  return cur;
};

describe('victory', () => {
  it('score counts cities, population, techs and units; the dead score 0', () => {
    const s = blankGame();
    const base = score(s, 0);
    expect(base).toBe(5 + 0 + 0 + 0);
    s.players[0]!.techs.push('riding');
    s.cities.find((c) => c.owner === 0)!.population = 2;
    addUnit(s, 0, 'warrior', { q: 0, r: 0 });
    expect(score(s, 0)).toBe(base + 2 + 2 + 1);
    s.players[0]!.alive = false;
    expect(score(s, 0)).toBe(0);
  });

  it('the game ends after the last round and the highest score wins', () => {
    const s = blankGame();
    s.turnLimit = 3;
    s.players[0]!.techs.push('riding', 'hunting');
    const end = run(s);
    expect(end.over).toBe(true);
    expect(end.turn).toBe(4);
    expect(end.winner).toBe(0);
    const last = step(blankGame(), 0, []);
    expect(last.state.over).toBe(false);
  });

  it('equal scores are a draw', () => {
    const s = blankGame();
    s.turnLimit = 2;
    const end = run(s);
    expect(end).toMatchObject({ over: true, winner: null });
  });

  it('a real game stops at the turn limit with a turn_limit event', () => {
    const s = newGame({ seed: 4, players: 3, turnLimit: 5 });
    let cur = s;
    const events = [];
    for (let i = 0; i < 100 && !cur.over; i++) {
      const r = step(cur, cur.current, [{ type: 'end_turn' }]);
      cur = r.state;
      events.push(...r.events);
    }
    const over = events.filter((e) => e.type === 'game_over');
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ reason: 'turn_limit' });
  });

  it('domination: taking the last enemy capital ends the game at once', () => {
    const s = blankGame();
    const enemy = s.cities.find((c) => c.owner === 1 && c.capital)!;
    const u = addUnit(s, 0, 'warrior', enemy);
    const r = step(s, 0, [{ type: 'capture', unit: u.id }]);
    expect(r.state).toMatchObject({ over: true, winner: 0 });
    expect(r.events).toContainEqual({ type: 'game_over', winner: 0, reason: 'domination' });
  });

  it('nothing is legal once the game is over', () => {
    const s = blankGame();
    s.over = true;
    expect(step(s, 0, [{ type: 'end_turn' }]).rejected).toHaveLength(1);
  });

  it('end screen text', () => {
    const s = blankGame();
    expect(endSummary(s, 0)).toBeNull();
    s.over = true;
    s.winner = 0;
    expect(endSummary(s, 0)?.title).toBe('Victory!');
    expect(endSummary(s, 1)?.title).toBe('Defeat');
    s.winner = null;
    expect(endSummary(s, 0)?.title).toBe('Draw');
    expect(endSummary(s, 0)?.lines.at(0)).toMatch(/Turn 30 reached/);
  });
});

describe('autosave', () => {
  it('round-trips a game', () => {
    const store = memory();
    const s = newGame({ seed: 12, players: 3 });
    expect(saveGame(store, s)).toBe(true);
    expect(loadGame(store)).toEqual(s);
  });

  it('ignores missing, corrupt or foreign saves', () => {
    const store = memory();
    expect(loadGame(store)).toBeNull();
    store.setItem(SAVE_KEY, '{not json');
    expect(loadGame(store)).toBeNull();
    store.setItem(SAVE_KEY, JSON.stringify({ version: 2 }));
    expect(loadGame(store)).toBeNull();
    expect(loadGame(undefined)).toBeNull();
  });

  it('survives storage that throws', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('full'); }, removeItem: () => undefined };
    expect(saveGame(broken, newGame({ seed: 1, players: 2 }))).toBe(false);
    expect(loadGame(broken)).toBeNull();
  });
});
