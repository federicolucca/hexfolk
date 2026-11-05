import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/core/map';
import { type Atlas, artTerrain, frameExtents, frameName, parseAtlas } from '../src/render/atlas';

const frame = (h = 144, anchorY = 72) => ({ x: 0, y: 0, w: 128, h, anchor: { x: 64, y: anchorY } });

function sampleAtlas(): Atlas {
  return {
    theme: 'greenlands',
    images: { '1': 'greenlands.png', '2': 'greenlands@2x.png' },
    tile: { width: 128, columnStep: 127, rowStep: 106, faceHeight: 144 },
    frames: {
      grass_1: frame(),
      grass_2: frame(),
      grass_3: frame(),
      forest_1: frame(),
      mountain_1: frame(150, 80),
      water_1: frame(),
      village_1: frame(),
      capital_1: frame(140, 70),
      hill_1: frame(),
    },
    variants: {
      grass: ['grass_1', 'grass_2', 'grass_3'],
      forest: ['forest_1'],
      mountain: ['mountain_1'],
      water: ['water_1'],
      village: ['village_1'],
      capital: ['capital_1'],
      hill: ['hill_1'],
    },
  };
}

describe('parseAtlas', () => {
  it('accepts a complete atlas', () => {
    expect(parseAtlas(sampleAtlas()).theme).toBe('greenlands');
  });

  it('rejects atlases that cannot draw a map', () => {
    expect(() => parseAtlas(null)).toThrow(/not an object/);
    const noVillage = sampleAtlas();
    delete noVillage.variants.village;
    expect(() => parseAtlas(noVillage)).toThrow(/no village tiles/);
    const dangling = sampleAtlas();
    dangling.variants.forest = ['forest_9'];
    expect(() => parseAtlas(dangling)).toThrow(/forest_9 has no frame/);
    const badTile = { ...sampleAtlas(), tile: { width: 128 } };
    expect(() => parseAtlas(badTile)).toThrow(/tile metrics/);
  });
});

describe('frameName', () => {
  const atlas = sampleAtlas();
  const map = generateMap(3846861248, 4);
  const cityAt = (q: number, r: number) => map.cities.find((c) => c.q === q && c.r === r);

  it('maps terrains and cities to their art', () => {
    const grass = { q: 0, r: 0, terrain: 'grass' as const };
    expect(artTerrain(grass, undefined)).toBe('grass');
    expect(artTerrain(grass, { q: 0, r: 0, kind: 'capital', owner: 2 })).toBe('capital');
    expect(artTerrain(grass, { q: 0, r: 0, kind: 'village', owner: null })).toBe('village');
    expect(frameName(atlas, 1, { q: 0, r: 0, terrain: 'mountain' }, undefined)).toBe('mountain_1');
    expect(frameName(atlas, 1, { q: 0, r: 0, terrain: 'water' }, undefined)).toBe('water_1');
  });

  it('finds a frame for every tile of a generated map', () => {
    for (const tile of map.tiles) expect(frameName(atlas, map.seed, tile, cityAt(tile.q, tile.r))).toBeDefined();
  });

  it('picks variants deterministically per tile, and uses all of them', () => {
    const grass = map.tiles.filter((t) => t.terrain === 'grass' && !cityAt(t.q, t.r));
    const names = grass.map((t) => frameName(atlas, map.seed, t, undefined));
    expect(grass.map((t) => frameName(atlas, map.seed, t, undefined))).toEqual(names);
    expect(new Set(names)).toEqual(new Set(['grass_1', 'grass_2', 'grass_3']));
  });

  it('never uses hill or ruins for game terrains', () => {
    for (const tile of map.tiles) expect(frameName(atlas, map.seed, tile, cityAt(tile.q, tile.r))).not.toMatch(/hill|ruins/);
  });
});

describe('frameExtents', () => {
  it('measures the tallest overhang above and below the anchor', () => {
    expect(frameExtents(sampleAtlas())).toEqual({ above: 80, below: 72 });
  });
});
