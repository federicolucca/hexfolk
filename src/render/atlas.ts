// The tile atlas format written by scripts/build-atlas.ts, and which frame each tile uses. Pure.
import type { City, Tile } from '../core/map';
import { hashHex } from '../core/rng';
import type { TileMetrics } from './layout';

export interface AtlasFrame {
  /** Position and size in the 1x image; the @2x image has everything exactly doubled. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The centre of the hex face, in frame pixels. */
  anchor: { x: number; y: number };
}

export interface Atlas {
  theme: string;
  images: { '1': string; '2': string };
  tile: TileMetrics;
  frames: Record<string, AtlasFrame>;
  /** Frame names per terrain, e.g. grass: [grass_1, grass_2, grass_3]. */
  variants: Record<string, string[]>;
}

/** The art terrains a map needs. Hill and ruins are in the atlas but not in the rules yet. */
export const REQUIRED_TERRAINS = ['grass', 'forest', 'mountain', 'water', 'village', 'capital'] as const;

/** Which art terrain a tile shows: its city if it has one, else its terrain. */
export function artTerrain(tile: Tile, city: City | undefined): string {
  return city ? city.kind : tile.terrain;
}

/** The frame for a tile. Variants are picked from a hash of the seed and the hex, so they are stable. */
export function frameName(atlas: Atlas, seed: number, tile: Tile, city: City | undefined): string | undefined {
  const names = atlas.variants[artTerrain(tile, city)];
  if (!names || names.length === 0) return undefined;
  return names[hashHex(seed, tile.q, tile.r) % names.length];
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates an atlas JSON file. Throws with a clear message rather than drawing garbage. */
export function parseAtlas(json: unknown): Atlas {
  const fail = (what: string): never => {
    throw new Error(`Invalid tile atlas: ${what}`);
  };
  if (typeof json !== 'object' || json === null) return fail('not an object');
  const a = json as Partial<Atlas>;
  if (typeof a.theme !== 'string') fail('missing theme');
  if (typeof a.images?.['1'] !== 'string' || typeof a.images['2'] !== 'string') fail('missing images');
  const t = a.tile as unknown as Record<string, unknown> | undefined;
  if (!t || !['width', 'columnStep', 'rowStep', 'faceHeight'].every((k) => isNumber(t[k]) && (t[k] as number) > 0)) {
    fail('bad tile metrics');
  }
  if (typeof a.frames !== 'object' || a.frames === null) return fail('missing frames');
  for (const [name, f] of Object.entries(a.frames)) {
    if (![f?.x, f?.y, f?.w, f?.h, f?.anchor?.x, f?.anchor?.y].every(isNumber)) fail(`bad frame ${name}`);
  }
  if (typeof a.variants !== 'object' || a.variants === null) return fail('missing variants');
  for (const terrain of REQUIRED_TERRAINS) {
    const names = a.variants[terrain];
    if (!Array.isArray(names) || names.length === 0) fail(`no ${terrain} tiles`);
    for (const n of names ?? []) if (!a.frames[n]) fail(`variant ${n} has no frame`);
  }
  return a as Atlas;
}

/** How far the tallest frame reaches above its anchor and below it, for the map bounds. */
export function frameExtents(atlas: Atlas): { above: number; below: number } {
  const frames = Object.values(atlas.frames);
  return {
    above: Math.max(...frames.map((f) => f.anchor.y)),
    below: Math.max(...frames.map((f) => f.h - f.anchor.y)),
  };
}
