import { describe, expect, it } from 'vitest';
import { BASELINES, RuleStepAgent } from '../src/core/bench/baselines';
import { BAD_STATUSES, runGame, serializeLog } from '../src/core/bench/harness';
import { SearchStepAgent } from '../src/core/bench/search';
import { tileAtHex } from '../src/core/board';
import { legalActions, observe, step } from '../src/core/engine';
import { neighbours } from '../src/core/hex';
import type { Action } from '../src/core/state';
import { addUnit, blankGame, MIDDLE } from './helpers';

const clock = () => {
  let t = 0;
  return () => (t += 1);
};

describe('search reference player', () => {
  it('is registered as a baseline', () => {
    expect(BASELINES.search?.(1, 0).name).toBe('search');
  });

  it('only plays legal actions and never hits the per-turn cap', async () => {
    const log = await runGame({ seed: 5, agents: [new SearchStepAgent(), new RuleStepAgent()], turnLimit: 6, now: clock() });
    const mine = log.moves.filter((m) => m.player === 0);
    expect(mine.length).toBeGreaterThan(10);
    expect(mine.filter((m) => BAD_STATUSES.includes(m.status) || m.status === 'cap')).toEqual([]);
  });

  it('gives the same moves for the same seed', async () => {
    const play = () => runGame({ seed: 8, agents: [BASELINES.search!(8, 0), BASELINES.search!(8, 1)], turnLimit: 4, now: clock() });
    expect(serializeLog(await play())).toBe(serializeLog(await play()));
  });

  it('takes an obviously winning capture', () => {
    const s = blankGame();
    const enemyCapital = s.cities.find((c) => c.owner === 1 && c.capital)!;
    const u = addUnit(s, 0, 'warrior', enemyCapital);
    addUnit(s, 1, 'warrior', MIDDLE);
    const { action } = new SearchStepAgent().choose(observe(s, 0), legalActions(s, 0)) as { action: Action };
    expect(action).toEqual({ type: 'capture', unit: u.id });
  });

  it('removes an enemy unit standing on its capital before the turn ends', () => {
    let s = blankGame();
    const capital = s.cities.find((c) => c.owner === 0 && c.capital)!;
    const intruder = addUnit(s, 1, 'warrior', capital, { hp: 3 });
    const next = neighbours(capital).find((h) => tileAtHex(s, h) && !s.cities.some((c) => c.q === h.q && c.r === h.r))!;
    addUnit(s, 0, 'warrior', next);
    const agent = new SearchStepAgent();
    for (let i = 0; i < 20 && s.current === 0; i++) {
      const { action } = agent.choose(observe(s, 0), legalActions(s, 0)) as { action: Action };
      s = step(s, 0, [action]).state;
    }
    expect(s.units.some((u) => u.id === intruder.id)).toBe(false);
  });
});
