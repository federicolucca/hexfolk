// A strong search reference player, the ceiling of the benchmark (see docs/bench/tune-search.md).
//
// Rollout search over single actions. At each decision it:
//   1. builds a shortlist: end_turn, the actions the greedy and rule players would take, every
//      attack and capture, and the best `width` other actions by the static evaluation one step ahead;
//   2. plays each shortlisted action on a copy of the state, then plays the game forward until
//      `depth` turns have ended: its own side with the game's greedy AI, the opponent once with the
//      greedy AI and once with the rule player (both sides first hit any enemy unit standing on
//      one of their cities, which the greedy AI alone would let capture);
//   3. scores each line by the mean of value() over its turn ends, takes the worse of the two
//      opponent models, and keeps the action with the best score.
//
// The game is deterministic (combat has no dice, the round rolls come from the state), so one
// rollout per action and opponent model is exact under that model: no sampling and no random
// numbers are needed. The budget is fixed in shortlist size and rollout turns, never in
// wall-clock time, so a seed always gives the same game. Pure: it only reads the observation and
// simulates with step().
import { GreedyAgent } from '../ai/greedy';
import { previewAttack } from '../combat';
import { income, score } from '../economy';
import { distance } from '../hex';
import { reachable } from '../movement';
import { UNIT_STATS } from '../rules';
import { type Observation, legalActions, step } from '../engine';
import type { Action, GameState } from '../state';
import { evaluate, RuleStepAgent } from './baselines';
import { type Decision, MAX_ACTIONS_PER_TURN, type StepAgent } from './harness';

export interface SearchOptions {
  /** Actions kept from the one-step ranking, on top of end_turn and the greedy and rule picks. */
  width: number;
  /** Turns played in each rollout, counted in turn ends from now (2 = this turn and the opponent's reply). */
  depth: number;
  /** Models of the opponent in the rollouts; an action is worth its worst result over them. */
  models: Model[];
  /** Weights of the rollout evaluation (see value()). */
  weights: Weights;
}

export interface Weights {
  score: number;
  income: number;
  strength: number;
  stars: number;
  threat: number;
  approach: number;
  /** An enemy unit standing on one of my cities (it captures next turn unless removed); the capital counts `capital` times more. */
  occupied: number;
  capital: number;
  /** One of my cities empty with an enemy unit able to step onto it next turn (times `capital` for the capital). */
  guard: number;
}

export type Model = 'greedy' | 'rule';

export const SEARCH_DEFAULTS: Readonly<SearchOptions> = { width: 6, depth: 5, models: ['greedy', 'rule'], weights: { score: 10, income: 4, strength: 2, stars: 0.5, threat: 3, approach: 0.2, occupied: 40, capital: 8, guard: 15 } };

const END: Action = { type: 'end_turn' };
const key = (a: Action): string => JSON.stringify(a);

export class SearchStepAgent implements StepAgent {
  readonly name = 'search';
  private readonly options: SearchOptions;
  private readonly policy = new GreedyAgent('normal');
  private readonly rule = new RuleStepAgent();
  private turnKey = '';
  private actionsThisTurn = 0;

  constructor(options: Partial<SearchOptions> = {}) {
    this.options = { ...SEARCH_DEFAULTS, ...options, weights: { ...SEARCH_DEFAULTS.weights, ...options.weights } };
  }

  choose({ you, state }: Observation, legal: Action[]): Decision {
    const turnKey = `${state.turn}:${you}`;
    if (turnKey !== this.turnKey) {
      this.turnKey = turnKey;
      this.actionsThisTurn = 0;
    }
    const action = this.pick(state, you, legal);
    this.actionsThisTurn = action.type === 'end_turn' ? 0 : this.actionsThisTurn + 1;
    return { action };
  }

  private pick(state: GameState, me: number, legal: Action[]): Action {
    // Leave room under the harness cap: the last action of a turn is always end_turn.
    if (legal.length <= 1 || this.actionsThisTurn >= MAX_ACTIONS_PER_TURN - 1) return END;
    let best: Action = END;
    let bestValue = -Infinity;
    for (const action of this.shortlist(state, me, legal)) {
      const next = step(state, me, [action]).state;
      let value = Infinity;
      for (const model of this.options.models) value = Math.min(value, this.rollout(next, me, action.type === 'end_turn', model));
      if (value > bestValue) {
        best = action;
        bestValue = value;
      }
    }
    return best;
  }

  /** end_turn, the greedy and rule picks, and the best `width` actions by one-step evaluation. */
  private shortlist(state: GameState, me: number, legal: Action[]): Action[] {
    const out = new Map<string, Action>([[key(END), END]]);
    const greedy = this.policy.decide({ you: me, state }, legal)[0];
    if (greedy) out.set(key(greedy), greedy);
    const rule = this.rule.choose({ you: me, state }, legal).action as Action;
    out.set(key(rule), rule);
    const ranked = legal
      .filter((a) => a.type !== 'end_turn')
      .map((a, i) => ({ a, i, v: evaluate(step(state, me, [a]).state, me) }))
      .sort((x, y) => y.v - x.v || x.i - y.i);
    const before = out.size;
    for (const a of legal) if (a.type === 'attack' || a.type === 'capture') out.set(key(a), a);
    const extra = out.size - before;
    for (const { a } of ranked) {
      if (out.size >= this.options.width + 3 + extra) break;
      out.set(key(a), a);
    }
    return [...out.values()];
  }

  /** One whole turn of the greedy AI, after first hitting any enemy unit that stands on one of the player's cities. */
  private greedyTurn(start: GameState, player: number): GameState {
    const state = defend(start, player);
    return step(state, player, this.policy.decide({ you: player, state }, legalActions(state, player))).state;
  }

