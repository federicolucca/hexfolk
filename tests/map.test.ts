import { describe, expect, it } from 'vitest';
import { distance, neighbours } from '../src/core/hex';
import {
  type GameMap,
  generateMap,
  isLand,
  MAP_SIZE,
  MIN_CAPITAL_DISTANCE,
  MIN_VILLAGE_DISTANCE,
  RESOURCE_TERRAIN,
  tileAt,
  tileIndex,
} from '../src/core/map';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 1);
const PLAYER_COUNTS = [2, 3, 4];

function forEachMap(check: (map: GameMap) => void): void {
  for (const players of PLAYER_COUNTS) {
    for (const seed of SEEDS) check(generateMap(seed, players));
  }
}

function terrainAt(map: GameMap, hex: { q: number; r: number }): string | undefined {
  return tileAt(map, hex)?.terrain;
}

describe('generateMap', () => {
  it('gives an identical map for the same seed', () => {
    expect(generateMap(12345, 3)).toEqual(generateMap(12345, 3));
  });

  it('gives different maps for different seeds', () => {
    const terrains = (seed: number): string => generateMap(seed, 2).tiles.map((t) => t.terrain).join();
    const distinct = new Set(SEEDS.slice(0, 20).map(terrains));
    expect(distinct.size).toBe(20);
  });

  it('is plain, JSON-serialisable data', () => {
    const map = generateMap(99, 4);
    expect(JSON.parse(JSON.stringify(map))).toEqual(map);
  });

  it('rejects invalid player counts', () => {
    expect(() => generateMap(1, 1)).toThrow(RangeError);
    expect(() => generateMap(1, 5)).toThrow(RangeError);
    expect(() => generateMap(1, 2.5)).toThrow(RangeError);
  });

  it('has 121 tiles in row-major order, one per hex', () => {
    forEachMap((map) => {
      expect(map.width).toBe(MAP_SIZE);
      expect(map.height).toBe(MAP_SIZE);
      expect(map.tiles).toHaveLength(121);
      map.tiles.forEach((tile, i) => expect(tileIndex(map, tile)).toBe(i));
    });
  });

  it('uses only the five terrains and has a reasonable amount of land', () => {
    forEachMap((map) => {
      for (const t of map.tiles) expect(['grass', 'forest', 'hill', 'mountain', 'water']).toContain(t.terrain);
      const land = map.tiles.filter((t) => isLand(t.terrain)).length;
      expect(land).toBeGreaterThanOrEqual(50);
      expect(land).toBeLessThanOrEqual(80);
    });
  });

  it('places one capital per player, in player order', () => {
    forEachMap((map) => {
      const capitals = map.cities.filter((c) => c.kind === 'capital');
      expect(capitals).toHaveLength(map.playerCount);
      expect(capitals.map((c) => c.owner)).toEqual([...Array(map.playerCount).keys()]);
    });
  });

  it('puts capitals on grass, spread apart and reachable over grass and forest', () => {
    forEachMap((map) => {
      const capitals = map.cities.filter((c) => c.kind === 'capital');
      for (const c of capitals) expect(terrainAt(map, c)).toBe('grass');
      for (const a of capitals) {
        for (const b of capitals) {
          if (a !== b) expect(distance(a, b)).toBeGreaterThanOrEqual(MIN_CAPITAL_DISTANCE);
        }
      }
      // Flood fill over walkable land from the first capital.
      const walkable = (h: { q: number; r: number }): boolean => {
        const t = terrainAt(map, h);
        return t === 'grass' || t === 'forest' || t === 'hill';
      };
      const start = capitals[0];
      expect(start).toBeDefined();
      if (!start) return;
      const seen = new Set([`${start.q},${start.r}`]);
      const queue = [start as { q: number; r: number }];
      for (let h = queue.shift(); h; h = queue.shift()) {
        for (const n of neighbours(h)) {
          const key = `${n.q},${n.r}`;
          if (!seen.has(key) && walkable(n)) {
            seen.add(key);
            queue.push(n);
          }
        }
      }
      for (const c of capitals) expect(seen.has(`${c.q},${c.r}`)).toBe(true);
    });
  });

  it('places neutral villages on land, apart from capitals and each other', () => {
    forEachMap((map) => {
      const villages = map.cities.filter((c) => c.kind === 'village');
      expect(villages.length).toBeGreaterThanOrEqual(map.playerCount);
      for (const v of villages) {
        expect(v.owner).toBeNull();
        expect(terrainAt(map, v)).toBe('grass');
        for (const other of map.cities) {
          if (other !== v) expect(distance(v, other)).toBeGreaterThanOrEqual(MIN_VILLAGE_DISTANCE);
        }
      }
    });
  });

  it('keeps all land in one landmass', () => {
    forEachMap((map) => {
      const land = map.tiles.filter((t) => isLand(t.terrain));
      const first = land[0];
      if (!first) throw new Error('no land');
      const seen = new Set([`${first.q},${first.r}`]);
      const queue = [first as { q: number; r: number }];
      for (let h = queue.shift(); h; h = queue.shift()) {
        for (const n of neighbours(h)) {
          const t = tileAt(map, n);
          if (t && isLand(t.terrain) && !seen.has(`${n.q},${n.r}`)) {
            seen.add(`${n.q},${n.r}`);
            queue.push(n);
          }
        }
      }
      expect(seen.size).toBe(land.length);
    });
  });
});

describe('resources', () => {
  it('sit only on their terrain, never on a city, and fish only next to land', () => {
    forEachMap((map) => {
      const cities = new Set(map.cities.map((c) => `${c.q},${c.r}`));
      for (const t of map.tiles) {
        if (t.resource === null) continue;
        expect(RESOURCE_TERRAIN[t.resource]).toContain(t.terrain);
        expect(cities.has(`${t.q},${t.r}`)).toBe(false);
        if (t.resource === 'fish') expect(neighbours(t).some((n) => isLand(tileAt(map, n)?.terrain ?? 'water'))).toBe(true);
      }
    });
  });

  it('give every capital at least two resources next to it (or all it can have)', () => {
    forEachMap((map) => {
      for (const c of map.cities.filter((x) => x.kind === 'capital')) {
        const ring = neighbours(c).map((n) => tileAt(map, n)).filter((t) => t !== undefined);
        const count = ring.filter((t) => t.resource !== null).length;
        expect(count).toBeGreaterThanOrEqual(Math.min(2, ring.length));
      }
    });
  });

  it('are plentiful but not everywhere', () => {
    const map = generateMap(12345, 4);
    const n = map.tiles.filter((t) => t.resource !== null).length;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(50);
  });
});
