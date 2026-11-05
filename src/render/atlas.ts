// The atlas formats written by scripts/build-atlas.ts, and which frame each thing uses. Pure.
import type { Tile } from '../core/map';
import { hashHex } from '../core/rng';
import type { City, Unit } from '../core/state';
import type { TileMetrics } from './layout';

export interface AtlasFrame {
  /** Position and size in the 1x image; the @2x image has everything exactly doubled. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tiles: the centre of the hex face. Units: their feet. Overlays and icons: their centre. */
  anchor: { x: number; y: number };
}

/** A theme atlas: hex tiles. */
export interface Atlas {
  theme: string;
  images: { '1': string; '2': string };
  tile: TileMetrics;
  frames: Record<string, AtlasFrame>;
  /** Frame names per terrain, e.g. grass: [grass_1, grass_2, grass_3]. */
  variants: Record<string, string[]>;
}

/** The common atlas: units, resource overlays, the walls ring and HUD icons. */
export interface CommonAtlas {
  images: { '1': string; '2': string };
  frames: Record<string, AtlasFrame>;
}

/** The art terrains a map needs. Hill and ruins are in the atlas but not in the rules. */
export const REQUIRED_TERRAINS = ['grass', 'forest', 'mountain', 'water', 'village', 'city_2', 'city_3', 'capital'] as const;

/** Sprite colour names, by player id. */
export const PLAYER_COLOURS = ['blue', 'red', 'yellow', 'green'] as const;

/**
 * Which art terrain a tile shows. Capitals are castles; other cities grow from a village (level 1)
 * to city_2 and city_3; anything else shows its terrain.
 */
export function artTerrain(tile: Tile, city: City | undefined): string {
  if (!city) return tile.terrain;
  if (city.capital) return 'capital';
  if (city.level >= 3) return 'city_3';
  return city.level === 2 ? 'city_2' : 'village';
}

/** The frame for a tile. Variants are picked from a hash of the seed and the hex, so they are stable. */
export function frameName(atlas: Atlas, seed: number, tile: Tile, city: City | undefined): string | undefined {
  const names = atlas.variants[artTerrain(tile, city)];
  if (!names || names.length === 0) return undefined;
  return names[hashHex(seed, tile.q, tile.r) % names.length];
}

export function unitFrameName(unit: Unit): string {
  return `units/${unit.type}_${PLAYER_COLOURS[unit.owner] ?? 'blue'}`;
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkFrames(frames: unknown, fail: (what: string) => never): void {
  if (typeof frames !== 'object' || frames === null) fail('missing frames');
  for (const [name, f] of Object.entries(frames as Record<string, Partial<AtlasFrame>>)) {
    if (![f?.x, f?.y, f?.w, f?.h, f?.anchor?.x, f?.anchor?.y].every(isNumber)) fail(`bad frame ${name}`);
  }
}

const failer =
  (kind: string) =>
  (what: string): never => {
    throw new Error(`Invalid ${kind}: ${what}`);
  };

/** Validates a theme atlas JSON file. Throws with a clear message rather than drawing garbage. */
export function parseAtlas(json: unknown): Atlas {
  const fail = failer('tile atlas');
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const a = json as Partial<Atlas>;
  if (typeof a.theme !== 'string') fail('missing theme');
  if (typeof a.images?.['1'] !== 'string' || typeof a.images['2'] !== 'string') fail('missing images');
  const t = a.tile as unknown as Record<string, unknown> | undefined;
  if (!t || !['width', 'columnStep', 'rowStep', 'faceHeight'].every((k) => isNumber(t[k]) && (t[k] as number) > 0)) {
    fail('bad tile metrics');
  }
  checkFrames(a.frames, fail);
  if (typeof a.variants !== 'object' || a.variants === null) return fail('missing variants');
  for (const terrain of REQUIRED_TERRAINS) {
    const names = a.variants[terrain];
    if (!Array.isArray(names) || names.length === 0) fail(`no ${terrain} tiles`);
    for (const n of names ?? []) if (!a.frames?.[n]) fail(`variant ${n} has no frame`);
  }
  return a as Atlas;
}

/** Every common frame the game draws. */
export function requiredCommonFrames(): string[] {
  const names: string[] = [];
  for (const type of ['warrior', 'archer', 'rider', 'defender']) {
    for (const colour of PLAYER_COLOURS) names.push(`units/${type}_${colour}`);
  }
  for (const o of ['fruit', 'game', 'fish', 'ore', 'walls']) names.push(`overlays/${o}`);
  for (const i of ['star', 'hunting', 'fishing', 'riding', 'climbing', 'archery', 'fortification']) names.push(`icons/${i}`);
  return names;
}

export function parseCommonAtlas(json: unknown): CommonAtlas {
  const fail = failer('common atlas');
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const a = json as Partial<CommonAtlas>;
  if (typeof a.images?.['1'] !== 'string' || typeof a.images['2'] !== 'string') fail('missing images');
  checkFrames(a.frames, fail);
  const missing = requiredCommonFrames().filter((n) => !a.frames?.[n]);
  if (missing.length > 0) fail(`missing ${missing.join(', ')}`);
  return a as CommonAtlas;
}

/** How far the tallest frame reaches above its anchor and below it, for the map bounds. */
export function frameExtents(atlas: Atlas): { above: number; below: number } {
  const frames = Object.values(atlas.frames);
  return {
    above: Math.max(...frames.map((f) => f.anchor.y)),
    below: Math.max(...frames.map((f) => f.h - f.anchor.y)),
  };
}
