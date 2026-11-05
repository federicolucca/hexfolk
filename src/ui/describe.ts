// Text for the selected-tile panel. Pure: no DOM.
import type { City, Tile } from '../core/map';
import { PALETTE } from '../render/palette';

const TERRAIN_NAMES: Record<Tile['terrain'], string> = {
  grass: 'Grass',
  forest: 'Forest',
  mountain: 'Mountain',
  water: 'Water',
};

export function describeTile(tile: Tile, city: City | undefined): string {
  const terrain = TERRAIN_NAMES[tile.terrain];
  if (!city) return terrain;
  const owner = city.owner === null ? 'Neutral' : (PALETTE.players[city.owner]?.name ?? 'Neutral');
  return `${terrain} · ${owner} ${city.kind}`;
}
