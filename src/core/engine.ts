// The headless engine. The browser UI, the AI, the simulator and the MCP server all play through
// these four functions: newGame, observe, legalActions and step. Pure and deterministic.
import { sameHex, unitById } from './board';
import { generateMap } from './map';
import { reachable } from './movement';
import { DEFAULT_TURN_LIMIT, UNIT_STATS } from './rules';
import type { Action, GameEvent, GameState, Rejection, StepResult } from './state';

export interface NewGameOptions {
  seed: number;
  /** 2 to 4. */
  players: number;
  turnLimit?: number;
}

export const STARTING_STARS = 5;

export function newGame({ seed, players, turnLimit = DEFAULT_TURN_LIMIT }: NewGameOptions): GameState {
  if (!Number.isInteger(turnLimit) || turnLimit < 1) throw new RangeError('turnLimit must be a positive integer');
  const map = generateMap(seed, players);
  const state: GameState = {
    version: 1,
    seed: map.seed,
    turnLimit,
    turn: 1,
    current: 0,
    width: map.width,
    height: map.height,
    tiles: map.tiles,
    players: Array.from({ length: players }, (_, id) => ({ id, stars: STARTING_STARS, techs: [], alive: true })),
    cities: map.cities.map((c, id) => ({
      id,
      q: c.q,
      r: c.r,
      owner: c.owner,
      capital: c.kind === 'capital',
      level: 1,
      population: 0,
      walls: false,
    })),
    units: [],
    nextUnitId: 1,
    over: false,
    winner: null,
  };
  // Every player starts with a warrior on their capital.
  for (const city of state.cities) {
    if (city.capital && city.owner !== null) {
      state.units.push({
        id: state.nextUnitId++,
        type: 'warrior',
        owner: city.owner,
        q: city.q,
        r: city.r,
        hp: UNIT_STATS.warrior.health,
        moved: false,
        attacked: false,
        home: city.id,
      });
    }
  }
  return state;
}

/** What a player sees. v0.1 has no fog of war, so this is a copy of the whole state. */
export interface Observation {
  you: number;
  state: GameState;
}

export function observe(state: GameState, player: number): Observation {
  return { you: player, state: structuredClone(state) };
}

/** Why the action is illegal for this player right now, or null when it is legal. */
export function checkAction(state: GameState, player: number, action: Action): string | null {
  if (state.over) return 'the game is over';
  if (player !== state.current) return `it is player ${state.current}'s turn`;
  switch (action.type) {
    case 'end_turn':
      return null;
    case 'move': {
      const unit = unitById(state, action.unit);
      if (!unit || unit.owner !== player) return 'no such unit of yours';
      if (unit.moved || unit.attacked) return 'this unit has already moved';
      if (!reachable(state, unit).some((h) => sameHex(h, action.to))) return 'that hex is out of reach';
      return null;
    }
    default:
      return 'unknown action';
  }
}

/** Every legal action for the player now; empty when it is not their turn. */
export function legalActions(state: GameState, player: number): Action[] {
  if (state.over || player !== state.current) return [];
  const actions: Action[] = [];
  for (const unit of state.units) {
    if (unit.owner !== player) continue;
    for (const to of reachable(state, unit)) actions.push({ type: 'move', unit: unit.id, to });
  }
  actions.push({ type: 'end_turn' });
  return actions;
}

/**
 * Applies the player's actions in order and returns the new state (the input is not changed).
 * Illegal actions are skipped and reported in `rejected`. After an end_turn, the following
 * actions belong to a turn that is no longer the player's, so they are rejected.
 */
export function step(state: GameState, player: number, actions: readonly Action[]): StepResult {
  const next = structuredClone(state);
  const events: GameEvent[] = [];
  const rejected: Rejection[] = [];
  for (const action of actions) {
    const reason = checkAction(next, player, action);
    if (reason) {
      rejected.push({ action, reason });
      continue;
    }
    apply(next, player, action, events);
  }
  return { state: next, events, rejected };
}

function apply(state: GameState, player: number, action: Action, events: GameEvent[]): void {
  switch (action.type) {
    case 'move': {
      const unit = unitById(state, action.unit);
      if (!unit) return;
      const from = { q: unit.q, r: unit.r };
      unit.q = action.to.q;
      unit.r = action.to.r;
      unit.moved = true;
      events.push({ type: 'moved', unit: unit.id, from, to: { ...action.to } });
      return;
    }
    case 'end_turn':
      endTurn(state, player, events);
      return;
  }
}

function endTurn(state: GameState, player: number, events: GameEvent[]): void {
  events.push({ type: 'turn_ended', player });
  // Next living player; the turn number goes up each time the order passes player 0.
  let next = player;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (next === 0) state.turn++;
    if (state.players[next]?.alive) break;
  }
  state.current = next;
  startTurn(state, events);
}

function startTurn(state: GameState, events: GameEvent[]): void {
  for (const unit of state.units) {
    if (unit.owner === state.current) {
      unit.moved = false;
      unit.attacked = false;
    }
  }
  events.push({ type: 'turn_started', player: state.current, turn: state.turn });
}
