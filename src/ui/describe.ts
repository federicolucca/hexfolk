// Text for the HUD. Pure: no DOM.
import { tileAtHex } from '../core/board';
import type { Terrain } from '../core/map';
import { UNIT_STATS } from '../core/rules';
import type { City, GameState, HexRef, Unit } from '../core/state';
import { PALETTE } from '../render/palette';

const TERRAIN_NAMES: Record<Terrain, string> = {
  grass: 'Grass',
  forest: 'Forest',
  mountain: 'Mountain',
  water: 'Water',
};

export const playerName = (id: number | null): string => (id === null ? 'Neutral' : (PALETTE.players[id]?.name ?? `Player ${id + 1}`));
const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

export function describeUnit(unit: Unit): string {
  const max = UNIT_STATS[unit.type].health;
  return `${playerName(unit.owner)} ${unit.type} · ${unit.hp}/${max} HP`;
}

export function describeCity(city: City): string {
  const kind = city.owner === null ? 'village' : city.capital ? 'capital' : 'city';
  return `${playerName(city.owner)} ${kind}`;
}

/** Title and detail for a selected hex: the unit on it first, then the city, then the terrain. */
export function describeHex(state: GameState, hex: HexRef): { title: string; detail: string } | null {
  const tile = tileAtHex(state, hex);
  if (!tile) return null;
  const unit = state.units.find((u) => u.q === hex.q && u.r === hex.r);
  const city = state.cities.find((c) => c.q === hex.q && c.r === hex.r);
  const terrain = TERRAIN_NAMES[tile.terrain];
  const where = city ? `${describeCity(city)} · ${terrain}` : terrain;
  if (unit) return { title: capitalise(describeUnit(unit)), detail: where };
  return { title: city ? describeCity(city) : terrain, detail: city ? terrain : '' };
}

export function turnLine(state: GameState): string {
  return `Turn ${Math.min(state.turn, state.turnLimit)}/${state.turnLimit}`;
}
