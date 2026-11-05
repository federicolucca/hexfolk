import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFFICULTY, EASY_PURCHASES_PER_TURN, GreedyAgent, isDifficulty } from '../src/core/ai';
import { previewAttack } from '../src/core/combat';
import { legalActions, observe } from '../src/core/engine';
import { parseDifficulty, withParams } from '../src/ui/url';
import { addUnit, blankGame, MIDDLE } from './helpers';

const play = (agent: GreedyAgent, s: ReturnType<typeof blankGame>) => agent.decide(observe(s, 0), legalActions(s, 0)) as ReturnType<typeof legalActions>;
const PURCHASES = ['train', 'research', 'harvest', 'build_walls'];

describe('difficulty', () => {
  it('defaults to easy in the UI and normal in the agent', () => {
    expect(DEFAULT_DIFFICULTY).toBe('easy');
    expect(new GreedyAgent().difficulty).toBe('normal');
    expect(new GreedyAgent('easy').name).toBe('greedy-easy');
    expect(isDifficulty('hard')).toBe(false);
  });

  it('reads ?difficulty= and keeps it in the URL', () => {
    expect(parseDifficulty('')).toBe('easy');
    expect(parseDifficulty('?difficulty=normal')).toBe('normal');
    expect(parseDifficulty('?difficulty=insane')).toBe('easy');
    expect(withParams('', 7, undefined, 'normal')).toContain('difficulty=normal');
  });

  it('easy makes fewer purchases than normal', () => {
    const s = blankGame();
    s.players[0]!.stars = 60;
    const count = (agent: GreedyAgent) => play(agent, s).filter((a) => PURCHASES.includes(a.type)).length;
    expect(count(new GreedyAgent('normal'))).toBeGreaterThan(EASY_PURCHASES_PER_TURN);
    expect(count(new GreedyAgent('easy'))).toBeLessThanOrEqual(EASY_PURCHASES_PER_TURN);
    expect(play(new GreedyAgent('easy'), s).at(-1)).toEqual({ type: 'end_turn' });
  });

  it('easy still takes a kill', () => {
    const s = blankGame();
    s.players[0]!.stars = 0;
    const u = addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 1, 'warrior', { q: MIDDLE.q + 1, r: MIDDLE.r }, { hp: 4 });
    expect(play(new GreedyAgent('easy'), s)[0]).toMatchObject({ type: 'attack', unit: u.id });
  });

  it('easy skips an attack that is only slightly favourable; normal takes it', () => {
    const s = blankGame();
    s.players[0]!.stars = 0;
    const u = addUnit(s, 0, 'warrior', MIDDLE);
    const t = addUnit(s, 1, 'warrior', { q: MIDDLE.q + 1, r: MIDDLE.r }, { hp: 10 });
    // Search hp pairs for a trade that is favourable but not 2:1.
    let found = false;
    for (let mine = 10; mine >= 1 && !found; mine--) {
      for (let theirs = 10; theirs >= 1 && !found; theirs--) {
        u.hp = mine;
        t.hp = theirs;
        const p = previewAttack(s, u, t);
        found = !p.kills && !p.attackerDies && p.damage > p.counter && p.damage < 2 * p.counter;
      }
    }
    expect(found).toBe(true);
    expect(play(new GreedyAgent('normal'), s)[0]).toMatchObject({ type: 'attack' });
    expect(play(new GreedyAgent('easy'), s).some((a) => a.type === 'attack')).toBe(false);
  });
});
