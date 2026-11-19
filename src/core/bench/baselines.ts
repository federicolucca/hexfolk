// Reference players for the benchmark. Without them the language-model numbers mean nothing.
//   random     uniform among the legal actions (end_turn included), seeded.
//   rule       a hand-written strategy in a few lines: capture, win fights, keep a small army, grow
//              (harvest, research), then go for the nearest city that is not yours.
//   lookahead  a short search: tries every legal action on a copy of the state and keeps the one
//              with the best evaluation, where the evaluation also counts the damage the opponent
//              could deal on its next turn (one turn ahead). Ends the turn when nothing improves.
//   greedy     the game's own tuned AI (src/core/ai/greedy.ts), wrapped to play step by step.
import { GreedyAgent } from '../ai/greedy';
import type { Difficulty } from '../ai/greedy';
import { unitById } from '../board';
import { previewAttack } from '../combat';
import { score } from '../economy';
import { type Observation, step } from '../engine';
import { distance } from '../hex';
import { createRng } from '../rng';
import { UNIT_STATS } from '../rules';
import type { Action, GameState, HexRef } from '../state';
import type { Decision, StepAgent } from './harness';

export class RandomStepAgent implements StepAgent {
  readonly name = 'random';
  private readonly rng;
  constructor(seed: number) {
    this.rng = createRng(seed);
  }
  choose(_view: Observation, legal: Action[]): Decision {
    return { action: this.rng.pick(legal) };
  }
}

/** Hand-written rule, in priority order. */
export class RuleStepAgent implements StepAgent {
  readonly name = 'rule';
  choose({ you, state }: Observation, legal: Action[]): Decision {
    const first = (type: Action['type'], ok: (a: Action) => boolean = () => true) => legal.find((a) => a.type === type && ok(a));
    const winning = (a: Action) => {
      if (a.type !== 'attack') return false;
      const me = unitById(state, a.unit);
      const target = state.units.find((u) => u.q === a.target.q && u.r === a.target.r);
      if (!me || !target) return false;
      const p = previewAttack(state, me, target);
      return p.kills || p.damage > p.counter;
    };
    const myUnits = state.units.filter((u) => u.owner === you).length;
    const myCities = state.cities.filter((c) => c.owner === you).length;
    const pick =
      first('capture') ??
      first('attack', winning) ??
      (myUnits < myCities + 2 ? first('train', (a) => a.type === 'train' && a.unit === 'warrior') : undefined) ??
      first('harvest') ??
      first('research') ??
      nearestTargetMove(state, you, legal);
    return { action: pick ?? { type: 'end_turn' } };
  }
}

/** The move that brings a unit closest to a city it does not own (only if it gets closer). */
function nearestTargetMove(state: GameState, you: number, legal: Action[]): Action | undefined {
  const targets = state.cities.filter((c) => c.owner !== you);
  const gap = (h: HexRef) => Math.min(...targets.map((c) => distance(h, c)));
  let best: { action: Action; gain: number } | undefined;
  for (const a of legal) {
    if (a.type !== 'move') continue;
    const unit = unitById(state, a.unit);
    if (!unit) continue;
    const gain = gap(unit) - gap(a.to);
    if (gain > 0 && (!best || gain > best.gain)) best = { action: a, gain };
  }
  return best?.action;
}

/** Static evaluation from one player's side; higher is better. */
export function evaluate(state: GameState, me: number): number {
  const opp = state.players.find((p) => p.id !== me)?.id ?? 1 - me;
  if (state.over) return state.winner === me ? 1e6 : state.winner === null ? 0 : -1e6;
  const strength = (p: number) => state.units.filter((u) => u.owner === p).reduce((n, u) => n + (UNIT_STATS[u.type].attack + UNIT_STATS[u.type].defence) * (u.hp / UNIT_STATS[u.type].health), 0);
  const targets = state.cities.filter((c) => c.owner !== me);
  const approach = state.units.filter((u) => u.owner === me).reduce((n, u) => n + (targets.length ? Math.min(...targets.map((c) => distance(u, c))) : 0), 0);
  const stars = (p: number) => state.players[p]?.stars ?? 0;
  return 10 * (score(state, me) - score(state, opp)) + 2 * (strength(me) - strength(opp)) + 0.5 * (stars(me) - stars(opp)) - 0.5 * approach - 3 * threat(state, me, opp);
}

/** Health the opponent could take from my units next turn: each enemy's best single attack, unit by unit. */
function threat(state: GameState, me: number, opp: number): number {
  let total = 0;
  for (const enemy of state.units) {
    if (enemy.owner !== opp) continue;
    const reach = UNIT_STATS[enemy.type].movement + UNIT_STATS[enemy.type].range;
    let best = 0;
    for (const mine of state.units) {
      if (mine.owner !== me || distance(enemy, mine) > reach) continue;
      const p = previewAttack(state, { ...enemy, hp: enemy.hp }, mine);
      best = Math.max(best, p.kills ? p.damage + 5 : p.damage);
    }
    total += best;
  }
  return total;
}

export class LookaheadStepAgent implements StepAgent {
  readonly name = 'lookahead';
  choose({ you, state }: Observation, legal: Action[]): Decision {
    let best: Action = { type: 'end_turn' };
    let bestValue = evaluate(state, you) + 0.01;
    for (const a of legal) {
      if (a.type === 'end_turn') continue;
      const value = evaluate(step(state, you, [a]).state, you);
      if (value > bestValue) {
        best = a;
        bestValue = value;
      }
    }
    return { action: best };
  }
}

/** The game's greedy AI, asked once per turn, then fed out one action at a time. */
export class GreedyStepAgent implements StepAgent {
  readonly name: string;
  private readonly ai: GreedyAgent;
  private queue: Action[] = [];
  private key = '';
  constructor(difficulty: Difficulty = 'normal') {
    this.ai = new GreedyAgent(difficulty);
    this.name = `greedy-${difficulty}`;
  }
  async choose(view: Observation, legal: Action[]): Promise<Decision> {
    const key = `${view.state.turn}:${view.you}`;
    if (key !== this.key || this.queue.length === 0) {
      this.key = key;
      this.queue = [...(await this.ai.decide(view, legal))];
    }
    return { action: this.queue.shift() ?? { type: 'end_turn' } };
  }
}

/** Factories by name; the seat and game seed make the random player reproducible. */
export const BASELINES: Readonly<Record<string, (seed: number, seat: number) => StepAgent>> = {
  random: (seed, seat) => new RandomStepAgent(seed * 2 + seat + 1),
  rule: () => new RuleStepAgent(),
  lookahead: () => new LookaheadStepAgent(),
  'greedy-normal': () => new GreedyStepAgent('normal'),
};
