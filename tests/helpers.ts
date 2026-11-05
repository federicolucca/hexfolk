// Builders for hand-made positions in engine tests.
import { tileIndexIn } from '../src/core/board';
import { newGame } from '../src/core/engine';
import type { Terrain } from '../src/core/map';
import { UNIT_STATS, type UnitType } from '../src/core/rules';
import type { GameState, HexRef, Unit } from '../src/core/state';

/** A 2-player game on an all-grass board with no units, so each test places what it needs. */
export function blankGame(players = 2): GameState {
  const state = newGame({ seed: 1, players });
  for (const t of state.tiles) {
    t.terrain = 'grass';
    t.resource = null;
  }
  state.units = [];
  return state;
}

export function setTerrain(state: GameState, hex: HexRef, terrain: Terrain): void {
  const tile = state.tiles[tileIndexIn(state, hex) ?? -1];
  if (!tile) throw new Error(`no tile at ${hex.q},${hex.r}`);
  tile.terrain = terrain;
}

export function addUnit(state: GameState, owner: number, type: UnitType, hex: HexRef, fields: Partial<Unit> = {}): Unit {
  const unit: Unit = {
    id: state.nextUnitId++,
    type,
    owner,
    q: hex.q,
    r: hex.r,
    hp: UNIT_STATS[type].health,
    moved: false,
    attacked: false,
    home: null,
    ...fields,
  };
  state.units.push(unit);
  return unit;
}

export const keys = (hexes: HexRef[]): string[] => hexes.map((h) => `${h.q},${h.r}`).sort();

/** A hex in the middle of the 11x11 board (offset col 5, row 5). */
export const MIDDLE: HexRef = { q: 3, r: 5 };
