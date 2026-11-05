import { describe, expect, it } from 'vitest';
import manifestFile from '../public/sprites/manifest.json';
import { generateMap } from '../src/core/map';
import { citiesByHex, hexKey, parseManifest, requiredSpriteNames, spriteNameFor } from '../src/render/spriteMap';

const manifestJson: unknown = manifestFile;

describe('spriteNameFor', () => {
  it('uses the terrain sprite for tiles without a city', () => {
    expect(spriteNameFor({ q: 0, r: 0, terrain: 'forest' }, undefined)).toBe('terrain-forest');
    expect(spriteNameFor({ q: 0, r: 0, terrain: 'water' }, undefined)).toBe('terrain-water');
  });

  it('uses player colours for capitals and owned villages, neutral otherwise', () => {
    const tile = { q: 0, r: 0, terrain: 'grass' as const };
    expect(spriteNameFor(tile, { q: 0, r: 0, kind: 'capital', owner: 0 })).toBe('capital-blue');
    expect(spriteNameFor(tile, { q: 0, r: 0, kind: 'capital', owner: 3 })).toBe('capital-green');
    expect(spriteNameFor(tile, { q: 0, r: 0, kind: 'village', owner: 1 })).toBe('village-red');
    expect(spriteNameFor(tile, { q: 0, r: 0, kind: 'village', owner: null })).toBe('village-neutral');
  });

  it('finds a sprite in the committed manifest for every tile of generated maps', () => {
    const names = new Set(parseManifest(manifestJson).sprites.map((s) => s.name));
    for (const players of [2, 3, 4]) {
      const map = generateMap(players * 101, players);
      const cities = citiesByHex(map);
      for (const tile of map.tiles) expect(names).toContain(spriteNameFor(tile, cities[hexKey(tile.q, tile.r)]));
      expect(Object.keys(cities)).toHaveLength(map.cities.length);
    }
  });
});

describe('parseManifest', () => {
  it('accepts the committed manifest, which has every required sprite', () => {
    const manifest = parseManifest(manifestJson);
    expect(manifest.tile.width).toBe(256);
    expect(manifest.sprites.map((s) => s.name)).toEqual(expect.arrayContaining(requiredSpriteNames()));
  });

  it('rejects malformed manifests', () => {
    expect(() => parseManifest(null)).toThrow(/not an object/);
    expect(() => parseManifest({ tile: { width: 256 }, sprites: [] })).toThrow(/tile metrics/);
    const tile = { width: 256, columnStep: 256, rowStep: 142, faceHeight: 190 };
    expect(() => parseManifest({ tile, sprites: [{ name: 'x' }] })).toThrow(/bad sprite entry/);
    expect(() => parseManifest({ tile, sprites: [] })).toThrow(/missing sprites/);
  });
});
