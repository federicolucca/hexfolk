import { describe, expect, it } from 'vitest';
import { GreedyAgent } from '../src/core/ai';
import { RandomAgent } from '../src/core/ai/random';
import type { Agent } from '../src/core/agent';
import { Match, runMatch } from '../src/core/match';
import { parseReplay, replayStates, serializeReplay } from '../src/core/replay';
import { parseAction, parseActions } from '../src/core/validate';
import { newGame } from '../src/core/engine';

const play = (seed: number, agents: Agent[], turnLimit = 12) => runMatch({ seed, players: 2, turnLimit, agents });

describe('determinism', () => {
  it('same seed and agents give an identical replay', async () => {
    const a = await play(5, [new GreedyAgent('normal'), new RandomAgent(11)]);
    const b = await play(5, [new GreedyAgent('normal'), new RandomAgent(11)]);
    const strip = (r: typeof a.replay) => serializeReplay({ ...r, turns: r.turns.map(({ latencyMs: _l, ...t }) => ({ ...t, type: 'turn' as const })) });
    expect(strip(a.replay)).toBe(strip(b.replay));
    expect(a.match.state).toEqual(b.match.state);
  });

  it('different seeds give different games', async () => {
    const a = await play(5, [new GreedyAgent(), new GreedyAgent()]);
    const b = await play(6, [new GreedyAgent(), new GreedyAgent()]);
    expect(a.match.state.tiles).not.toEqual(b.match.state.tiles);
  });

  it('replaying the actions rebuilds the final state, and the file round-trips', async () => {
    const { match, replay } = await play(9, [new GreedyAgent(), new GreedyAgent('easy')]);
    const parsed = parseReplay(serializeReplay(replay));
    expect(parsed.result).toEqual(replay.result);
    const states = replayStates(parsed);
    expect(states).toHaveLength(replay.turns.length + 1);
    expect(states.at(-1)).toEqual(match.state);
  });

  it('is the same on a fresh engine run (newGame is pure)', () => {
    expect(newGame({ seed: 3, players: 3 })).toEqual(newGame({ seed: 3, players: 3 }));
  });
});

describe('legality', () => {
  it('rejects illegal actions, counts them and never applies them', () => {
    const m = new Match({ seed: 1, players: 2 });
    const before = structuredClone(m.state);
    const r = m.submit(0, [{ type: 'move', unit: 999, to: { q: 0, r: 0 } }, { type: 'train', city: 42, unit: 'rider' }]);
    expect(r.rejected.map((x) => x.action.type)).toEqual(['move', 'train']);
    expect(m.stats[0]?.illegal).toBe(2);
    expect(m.state).toEqual(before);
  });

  it('rejects a seat acting out of turn', () => {
    const m = new Match({ seed: 1, players: 2 });
    const r = m.submit(1, [{ type: 'end_turn' }]);
    expect(r.rejected).toHaveLength(1);
    expect(r.turnEnded).toBe(false);
    expect(m.state.current).toBe(0);
  });

  it('ends the turn by default when asked, and records it', () => {
    const m = new Match({ seed: 1, players: 2 });
    const r = m.submit(0, [], { autoEnd: true, timedOut: true });
    expect(r.turnEnded).toBe(true);
    expect(m.state.current).toBe(1);
    expect(m.stats[0]?.timeouts).toBe(1);
    expect(m.replay().turns[0]).toMatchObject({ player: 0, timedOut: true, actions: [{ type: 'end_turn' }] });
  });

  it('turns a slow or crashing agent into the default action', async () => {
    const slow: Agent = { name: 'slow', decide: () => new Promise(() => {}) };
    const broken: Agent = { name: 'broken', decide: () => { throw new Error('boom'); } };
    const { match } = await runMatch({ seed: 2, players: 2, turnLimit: 2, agents: [slow, broken], timeoutMs: 5 });
    expect(match.over).toBe(true);
    expect(match.stats[0]?.timeouts).toBe(2);
    expect(match.stats[1]?.errors).toBe(2);
  });

  it('does not count actions queued after the winning move as illegal', async () => {
    const { match } = await play(1, [new GreedyAgent(), new GreedyAgent()], 30);
    expect(match.stats.every((s) => s.illegal === 0)).toBe(true);
  });
});

describe('parseAction', () => {
  it('accepts well-formed actions and drops unknown fields', () => {
    expect(parseAction({ type: 'move', unit: 1, to: { q: 2, r: 3 }, extra: 1 })).toEqual({ ok: true, value: { type: 'move', unit: 1, to: { q: 2, r: 3 } } });
    expect(parseAction({ type: 'train', city: 0, unit: 'rider' }).ok).toBe(true);
  });

  it('rejects malformed input', () => {
    for (const bad of [null, 5, [], {}, { type: 'fly' }, { type: 'move', unit: '1', to: { q: 0, r: 0 } }, { type: 'move', unit: 1 }, { type: 'train', city: 0, unit: 'dragon' }, { type: 'research', tech: 'magic' }, { type: 'harvest', at: { q: 1.5, r: 0 } }]) {
      expect(parseAction(bad).ok).toBe(false);
    }
    expect(parseActions('nope').ok).toBe(false);
    expect(parseActions(Array.from({ length: 201 }, () => ({ type: 'end_turn' }))).ok).toBe(false);
  });
});
