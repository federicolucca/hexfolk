// Loads the pre-rendered sprites listed in public/sprites/manifest.json.
import type { TileMetrics } from './layout';
import { parseManifest, type SpriteInfo } from './spriteMap';

export interface LoadedSprite extends SpriteInfo {
  image: HTMLImageElement;
}

export interface SpriteSheet {
  tile: TileMetrics;
  byName: Map<string, LoadedSprite>;
  /** How far the tallest sprite reaches above its anchor, in world px. */
  above: number;
  /** How far the deepest sprite reaches below its anchor, in world px. */
  below: number;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return image;
}

/** baseUrl is the folder holding manifest.json, ending with a slash. */
export async function loadSprites(baseUrl: string): Promise<SpriteSheet> {
  const response = await fetch(`${baseUrl}manifest.json`);
  if (!response.ok) throw new Error(`Could not load the sprite manifest (HTTP ${response.status})`);
  const manifest = parseManifest(await response.json());
  const loaded = await Promise.all(
    manifest.sprites.map(async (s): Promise<LoadedSprite> => ({ ...s, image: await loadImage(`${baseUrl}${s.file}`) })),
  );
  return {
    tile: manifest.tile,
    byName: new Map(loaded.map((s) => [s.name, s])),
    above: Math.max(...loaded.map((s) => s.anchor.y)),
    below: Math.max(...loaded.map((s) => s.height - s.anchor.y)),
  };
}
