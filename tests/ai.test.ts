import { describe, expect, it } from 'vitest';
import { playTurn } from '../src/core/agent';
import { GreedyAgent, TECH_ORDER } from '../src/core/ai';
import { legalActions, newGame, observe } from '../src/core/engine';
import { TECH_COST } from '../src/core/rules';
import { addUnit, blankGame, MIDDLE } from './helpers';

const ai = new GreedyAgent();
const decide = (s: ReturnType<typeof blankGame>, me = 0) => ai.decide(observe(s, me), legalActions(s, me)) as ReturnType<typeof legalActions>;

describe('GreedyAgent', () => {
  it('always ends its turn with end_turn', () => {
    const s = newGame({ seed: 3, players: 2 });
    expect(decide(s).at(-1)).toEqual({ type: 'end_turn' });
  });

  it('captures a village it stands on', () => {
    const s = blankGame();
    s.cities.push({ id: 90, q: MIDDLE.q, r: MIDDLE.r, owner: null, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    const u = addUnit(s, 0, 'warrior', MIDDLE);
    expect(decide(s)[0]).toEqual({ type: 'capture', unit: u.id });
  });

  it('walks towards a nearby village', () => {
    const s = blankGame();
    s.cities = s.cities.filter((c) => c.owner !== null);
    s.cities.push({ id: 90, q: MIDDLE.q + 3, r: MIDDLE.r, owner: null, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    s.players[0]!.stars = 0;
    const u = addUnit(s, 0, 'warrior', MIDDLE);
    const move = decide(s).find((a) => a.type === 'move' && a.unit === u.id);
    expect(move).toMatchObject({ type: 'move', to: { q: MIDDLE.q + 1, r: MIDDLE.r } });
  });

  it('attacks when favourable', () => {
    const s = blankGame();
    s.players[0]!.stars = 0;
    const u = addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 1, 'warrior', { q: MIDDLE.q + 1, r: MIDDLE.r }, { hp: 4 });
    expect(decide(s)[0]).toMatchObject({ type: 'attack', unit: u.id });
  });

  it('does not make a suicidal attack', () => {
    const s = blankGame();
    s.players[0]!.stars = 0;
    addUnit(s, 0, 'warrior', MIDDLE, { hp: 1 });
    addUnit(s, 1, 'defender', { q: MIDDLE.q + 1, r: MIDDLE.r });
    expect(decide(s).some((a) => a.type === 'attack')).toBe(false);
  });

  it('researches in the fixed order when it has the stars', () => {
    const s = blankGame();
    s.players[0]!.stars = TECH_COST;
    addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 0, 'warrior', { q: MIDDLE.q, r: MIDDLE.r + 1 });
    expect(decide(s).find((a) => a.type === 'research')).toEqual({ type: 'research', tech: TECH_ORDER[0] });
  });

  it('trains when it has few units', () => {
    const s = blankGame();
    s.players[0]!.stars = 2;
    expect(decide(s)[0]).toMatchObject({ type: 'train', unit: 'warrior' });
  });

  it('one AI turn takes under 100 ms, even late in a game', async () => {
    let s = newGame({ seed: 5, players: 4 });
    let worst = 0;
    for (let i = 0; i < 60 && !s.over; i++) {
      const r = await playTurn(s, ai);
      s = r.state;
      worst = Math.max(worst, r.latencyMs);
      expect(r.rejected).toEqual([]);
    }
    expect(worst).toBeLessThan(100);
  });
});
