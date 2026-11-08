// The headless engine. The browser UI, the AI, the simulator and the MCP server all play through
// these four functions: newGame, observe, legalActions and step. Pure and deterministic.
import { cityAt, sameHex, tileAtHex, unitAt, unitById } from './board';
import { income, levelFor, tokenPayouts, score, supportedUnits, territoryCity, unitCapacity } from './economy';
import { previewAttack } from './combat';
import { distance, neighbours } from './hex';
import { generateMap } from './map';
import { rollTwoDice } from './rng';
import { reachable } from './movement';
import { DEFAULT_TURN_LIMIT, HARVEST_COST, RESOURCE_TECH, ROAD_COST, STARTING_STARS, TECH_COST, TECH_IDS, UNIT_STATS, UNIT_TYPES, WALLS_COST } from './rules';
import type { Action, GameEvent, GameState, Player, Rejection, StepResult } from './state';

export interface NewGameOptions {
  seed: number;
  /** 2 to 4. */
  players: number;
  turnLimit?: number;
}

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
      harvested: [],
    })),
    units: [],
    nextUnitId: 1,
    rollState: map.seed ^ 0x5f3759df,
    roll: null,
    over: false,
    winner: null,
  };
  // Every player starts with a warrior on their capital.
  for (const city of state.cities) {
    if (city.capital && city.owner !== null) addUnit(state, 'warrior', city.owner, city, city.id, false);
  }
  rollRound(state, []);
  startTurn(state, []);
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

const hasTech = (player: Player | undefined, tech: string | null): boolean =>
  tech === null || (player?.techs as string[] | undefined)?.includes(tech) === true;

