// Board lookups shared by the engine modules. Pure.
import { axialToOffset } from './hex';
import type { Tile } from './map';
import type { City, GameState, HexRef, Unit } from './state';

export function tileIndexIn(board: { width: number; height: number }, hex: HexRef): number | undefined {
  const { col, row } = axialToOffset(hex);
  if (col < 0 || row < 0 || col >= board.width || row >= board.height) return undefined;
  return row * board.width + col;
}

export function tileAtHex(state: GameState, hex: HexRef): Tile | undefined {
  const i = tileIndexIn(state, hex);
  return i === undefined ? undefined : state.tiles[i];
}

export function unitAt(state: GameState, hex: HexRef): Unit | undefined {
  return state.units.find((u) => u.q === hex.q && u.r === hex.r);
}

export function cityAt(state: GameState, hex: HexRef): City | undefined {
  return state.cities.find((c) => c.q === hex.q && c.r === hex.r);
}

export function unitById(state: GameState, id: number): Unit | undefined {
  return state.units.find((u) => u.id === id);
}

export const sameHex = (a: HexRef, b: HexRef): boolean => a.q === b.q && a.r === b.r;
