import { axialToOffset, distance, type Hex, neighbours, offsetToAxial } from './hex';
import { createRng, type Rng, toSeed } from './rng';

export type Terrain = 'grass' | 'forest' | 'mountain' | 'water';
/** Harvestable resources; each lives on one terrain (fruit on grass, game in forest...). */
export type Resource = 'fruit' | 'game' | 'fish' | 'ore';

export const RESOURCE_TERRAIN: Readonly<Record<Resource, Terrain>> = {
  fruit: 'grass',
  game: 'forest',
  fish: 'water',
  ore: 'mountain',
};

export interface Tile {
  q: number;
  r: number;
  terrain: Terrain;
  resource: Resource | null;
}

export type CityKind = 'capital' | 'village';

export interface City {
  q: number;
  r: number;
  kind: CityKind;
  /** Player index (0 .. playerCount - 1), or null for a neutral village. */
  owner: number | null;
}

/** Plain, JSON-serialisable map data. */
export interface GameMap {
  seed: number;
  width: number;
  height: number;
  playerCount: number;
  /** Row-major: the tile at (col, row) is tiles[row * width + col]. */
  tiles: Tile[];
  /** Capitals first, in player order, then neutral villages. */
  cities: City[];
}

export const MAP_SIZE = 11;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Minimum hex distance between any two capitals. */
export const MIN_CAPITAL_DISTANCE = 4;
/** Minimum hex distance between a village and any other city. */
export const MIN_VILLAGE_DISTANCE = 2;

const LAND_SHARE = 0.6;
const MOUNTAIN_CHANCE = 0.12;
const FOREST_CHANCE = 0.28;
const MAX_ATTEMPTS = 100;

export function tileIndex(map: Pick<GameMap, 'width' | 'height'>, hex: Hex): number | undefined {
  const { col, row } = axialToOffset(hex);
  if (col < 0 || row < 0 || col >= map.width || row >= map.height) return undefined;
  return row * map.width + col;
}

export function tileAt(map: GameMap, hex: Hex): Tile | undefined {
  const index = tileIndex(map, hex);
  return index === undefined ? undefined : map.tiles[index];
}

export function isLand(terrain: Terrain): boolean {
  return terrain !== 'water';
}

/**
 * Generates an 11x11 island from a seed. The same seed and player count always give the same map.
 * Capitals sit on grass, at least MIN_CAPITAL_DISTANCE apart, and can reach each other over
 * grass and forest. Neutral villages sit on grass, away from every other city. Resources (fruit,
 * game, fish, ore) are scattered last.
 */
export function generateMap(seed: number, playerCount: number): GameMap {
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new RangeError(`playerCount must be an integer from ${MIN_PLAYERS} to ${MAX_PLAYERS}`);
  }
  const normalisedSeed = toSeed(seed);
  const rng = createRng(normalisedSeed);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const map = tryGenerate(rng, normalisedSeed, playerCount);
    if (map) return map;
  }
  throw new Error(`Could not generate a valid map for seed ${normalisedSeed}`);
}

function tryGenerate(rng: Rng, seed: number, playerCount: number): GameMap | undefined {
  const width = MAP_SIZE;
  const height = MAP_SIZE;
  const tiles: Tile[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      tiles.push({ ...offsetToAxial(col, row), terrain: 'water', resource: null });
    }
  }
  const map: GameMap = { seed, width, height, playerCount, tiles, cities: [] };

  shapeIsland(map, rng);
  scatterTerrain(map, rng);

  const capitals = placeCapitals(map, rng, playerCount);
  if (!capitals) return undefined;
  for (const hex of capitals) setTerrain(map, hex, 'grass');
  if (!connectedOverWalkable(map, capitals)) return undefined;

  map.cities = capitals.map((hex, owner) => ({ q: hex.q, r: hex.r, kind: 'capital', owner }));
  for (const hex of placeVillages(map, rng, playerCount)) {
    setTerrain(map, hex, 'grass');
    map.cities.push({ q: hex.q, r: hex.r, kind: 'village', owner: null });
  }
  placeResources(map, rng);
  return map;
}