/** Why the action is illegal for this player right now, or null when it is legal. */
export function checkAction(state: GameState, player: number, action: Action): string | null {
  if (state.over) return 'the game is over';
  if (player !== state.current) return `it is player ${state.current}'s turn`;
  const me = state.players[player];
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
    case 'capture': {
      const unit = unitById(state, action.unit);
      if (!unit || unit.owner !== player) return 'no such unit of yours';
      const city = cityAt(state, unit);
      if (!city) return 'there is no city here';
      if (city.owner === player) return 'this city is already yours';
      if (unit.moved || unit.attacked) return 'a unit must start its turn on a city to capture it';
      return null;
    }
    case 'train': {
      const city = state.cities.find((c) => c.id === action.city);
      if (!city || city.owner !== player) return 'no such city of yours';
      const stats = UNIT_STATS[action.unit];
      if (!stats) return 'unknown unit type';
      if (!hasTech(me, stats.tech)) return `${action.unit}s need ${stats.tech}`;
      if (state.units.some((u) => sameHex(u, city))) return 'the city tile is occupied';
      if (supportedUnits(state, city) >= unitCapacity(city)) return 'the city supports no more units';
      if ((me?.stars ?? 0) < stats.cost) return `needs ${stats.cost} stars`;
      return null;
    }
    case 'harvest': {
      const tile = tileAtHex(state, action.at);
      if (!tile?.resource) return 'no resource there';
      if (!territoryCity(state, player, action.at)) return 'not next to one of your cities';
      const tech = RESOURCE_TECH[tile.resource];
      if (!hasTech(me, tech)) return `harvesting ${tile.resource} needs ${tech}`;
      if ((me?.stars ?? 0) < HARVEST_COST) return `needs ${HARVEST_COST} stars`;
      return null;
    }
    case 'build_road': {
      const tile = tileAtHex(state, action.at);
      if (!tile || tile.terrain === 'water') return 'roads go on land tiles';
      if (tile.road) return 'there is already a road here';
      if (cityAt(state, action.at)) return 'cities already count as road';
      if (!territoryCity(state, player, action.at)) return 'not next to one of your cities';
      if ((me?.stars ?? 0) < ROAD_COST) return `needs ${ROAD_COST} stars`;
      return null;
    }
    case 'attack': {
      const unit = unitById(state, action.unit);
      if (!unit || unit.owner !== player) return 'no such unit of yours';
      if (unit.attacked) return 'this unit has already attacked';
      const target = unitAt(state, action.target);
      if (!target || target.owner === player) return 'no enemy unit there';
      const d = distance(unit, target);
      if (d < 1 || d > UNIT_STATS[unit.type].range) return 'out of range';
      return null;
    }
    case 'research':
      if (!TECH_IDS.includes(action.tech)) return 'unknown tech';
      if (me?.techs.includes(action.tech)) return 'already researched';
      if ((me?.stars ?? 0) < TECH_COST) return `needs ${TECH_COST} stars`;
      return null;
    case 'build_walls': {
      const city = state.cities.find((c) => c.id === action.city);
      if (!city || city.owner !== player) return 'no such city of yours';
      if (!hasTech(me, 'fortification')) return 'walls need fortification';
      if (city.walls) return 'this city already has walls';
      if ((me?.stars ?? 0) < WALLS_COST) return `needs ${WALLS_COST} stars`;
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
  const legal = (a: Action): void => {
    if (checkAction(state, player, a) === null) actions.push(a);
  };
  for (const unit of state.units) {
    if (unit.owner !== player) continue;
    for (const to of reachable(state, unit)) actions.push({ type: 'move', unit: unit.id, to });
    legal({ type: 'capture', unit: unit.id });
    for (const enemy of state.units) if (enemy.owner !== player) legal({ type: 'attack', unit: unit.id, target: { q: enemy.q, r: enemy.r } });
  }
  for (const tech of TECH_IDS) legal({ type: 'research', tech });
  const harvestable = new Set<string>();
  for (const city of state.cities) {
    if (city.owner !== player) continue;
    legal({ type: 'build_walls', city: city.id });
    for (const hex of neighbours(city)) {
      const key = `r${hex.q},${hex.r}`;
      if (harvestable.has(key)) continue;
      harvestable.add(key);
      legal({ type: 'build_road', at: { q: hex.q, r: hex.r } });
    }
    for (const unit of UNIT_TYPES) legal({ type: 'train', city: city.id, unit });
    for (const hex of [city, ...neighbours(city)]) {
      const key = `${hex.q},${hex.r}`;
      if (harvestable.has(key)) continue;
      harvestable.add(key);
      legal({ type: 'harvest', at: { q: hex.q, r: hex.r } });
    }
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

function addUnit(state: GameState, type: (typeof UNIT_TYPES)[number], owner: number, at: { q: number; r: number }, home: number | null, ready: boolean) {
  const unit = {
    id: state.nextUnitId++,
    type,
    owner,
    q: at.q,
    r: at.r,
    hp: UNIT_STATS[type].health,
    moved: !ready,
    attacked: !ready,
    home,
  };
  state.units.push(unit);
  return unit;
}

function apply(state: GameState, player: number, action: Action, events: GameEvent[]): void {
  const me = state.players[player];
  switch (action.type) {
    case 'move': {
      const unit = unitById(state, action.unit);
      if (!unit) return;
      const from = { q: unit.q, r: unit.r };
      unit.q = action.to.q;
      unit.r = action.to.r;
      unit.moved = true;
      events.push({ type: 'moved', unit: unit.id, from, to: { q: action.to.q, r: action.to.r } });
      return;
    }
    case 'capture': {
      const unit = unitById(state, action.unit);
      const city = unit && cityAt(state, unit);
      if (!unit || !city) return;
      const from = city.owner;
      const wasCapital = city.capital;
      city.owner = player;
      city.capital = false;
      unit.moved = true;
      unit.attacked = true;
      for (const u of state.units) if (u.home === city.id && u.owner !== player) u.home = null;
      events.push({ type: 'captured', unit: unit.id, city: city.id, from });
      if (wasCapital && from !== null) eliminate(state, from, player, events);
      return;
    }
    case 'train': {
      const city = state.cities.find((c) => c.id === action.city);
      if (!city || !me) return;
      me.stars -= UNIT_STATS[action.unit].cost;
      const unit = addUnit(state, action.unit, player, city, city.id, false);
      events.push({ type: 'trained', unit: unit.id, city: city.id, unitType: action.unit });
      return;
    }
    case 'harvest': {
      const tile = tileAtHex(state, action.at);
      const city = territoryCity(state, player, action.at);
      if (!tile?.resource || !city || !me) return;
      me.stars -= HARVEST_COST;
      events.push({ type: 'harvested', at: { q: action.at.q, r: action.at.r }, resource: tile.resource, city: city.id });
      tile.harvested = tile.resource;
      if (!city.harvested.includes(tile.resource)) city.harvested.push(tile.resource);
      tile.resource = null;
      city.population++;
      const level = levelFor(city.population);
      if (level > city.level) {
        city.level = level;
        events.push({ type: 'city_grew', city: city.id, level });
      }
      return;
    }
    case 'build_road': {
      const tile = tileAtHex(state, action.at);
      const city = territoryCity(state, player, action.at);
      if (!tile || !city || !me) return;
      me.stars -= ROAD_COST;
      tile.road = true;
      events.push({ type: 'road_built', at: { q: action.at.q, r: action.at.r }, city: city.id });
      return;
    }
    case 'attack': {
      const unit = unitById(state, action.unit);
      const target = unitAt(state, action.target);
      if (!unit || !target) return;
      const result = previewAttack(state, unit, target);
      target.hp -= result.damage;
      unit.hp -= result.counter;
      unit.moved = true;
      unit.attacked = true;
      events.push({ type: 'attacked', unit: unit.id, target: target.id, damage: result.damage, counter: result.counter, killed: result.kills, attackerKilled: result.attackerDies });
      state.units = state.units.filter((u) => u.hp > 0);
      return;
    }
    case 'research':
      if (!me) return;
      me.stars -= TECH_COST;
      me.techs.push(action.tech);
      events.push({ type: 'researched', player, tech: action.tech });
      return;
    case 'build_walls': {
      const city = state.cities.find((c) => c.id === action.city);
      if (!city || !me) return;
      me.stars -= WALLS_COST;
      city.walls = true;
      events.push({ type: 'walls_built', city: city.id });
      return;
    }
    case 'end_turn':
      endTurn(state, player, events);
      return;
  }
}

/** Losing your capital knocks you out: your units go, your other cities turn neutral. */
function eliminate(state: GameState, loser: number, by: number, events: GameEvent[]): void {
  const player = state.players[loser];
  if (!player || !player.alive) return;
  player.alive = false;
  state.units = state.units.filter((u) => u.owner !== loser);
  for (const city of state.cities) {
    if (city.owner === loser) {
      city.owner = null;
      city.capital = false;
    }
  }
  for (const u of state.units) {
    const home = u.home === null ? undefined : state.cities.find((c) => c.id === u.home);
    if (home && home.owner !== u.owner) u.home = null;
  }
  events.push({ type: 'eliminated', player: loser, by });
  const alive = state.players.filter((p) => p.alive);
  if (alive.length === 1) {
    state.over = true;
    state.winner = alive[0]?.id ?? null;
    events.push({ type: 'game_over', winner: state.winner, reason: 'domination' });
  }
}

function endTurn(state: GameState, player: number, events: GameEvent[]): void {
  events.push({ type: 'turn_ended', player });
  // Next living player; the turn number goes up each time the order passes player 0.
  let next = player;
  let newRound = false;
  for (let i = 0; i < state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (next === 0) {
      state.turn++;
      newRound = true;
    }
    if (state.players[next]?.alive) break;
  }
  state.current = next;
  if (state.turn > state.turnLimit) {
    // The last round is over: the highest score wins, a tie is a draw.
    const ranked = state.players.map((p) => ({ id: p.id, score: score(state, p.id) })).sort((a, b) => b.score - a.score);
    state.over = true;
    state.winner = ranked[0] && ranked[0].score !== ranked[1]?.score ? ranked[0].id : null;
    events.push({ type: 'game_over', winner: state.winner, reason: 'turn_limit' });
    return;
  }
  if (newRound) rollRound(state, events);
  startTurn(state, events);
}

/** Start of a player's turn: their units are refreshed and their cities pay out. */
function startTurn(state: GameState, events: GameEvent[]): void {
  const player = state.players[state.current];
  for (const unit of state.units) {
    if (unit.owner === state.current) {
      unit.moved = false;
      unit.attacked = false;
    }
  }
  events.push({ type: 'turn_started', player: state.current, turn: state.turn });
  if (player) {
    const stars = income(state, player.id);
    player.stars += stars;
    events.push({ type: 'income', player: player.id, stars });
  }
}

/** The round's 2d6 roll from the seeded generator; harvested tiles with that token pay their owners. */
function rollRound(state: GameState, events: GameEvent[]): void {
  const { state: rollState, roll } = rollTwoDice(state.rollState);
  state.rollState = rollState;
  state.roll = roll;
  const payouts = tokenPayouts(state, roll);
  for (const p of payouts) {
    const player = state.players[p.player];
    if (player) player.stars += p.stars;
  }
  events.push({ type: 'rolled', roll, payouts });
}
