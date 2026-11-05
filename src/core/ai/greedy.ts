// A greedy opponent: each step it takes the best-looking legal action by a fixed priority, applies
// it to a private copy of the state, and repeats until nothing is left. It only uses the Agent
// interface, so a minimax or external agent can replace it without engine changes.
import type { Agent } from '../agent';
import { cityAt, unitById } from '../board';
import { previewAttack } from '../combat';
import { legalActions, type Observation, step } from '../engine';
import { distance } from '../hex';
import { type TechId, type UnitType } from '../rules';
import type { Action, City, GameState, HexRef } from '../state';

/** Researched in this order. */
export const TECH_ORDER: readonly TechId[] = ['hunting', 'riding', 'archery', 'fortification', 'climbing', 'fishing'];
const TRAIN_ORDER: readonly UnitType[] = ['rider', 'archer', 'warrior', 'defender'];
const MAX_STEPS = 80;
/** An enemy this close to a city makes the unit on it stay put. */
const THREAT_RANGE = 3;

/**
 * normal: the full greedy rules. easy: the same agent with handicaps, for human players: it attacks
 * only when clearly favourable (a kill, or at least twice the damage it takes) and spends on at most
 * EASY_PURCHASES_PER_TURN things per turn (training, research, harvest, walls).
 */
export type Difficulty = 'easy' | 'normal';
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal'];
export const DEFAULT_DIFFICULTY: Difficulty = 'easy';
export const EASY_PURCHASES_PER_TURN = 1;
const PURCHASES: ReadonlySet<Action['type']> = new Set(['train', 'research', 'harvest', 'build_walls']);

export const isDifficulty = (v: unknown): v is Difficulty => v === 'easy' || v === 'normal';

export class GreedyAgent implements Agent {
  readonly name: string;

  constructor(readonly difficulty: Difficulty = 'normal') {
    this.name = difficulty === 'normal' ? 'greedy' : `greedy-${difficulty}`;
  }

  decide(observation: Observation, legal: Action[]): Action[] {
    const me = observation.you;
    const easy = this.difficulty === 'easy';
    let state = observation.state;
    let options = legal;
    let purchases = 0;
    const chosen: Action[] = [];
    for (let i = 0; i < MAX_STEPS; i++) {
      const usable = easy && purchases >= EASY_PURCHASES_PER_TURN ? options.filter((a) => !PURCHASES.has(a.type)) : options;
      const action = pick(state, me, usable, easy);
      if (!action) break;
      if (PURCHASES.has(action.type)) purchases++;
      chosen.push(action);
      state = step(state, me, [action]).state;
      options = legalActions(state, me);
    }
    chosen.push({ type: 'end_turn' });
    return chosen;
  }
}

function pick(state: GameState, me: number, options: Action[], easy: boolean): Action | null {
  return (
    options.find((a) => a.type === 'capture') ??
    bestAttack(state, options, easy) ??
    trainIfThin(state, me, options) ??
    research(options) ??
    options.find((a) => a.type === 'harvest') ??
    options.find((a) => a.type === 'build_walls' && threatened(state, me, cityOf(state, a.city))) ??
    bestTrain(options) ??
    bestMove(state, me, options)
  );
}

const cityOf = (state: GameState, id: number): City | undefined => state.cities.find((c) => c.id === id);

/** Attacks that are favourable: a kill, or more damage dealt than taken. */
function bestAttack(state: GameState, options: Action[], easy: boolean): Action | null {
  let best: Action | null = null;
  let bestScore = 0;
  for (const a of options) {
    if (a.type !== 'attack') continue;
    const attacker = unitById(state, a.unit);
    const target = state.units.find((u) => u.q === a.target.q && u.r === a.target.r);
    if (!attacker || !target) continue;
    const p = previewAttack(state, attacker, target);
    if (p.attackerDies && !p.kills) continue;
    if (easy && !p.kills && p.damage < 2 * p.counter) continue;
    const score = p.damage - p.counter + (p.kills ? 10 : 0);
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}

/** Keep about two units per city before spending on anything else. */
function trainIfThin(state: GameState, me: number, options: Action[]): Action | null {
  const cities = state.cities.filter((c) => c.owner === me).length;
  const units = state.units.filter((u) => u.owner === me).length;
  return units < 2 * cities ? bestTrain(options) : null;
}

function bestTrain(options: Action[]): Action | null {
  for (const type of TRAIN_ORDER) {
    const found = options.find((a) => a.type === 'train' && a.unit === type);
    if (found) return found;
  }
  return null;
}

function research(options: Action[]): Action | null {
  for (const tech of TECH_ORDER) {
    const found = options.find((a) => a.type === 'research' && a.tech === tech);
    if (found) return found;
  }
  return null;
}

/** An enemy unit within THREAT_RANGE of the hex. */
function threatened(state: GameState, me: number, at: HexRef | undefined): boolean {
  return at !== undefined && state.units.some((u) => u.owner !== me && distance(u, at) <= THREAT_RANGE);
}

/** The move that brings a unit closest to its goal: the nearest city it does not own, else the nearest enemy. */
function bestMove(state: GameState, me: number, options: Action[]): Action | null {
  const goals: HexRef[] = state.cities.filter((c) => c.owner !== me);
  const enemies: HexRef[] = state.units.filter((u) => u.owner !== me);
  let best: Action | null = null;
  let bestGain = 0;
  for (const a of options) {
    if (a.type !== 'move') continue;
    const unit = unitById(state, a.unit);
    if (!unit) continue;
    const home = cityAt(state, unit);
    // Defend: the unit standing on one of our cities stays while an enemy is close.
    if (home?.owner === me && threatened(state, me, home)) continue;
    const targets = goals.length > 0 ? goals : enemies;
    const gain = nearest(unit, targets) - nearest(a.to, targets);
    if (gain > bestGain) {
      best = a;
      bestGain = gain;
    }
  }
  return best;
}

const nearest = (from: HexRef, targets: HexRef[]): number => targets.reduce((m, t) => Math.min(m, distance(from, t)), Infinity);

