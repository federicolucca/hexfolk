import { describe, expect, it } from 'vitest';
import { BASELINES, LookaheadStepAgent, RandomStepAgent, RuleStepAgent } from '../src/core/bench/baselines';
import { type Decision, type GameLog, parseLog, rebuildFromLog, runGame, serializeLog, type StepAgent } from '../src/core/bench/harness';
import type { Action } from '../src/core/state';

const clock = () => {
  let t = 0;
  return () => (t += 1);
};
const play = (seed: number, agents: [StepAgent, StepAgent], turnLimit = 12) => runGame({ seed, agents, turnLimit, now: clock() });
/** Scripted agent: returns the given decisions in order, then ends its turn. */
const scripted = (name: string, script: (() => Decision | Promise<Decision>)[]): StepAgent => {
  let i = 0;
  return { name, choose: () => (script[i++] ?? (() => ({ action: { type: 'end_turn' } })))() };
};

describe('benchmark harness: determinism and logs', () => {
  it('same seed and agents give the same game, decision by decision', async () => {
    const a = await play(4, [new RuleStepAgent(), new RandomStepAgent(9)]);
    const b = await play(4, [new RuleStepAgent(), new RandomStepAgent(9)]);
    expect(serializeLog(a)).toBe(serializeLog(b));
    expect(a.moves.length).toBeGreaterThan(10);
  });

  it('every baseline pairing is reproducible from the seed', async () => {
    for (const [x, y] of [['lookahead', 'rule'], ['greedy-normal', 'random']] as const) {
      const make = (): [StepAgent, StepAgent] => [BASELINES[x]!(7, 0), BASELINES[y]!(7, 1)];
      expect(serializeLog(await play(7, make(), 8))).toBe(serializeLog(await play(7, make(), 8)));
    }
  });

  it('the log round-trips and the game rebuilds from it alone', async () => {
    const log = await play(11, [new LookaheadStepAgent(), new RuleStepAgent()]);
    const parsed = parseLog(serializeLog(log));
    expect(parsed).toEqual(log);
    const end = rebuildFromLog(parsed);
    expect(end.winner).toBe(log.result.winner);
  });

  it('a tampered log is detected', async () => {
    const log = await play(11, [new RuleStepAgent(), new RandomStepAgent(1)]);
    const bad: GameLog = { ...log, result: { ...log.result, winner: log.result.winner === 0 ? 1 : 0 } };
    expect(() => rebuildFromLog(bad)).toThrow(/ends differently/);
  });

  it('logs seed, agents, every decision, time per decision, outcome and length', async () => {
    const log = await play(2, [new RuleStepAgent(), new RandomStepAgent(3)]);
    expect(log.header).toMatchObject({ seed: 2, agents: ['rule', 'random'], turnLimit: 12 });
    expect(log.moves.every((m) => typeof m.ms === 'number' && m.applied)).toBe(true);
    expect(log.result.turns).toBeGreaterThan(0);
    expect(log.result.seats[0].decisions + log.result.seats[1].decisions).toBe(log.moves.filter((m) => m.status !== 'cap').length);
  });
});

describe('benchmark harness: bad decisions are never corrected', () => {
  const firstMove = async (decision: () => Decision | Promise<Decision>, timeoutMs = 50) => {
    const log = await runGame({ seed: 1, agents: [scripted('bad', [decision]), new RuleStepAgent()], turnLimit: 2, timeoutMs, now: clock() });
    return { log, move: log.moves[0]!, next: log.moves[1]! };
  };

  it('a malformed action is logged and ends the turn', async () => {
    const { log, move, next } = await firstMove(() => ({ action: { type: 'fly' }, raw: 'fly!' }));
    expect(move).toMatchObject({ status: 'malformed', applied: { type: 'end_turn' }, submitted: { type: 'fly' }, raw: 'fly!' });
    expect(next.player).toBe(1);
    expect(log.result.seats[0].bad.malformed).toBe(1);
  });

  it('an illegal action is logged with the reason and ends the turn', async () => {
    const { log, move, next } = await firstMove(() => ({ action: { type: 'capture', unit: 999 } as Action }));
    expect(move.status).toBe('illegal');
    expect(move.reason).toBeTruthy();
    expect(next.player).toBe(1);
    expect(log.result.seats[0].bad.illegal).toBe(1);
  });

  it('a reply after the time limit is a timeout and ends the turn', async () => {
    const { log, move } = await firstMove(() => new Promise<Decision>((r) => setTimeout(() => r({ action: { type: 'end_turn' } }), 200)), 20);
    expect(move).toMatchObject({ status: 'timeout', applied: { type: 'end_turn' }, submitted: null });
    expect(log.result.seats[0].bad.timeout).toBe(1);
  });

  it('an agent error is logged and ends the turn', async () => {
    const { log, move } = await firstMove(() => {
      throw new Error('network down');
    });
    expect(move).toMatchObject({ status: 'error', reason: 'network down' });
    expect(log.result.seats[0].bad.error).toBe(1);
  });

  it('too many actions in one turn hit the cap, which is logged apart from bad decisions', async () => {
    const harvestless: StepAgent = { name: 'busy', choose: (_v, legal) => ({ action: legal.find((a) => a.type === 'move') ?? legal[0] }) };
    const looping: StepAgent = { name: 'loop', choose: () => ({ action: { type: 'research', tech: 'hunting' } }) };
    const log = await runGame({ seed: 1, agents: [harvestless, looping], turnLimit: 3, maxActionsPerTurn: 2, now: clock() });
    expect(log.moves.some((m) => m.status === 'cap')).toBe(true);
    expect(log.result.seats.every((s) => s.caps + s.decisions > 0)).toBe(true);
  });
});

describe('reference players', () => {
  it('only ever choose legal actions', async () => {
    for (const name of Object.keys(BASELINES)) {
      const log = await play(5, [BASELINES[name]!(5, 0), BASELINES[name]!(5, 1)], 10);
      const bad = log.result.seats.flatMap((s) => Object.values(s.bad)).reduce((n, x) => n + x, 0);
      expect(bad, name).toBe(0);
    }
  }, 60_000); // the search player plays itself here: a few seconds per game

  it('the rule player and the short search both beat random over a few seeds', async () => {
    for (const make of [() => new RuleStepAgent(), () => new LookaheadStepAgent()]) {
      let wins = 0;
      for (const seed of [21, 22, 23]) {
        for (const seat of [0, 1]) {
          const agents: [StepAgent, StepAgent] = seat === 0 ? [make(), new RandomStepAgent(seed)] : [new RandomStepAgent(seed), make()];
          const log = await play(seed, agents, 30);
          if (log.result.winner === seat) wins++;
        }
      }
      expect(wins).toBeGreaterThanOrEqual(4);
    }
  });
});
