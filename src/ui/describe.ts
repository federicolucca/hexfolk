// Text for the selected-tile panel. Pure: no DOM.
import type { City, Tile } from '../core/map';
import { PLAYER_COLOURS } from '../render/spriteMap';

const TERRAIN_NAMES: Record<Tile['terrain'], string> = {
  grass: 'Grass',
  forest: 'Forest',
  mountain: 'Mountain',
  water: 'Water',
};

export function describeTile(tile: Tile, city: City | undefined): string {
  const terrain = TERRAIN_NAMES[tile.terrain];
  if (!city) return terrain;
  const colour = city.owner === null ? undefined : PLAYER_COLOURS[city.owner];
  const owner = colour ? `${colour[0]?.toUpperCase()}${colour.slice(1)}` : 'Neutral';
  return `${terrain} · ${owner} ${city.kind}`;
}