  private ruleTurn(state: GameState, player: number): GameState {
    return ruleTurnOf(this.rule, state, player);
  }

  /**
   * Plays forward with the greedy AI (the opponent by `model`) until `depth` turns have ended,
   * counting this one, and returns the mean evaluation for `me` taken at each turn end. Averaging
   * over the line, not only its last state, rewards doing a good thing now rather than later.
   */
  private rollout(start: GameState, me: number, ended: boolean, model: Model): number {
    const { depth, weights } = this.options;
    let state = start;
    let total = ended ? value(state, me, weights) : 0;
    for (let t = ended ? 1 : 0; t < depth; t++) {
      if (!state.over) {
        const player = state.current;
        state = player !== me && model === 'rule' ? this.ruleTurn(state, player) : this.greedyTurn(state, player);
      }
      total += value(state, me, weights);
    }
    return total / depth;
  }
}

/**
 * Attacks enemy units standing on the player's cities (they capture at the start of their next
 * turn) with every unit that can reach one, hardest hit first, until none is left or no attack remains.
 * The greedy AI only attacks when the trade is favourable, so on its own it lets cities fall.
 */
function defend(start: GameState, player: number): GameState {
  let state = start;
  for (let i = 0; i < MAX_ACTIONS_PER_TURN; i++) {
    const occupied = new Set(state.units.filter((u) => u.owner !== player && state.cities.some((c) => c.owner === player && c.q === u.q && c.r === u.r)).map((u) => `${u.q},${u.r}`));
    if (occupied.size === 0) return state;
    let best: Action | undefined;
    let bestDamage = -1;
    for (const a of legalActions(state, player)) {
      if (a.type !== 'attack' || !occupied.has(`${a.target.q},${a.target.r}`)) continue;
      const attacker = state.units.find((u) => u.id === a.unit);
      const target = state.units.find((u) => u.q === a.target.q && u.r === a.target.r);
      if (!attacker || !target) continue;
      const damage = previewAttack(state, attacker, target).damage;
      if (damage > bestDamage) {
        best = a;
        bestDamage = damage;
      }
    }
    if (!best) return state;
    state = step(state, player, [best]).state;
  }
  return state;
}

/** One whole turn of the rule player. */
function ruleTurnOf(rule: RuleStepAgent, start: GameState, player: number): GameState {
  let state = start;
  for (let i = 0; i < MAX_ACTIONS_PER_TURN && !state.over && state.current === player; i++) {
    const action = rule.choose({ you: player, state }, legalActions(state, player)).action as Action;
    state = step(state, player, [i === MAX_ACTIONS_PER_TURN - 1 ? END : action]).state;
  }
  return state;
}

const strength = (state: GameState, p: number): number =>
  state.units.filter((u) => u.owner === p).reduce((n, u) => n + (UNIT_STATS[u.type].attack + UNIT_STATS[u.type].defence) * (u.hp / UNIT_STATS[u.type].health), 0);

/** Health `attacker`'s units could take from `victim`'s next turn: each unit's best single attack. */
function threat(state: GameState, victim: number, attacker: number): number {
  let total = 0;
  for (const enemy of state.units) {
    if (enemy.owner !== attacker) continue;
    const reach = UNIT_STATS[enemy.type].movement + UNIT_STATS[enemy.type].range;
    let best = 0;
    for (const mine of state.units) {
      if (mine.owner !== victim || distance(enemy, mine) > reach) continue;
      const p = previewAttack(state, enemy, mine);
      best = Math.max(best, p.kills ? p.damage + 5 : p.damage);
    }
    total += best;
  }
  return total;
}

/** How exposed `victim`'s cities are to `attacker`: units standing on them, empty cities in reach. */
function danger(state: GameState, victim: number, attacker: number, w: Weights): number {
  let total = 0;
  for (const city of state.cities) {
    if (city.owner !== victim) continue;
    const scale = city.capital ? w.capital : 1;
    const standing = state.units.find((u) => u.q === city.q && u.r === city.r);
    if (standing) {
      if (standing.owner === attacker) total += w.occupied * scale;
      continue;
    }
    const reaches = state.units.some(
      (u) => u.owner === attacker && distance(u, city) <= 2 * UNIT_STATS[u.type].movement && reachable(state, { ...u, moved: false, attacked: false }).some((h) => h.q === city.q && h.r === city.r),
    );
    if (reaches) total += w.guard * scale;
  }
  return total;
}

/** The rollout evaluation from `me`'s side: score, economy, army, safety; a decided game dominates. */
export function value(state: GameState, me: number, w: Weights): number {
  // A decided game dominates: a win sooner is better, a loss later is better.
  if (state.over && state.winner !== null) return (state.winner === me ? 1 : -1) * (1e6 - 1e3 * state.turn);
  const opp = state.players.find((p) => p.id !== me)?.id ?? 1 - me;
  const stars = (p: number) => state.players[p]?.stars ?? 0;
  const left = Math.max(0, state.turnLimit - state.turn);
  const targets = state.cities.filter((c) => c.owner !== me);
  const approach = state.units.filter((u) => u.owner === me).reduce((n, u) => n + (targets.length ? Math.min(...targets.map((c) => distance(u, c))) : 0), 0);
  const toMove = state.current === me ? 1 : 0;
  return (
    w.score * (score(state, me) - score(state, opp)) +
    w.income * Math.min(1, left / 10) * (income(state, me) - income(state, opp)) +
    w.strength * (strength(state, me) - strength(state, opp)) +
    w.stars * (stars(me) - stars(opp)) -
    w.threat * (1 - toMove) * threat(state, me, opp) +
    w.threat * toMove * threat(state, opp, me) -
    w.approach * approach -
    danger(state, me, opp, w) +
    0.5 * danger(state, opp, me, w)
  );
}