/** Chance that a tile of each terrain holds its resource (water only next to land). */
const RESOURCE_CHANCE: Readonly<Record<Terrain, number>> = { grass: 0.18, forest: 0.3, mountain: 0.35, water: 0.3 };
const TERRAIN_RESOURCE: Readonly<Record<Terrain, Resource>> = { grass: 'fruit', forest: 'game', mountain: 'ore', water: 'fish' };
/** Every capital gets at least this many resources on its six neighbours, when the terrain allows. */
const CAPITAL_RESOURCES = 2;

/**
 * Scatters resources over tiles without a city, then tops up each capital's ring so no player
 * starts without anything to harvest. Runs last, so it never changes the terrain or the cities.
 */
function placeResources(map: GameMap, rng: Rng): void {
  const cityHexes = new Set(map.cities.map((c) => `${c.q},${c.r}`));
  const free = (t: Tile): boolean => !cityHexes.has(`${t.q},${t.r}`);
  const coastal = (t: Tile): boolean =>
    neighbours(t).some((n) => {
      const other = tileAt(map, n);
      return other !== undefined && isLand(other.terrain);
    });
  for (const tile of map.tiles) {
    if (!free(tile) || (tile.terrain === 'water' && !coastal(tile))) continue;
    if (rng.next() < RESOURCE_CHANCE[tile.terrain]) tile.resource = TERRAIN_RESOURCE[tile.terrain];
  }
  for (const city of map.cities) {
    if (city.kind !== 'capital') continue;
    const ring = neighbours(city).flatMap((n) => {
      const t = tileAt(map, n);
      return t && free(t) && (t.terrain !== 'water' || coastal(t)) ? [t] : [];
    });
    let have = ring.filter((t) => t.resource !== null).length;
    for (const t of ring) {
      if (have >= CAPITAL_RESOURCES) break;
      if (t.resource === null) {
        t.resource = TERRAIN_RESOURCE[t.terrain];
        have++;
      }
    }
  }
}

/** Land is the top LAND_SHARE of tiles by (closeness to the centre + smoothed noise). */
function shapeIsland(map: GameMap, rng: Rng): void {
  const noise = smooth(
    map,
    map.tiles.map(() => rng.next()),
  );
  const centre = offsetToAxial(Math.floor(map.width / 2), Math.floor(map.height / 2));
  const radius = Math.floor(map.width / 2) + 1;
  const scores = map.tiles.map((tile, i) => {
    const falloff = 1 - distance(tile, centre) / radius;
    return { i, score: falloff + ((noise[i] ?? 0) - 0.5) * 0.9 };
  });
  scores.sort((a, b) => b.score - a.score || a.i - b.i);
  const landCount = Math.round(map.tiles.length * LAND_SHARE);
  for (const { i } of scores.slice(0, landCount)) {
    const tile = map.tiles[i];
    if (tile) tile.terrain = 'grass';
  }
  keepLargestLandmass(map);
}

/** Averages each value with its in-bounds neighbours, so land forms blobs rather than specks. */
function smooth(map: GameMap, values: number[]): number[] {
  return map.tiles.map((tile, i) => {
    let sum = values[i] ?? 0;
    let count = 1;
    for (const n of neighbours(tile)) {
      const j = tileIndex(map, n);
      if (j !== undefined) {
        sum += values[j] ?? 0;
        count++;
      }
    }
    return sum / count;
  });
}

function keepLargestLandmass(map: GameMap): void {
  const components = findComponents(map, (t) => isLand(t.terrain));
  components.sort((a, b) => b.length - a.length);
  for (const small of components.slice(1)) {
    for (const i of small) {
      const tile = map.tiles[i];
      if (tile) tile.terrain = 'water';
    }
  }
}

function scatterTerrain(map: GameMap, rng: Rng): void {
  for (const tile of map.tiles) {
    if (!isLand(tile.terrain)) continue;
    const roll = rng.next();
    tile.terrain = roll < MOUNTAIN_CHANCE ? 'mountain' : roll < MOUNTAIN_CHANCE + FOREST_CHANCE ? 'forest' : 'grass';
  }
}

