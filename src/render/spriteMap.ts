// Which sprite to draw for a tile, and the manifest format. Pure: no DOM.
import type { City, GameMap, Tile } from '../core/map';
import type { TileMetrics } from './layout';

export interface SpriteInfo {
  name: string;
  file: string;
  width: number;
  height: number;
  /** The pixel that sits on the centre of the hex's top face. */
  anchor: { x: number; y: number };
}

export interface SpriteManifest {
  tile: TileMetrics;
  sprites: SpriteInfo[];
}

/** Sprite colour for each player index. */
export const PLAYER_COLOURS = ['blue', 'red', 'yellow', 'green'] as const;

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function citiesByHex(map: GameMap): Record<string, City> {
  const byHex: Record<string, City> = {};
  for (const city of map.cities) byHex[hexKey(city.q, city.r)] = city;
  return byHex;
}

export function spriteNameFor(tile: Tile, city: City | undefined): string {
  if (!city) return `terrain-${tile.terrain}`;
  const colour = city.owner === null ? undefined : PLAYER_COLOURS[city.owner];
  if (!colour) return 'village-neutral';
  return city.kind === 'capital' ? `capital-${colour}` : `village-${colour}`;
}

/** Every sprite name the map can ask for, to check the manifest has them all. */
export function requiredSpriteNames(): string[] {
  const names = ['grass', 'forest', 'mountain', 'water'].map((t) => `terrain-${t}`);
  for (const c of PLAYER_COLOURS) names.push(`capital-${c}`, `village-${c}`);
  names.push('village-neutral');
  return names;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Validates manifest.json. Throws with a clear message rather than drawing garbage. */
export function parseManifest(json: unknown): SpriteManifest {
  const fail = (what: string): never => {
    throw new Error(`Invalid sprite manifest: ${what}`);
  };
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const { tile, sprites } = json as { tile?: Record<string, unknown>; sprites?: unknown };
  if (!tile || !['width', 'columnStep', 'rowStep', 'faceHeight'].every((k) => isNumber(tile[k]) && (tile[k] as number) > 0)) {
    return fail('bad tile metrics');
  }
  if (!Array.isArray(sprites)) return fail('sprites is not an array');
  for (const s of sprites as Partial<SpriteInfo>[]) {
    if (
      typeof s?.name !== 'string' ||
      typeof s.file !== 'string' ||
      !isNumber(s.width) ||
      !isNumber(s.height) ||
      !isNumber(s.anchor?.x) ||
      !isNumber(s.anchor?.y)
    ) {
      return fail(`bad sprite entry ${JSON.stringify(s)}`);
    }
  }
  const manifest = json as SpriteManifest;
  const names = new Set(manifest.sprites.map((s) => s.name));
  const missing = requiredSpriteNames().filter((n) => !names.has(n));
  if (missing.length > 0) fail(`missing sprites ${missing.join(', ')}`);
  return manifest;
}
