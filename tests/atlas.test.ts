import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import type { City } from '../src/core/state';
import { type Atlas, artTerrain, frameExtents, frameName, parseAtlas, parseCommonAtlas, requiredCommonFrames, unitFrameName } from '../src/render/atlas';

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
      city_2_1: frame(),
      city_3_1: frame(),
      hill_1: frame(),
    },
    variants: {
      grass: ['grass_1', 'grass_2', 'grass_3'],
      forest: ['forest_1'],
      mountain: ['mountain_1'],
      water: ['water_1'],
      village: ['village_1'],
      capital: ['capital_1'],
      city_2: ['city_2_1'],
      city_3: ['city_3_1'],
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
  const game = newGame({ seed: 3846861248, players: 4 });
  const map = { seed: game.seed, tiles: game.tiles };
  const cityAt = (q: number, r: number) => game.cities.find((c) => c.q === q && c.r === r);
  const city = (fields: Partial<City>): City => ({ id: 0, q: 0, r: 0, owner: null, capital: false, level: 1, population: 0, walls: false, ...fields });

  it('maps terrains and cities to their art', () => {
    const grass = { q: 0, r: 0, terrain: 'grass' as const };
    expect(artTerrain(grass, undefined)).toBe('grass');
    expect(artTerrain(grass, city({ capital: true, owner: 2 }))).toBe('capital');
    expect(artTerrain(grass, city({}))).toBe('village');
    expect(artTerrain(grass, city({ owner: 1, level: 2 }))).toBe('city_2');
    expect(artTerrain(grass, city({ owner: 1, level: 5 }))).toBe('city_3');
    expect(artTerrain(grass, city({ capital: true, owner: 0, level: 3 }))).toBe('capital');
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

describe('common atlas', () => {
  it('names unit frames by type and player colour', () => {
    const unit = { id: 1, type: 'archer' as const, owner: 2, q: 0, r: 0, hp: 10, moved: false, attacked: false, home: null };
    expect(unitFrameName(unit)).toBe('units/archer_yellow');
  });

  it('validates the frames the game draws', () => {
    const f = frame();
    const frames = Object.fromEntries(requiredCommonFrames().map((n) => [n, f]));
    expect(parseCommonAtlas({ images: { '1': 'common.png', '2': 'common@2x.png' }, frames }).frames).toBe(frames);
    const { ['icons/star']: _, ...missing } = frames;
    expect(() => parseCommonAtlas({ images: { '1': 'a', '2': 'b' }, frames: missing })).toThrow(/icons\/star/);
  });
});

describe('frameExtents', () => {
  it('measures the tallest overhang above and below the anchor', () => {
    expect(frameExtents(sampleAtlas())).toEqual({ above: 80, below: 72 });
  });
});