/**
 * Farthest-point sampling over inland land tiles: a random first capital, then each next one as
 * far as possible from those already placed, then one refinement pass. Fails if any two capitals
 * end up closer than MIN_CAPITAL_DISTANCE.
 */
function placeCapitals(map: GameMap, rng: Rng, playerCount: number): Hex[] | undefined {
  const candidates = map.tiles.filter((t) => isLand(t.terrain) && !touchesMapEdge(map, t));
  if (candidates.length < playerCount) return undefined;
  const farthest = (from: readonly Hex[]): { hex: Hex; distance: number } => {
    let best: Hex[] = [];
    let bestDistance = -1;
    for (const tile of candidates) {
      const d = Math.min(...from.map((c) => distance(c, tile)));
      if (d > bestDistance) {
        bestDistance = d;
        best = [tile];
      } else if (d === bestDistance) {
        best.push(tile);
      }
    }
    return { hex: rng.pick(best), distance: bestDistance };
  };
  const chosen: Hex[] = [rng.pick(candidates)];
  while (chosen.length < playerCount) chosen.push(farthest(chosen).hex);
  // One refinement pass: the random first pick may be central, so move each capital to the spot
  // farthest from the others.
  for (let i = 0; i < chosen.length; i++) {
    chosen[i] = farthest(chosen.filter((_, j) => j !== i)).hex;
  }
  const spread = Math.min(...chosen.flatMap((a, i) => chosen.slice(i + 1).map((b) => distance(a, b))));
  if (spread < MIN_CAPITAL_DISTANCE) return undefined;
  return chosen.map(({ q, r }) => ({ q, r }));
}

function placeVillages(map: GameMap, rng: Rng, playerCount: number): Hex[] {
  const target = 2 + playerCount;
  const villages: Hex[] = [];
  const cities = (): Hex[] => [...map.cities, ...villages];
  const candidates = map.tiles.filter((t) => isLand(t.terrain));
  while (villages.length < target) {
    const free = candidates.filter((t) => cities().every((c) => distance(c, t) >= MIN_VILLAGE_DISTANCE));
    if (free.length === 0) break;
    const { q, r } = rng.pick(free);
    villages.push({ q, r });
  }
  return villages;
}

function touchesMapEdge(map: GameMap, hex: Hex): boolean {
  const { col, row } = axialToOffset(hex);
  return col === 0 || row === 0 || col === map.width - 1 || row === map.height - 1;
}

function setTerrain(map: GameMap, hex: Hex, terrain: Terrain): void {
  const tile = tileAt(map, hex);
  if (tile) tile.terrain = terrain;
}

/** True when every hex can reach every other by walking over grass and forest only. */
function connectedOverWalkable(map: GameMap, hexes: readonly Hex[]): boolean {
  const walkable = (t: Tile): boolean => t.terrain === 'grass' || t.terrain === 'forest';
  const first = hexes[0];
  if (!first) return true;
  const component = findComponents(map, walkable).find((c) => c.includes(tileIndex(map, first) ?? -1));
  return !!component && hexes.every((h) => component.includes(tileIndex(map, h) ?? -1));
}

/** Connected groups of tile indices whose tiles match the predicate. */
function findComponents(map: GameMap, include: (tile: Tile) => boolean): number[][] {
  const seen = new Array<boolean>(map.tiles.length).fill(false);
  const groups: number[][] = [];
  map.tiles.forEach((tile, start) => {
    if (seen[start] || !include(tile)) return;
    const group: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      group.push(i);
      const current = map.tiles[i];
      if (!current) continue;
      for (const n of neighbours(current)) {
        const j = tileIndex(map, n);
        const next = j === undefined ? undefined : map.tiles[j];
        if (j !== undefined && next && !seen[j] && include(next)) {
          seen[j] = true;
          stack.push(j);
        }
      }
    }
    groups.push(group);
  });
  return groups;
}
