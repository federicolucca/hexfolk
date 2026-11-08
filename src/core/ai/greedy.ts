// A greedy opponent: each step it takes the best-looking legal action by a fixed priority, applies
// it to a private copy of the state, and repeats until nothing is left. It only uses the Agent
// interface, so a minimax or external agent can replace it without engine changes.
import type { Agent } from '../agent';
import { cityAt, tileAtHex, unitById } from '../board';
import { previewAttack } from '../combat';
import { legalActions, type Observation, step } from '../engine';
import { territoryCity } from '../economy';
import { distance, neighbours } from '../hex';
import { rollWays } from '../rng';
import { VARIETY_KINDS } from '../rules';
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
const PURCHASES: ReadonlySet<Action['type']> = new Set(['train', 'research', 'harvest', 'build_walls', 'build_road']);

export const isDifficulty = (v: unknown): v is Difficulty => v === 'easy' || v === 'normal';

export class GreedyAgent implements Agent {
  readonly name: string;
  readonly difficulty: Difficulty;

  constructor(difficulty: Difficulty = 'normal') {
    this.difficulty = difficulty;
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
    bestHarvest(state, options) ??
    connectingRoad(state, me, options) ??
    options.find((a) => a.type === 'build_walls' && threatened(state, me, cityOf(state, a.city))) ??
    bestTrain(options) ??
    bestMove(state, me, options)
  );
}

/**
 * The harvest worth most: a new resource kind for its city (a big bonus when it reaches the variety
 * threshold) and a token that is rolled often (6 and 8 beat 2 and 12).
 */
function bestHarvest(state: GameState, options: Action[]): Action | null {
  let best: Action | null = null;
  let bestScore = -Infinity;
  for (const a of options) {
    if (a.type !== 'harvest') continue;
    const tile = tileAtHex(state, a.at);
    const owner = tile?.resource ? state.cities.find((c) => c.owner !== null && distance(c, a.at) <= 1) : undefined;
    if (!tile?.resource) continue;
    const kinds = new Set(owner?.harvested ?? []);
    const isNew = !kinds.has(tile.resource);
    const score = (isNew ? 2 : 0) + (isNew && kinds.size + 1 === VARIETY_KINDS ? 3 : 0) + rollWays(tile.token ?? 0) / 6;
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}

/**
 * A road that brings an unconnected city closer to the capital: breadth-first from the capital over
 * land tiles that already carry a road, hold a city of mine, or lie in my territory (where a road
 * can be built). The first buildable gap on the path to a city is the road to build.
 */
function connectingRoad(state: GameState, me: number, options: Action[]): Action | null {
  const capital = state.cities.find((c) => c.owner === me && c.capital);
  if (!capital) return null;
  const buildable = new Set(options.flatMap((a) => (a.type === 'build_road' ? [`${a.at.q},${a.at.r}`] : [])));
  if (buildable.size === 0) return null;
  const key = (h: HexRef): string => `${h.q},${h.r}`;
  const parent = new Map<string, HexRef | null>([[key(capital), null]]);
  const queue: HexRef[] = [capital];
  while (queue.length > 0) {
    const hex = queue.shift() as HexRef;
    for (const n of neighbours(hex)) {
      const tile = tileAtHex(state, n);
      if (!tile || tile.terrain === 'water' || parent.has(key(n))) continue;
      const city = cityAt(state, n);
      const passable = city ? city.owner === me : tile.road || territoryCity(state, me, n) !== undefined;
      if (!passable) continue;
      parent.set(key(n), hex);
      queue.push(n);
    }
  }
  let best: HexRef | null = null;
  let bestLength = Infinity;
  for (const city of state.cities) {
    if (city.owner !== me || city.capital || !parent.has(key(city))) continue;
    const gaps: HexRef[] = [];
    for (let at: HexRef | null | undefined = parent.get(key(city)); at; at = parent.get(key(at))) {
      const t = tileAtHex(state, at);
      if (t && !t.road && !cityAt(state, at)) gaps.push(at);
    }
    const first = gaps.find((g) => buildable.has(key(g)));
    if (first && gaps.length > 0 && gaps.length < bestLength) {
      best = first;
      bestLength = gaps.length;
    }
  }
  return best ? { type: 'build_road', at: { q: best.q, r: best.r } } : null;
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

