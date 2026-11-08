// Stars, city growth and unit support. Pure.
import { cityAt, tileAtHex } from './board';
import { distance, neighbours } from './hex';
import { rollWays } from './rng';
import {
  CAPITAL_BONUS_INCOME,
  CITY_BASE_INCOME,
  LEVEL_POPULATION,
  MAX_LEVEL,
  TOKEN_PAYOUT,
  TRADE_ROUTE_BONUS,
  VARIETY_BONUS,
  VARIETY_KINDS,
  UNITS_PER_LEVEL_BONUS,
} from './rules';
import type { City, GameState, HexRef } from './state';

/** Whether the city has harvested enough different resource kinds for the variety bonus. */
export function hasVariety(city: City): boolean {
  return new Set(city.harvested).size >= VARIETY_KINDS;
}

/** True when the tile carries a road or a city; both link roads together and halve movement. */
export function isRoadTile(state: GameState, hex: HexRef): boolean {
  return tileAtHex(state, hex)?.road === true || cityAt(state, hex) !== undefined;
}

/**
 * The owner of a tile for token payouts and trade routes: the nearest owned city within 1 hex
 * (nearest first, then lower id), or null when no player's city reaches it.
 */
export function tileOwner(state: GameState, hex: HexRef): number | null {
  let best: City | undefined;
  for (const city of state.cities) {
    if (city.owner === null) continue;
    const d = distance(city, hex);
    if (d > 1) continue;
    if (!best || d < distance(best, hex) || (d === distance(best, hex) && city.id < best.id)) best = city;
  }
  return best?.owner ?? null;
}

/** Ids of the player's cities joined to their capital by an unbroken chain of road and city tiles (the capital excluded). */
export function connectedCities(state: GameState, player: number): Set<number> {
  const capital = state.cities.find((c) => c.owner === player && c.capital);
  const linked = new Set<number>();
  if (!capital) return linked;
  const seen = new Set<string>([`${capital.q},${capital.r}`]);
  const queue: HexRef[] = [capital];
  while (queue.length > 0) {
    const hex = queue.shift() as HexRef;
    for (const n of neighbours(hex)) {
      const key = `${n.q},${n.r}`;
      if (seen.has(key)) continue;
      const city = cityAt(state, n);
      const ok = city ? city.owner === player : tileAtHex(state, n)?.road === true && [null, player].includes(tileOwner(state, n));
      if (!ok) continue;
      seen.add(key);
      queue.push(n);
      if (city) linked.add(city.id);
    }
  }
  return linked;
}

export function cityIncome(city: City, connected = false): number {
  return (
    CITY_BASE_INCOME +
    (city.capital ? CAPITAL_BONUS_INCOME : 0) +
    city.population +
    (hasVariety(city) ? VARIETY_BONUS : 0) +
    (connected ? TRADE_ROUTE_BONUS : 0)
  );
}

/** Stars the player earns at the start of each of their turns (token payouts come on top, by dice). */
export function income(state: GameState, player: number): number {
  const linked = connectedCities(state, player);
  return state.cities.filter((c) => c.owner === player).reduce((sum, c) => sum + cityIncome(c, linked.has(c.id)), 0);
}

/** Expected stars per round from token payouts: each harvested tile pays with probability ways/36. */
export function expectedTokenIncome(state: GameState, player: number): number {
  let total = 0;
  for (const t of state.tiles) if (t.harvested && t.token !== null && tileOwner(state, t) === player) total += (rollWays(t.token) / 36) * TOKEN_PAYOUT;
  return total;
}

/** Stars each player gets when a round's dice show `roll`: one per harvested tile whose token matches. */
export function tokenPayouts(state: GameState, roll: number): { player: number; stars: number }[] {
  const stars = new Map<number, number>();
  for (const t of state.tiles) {
    if (!t.harvested || t.token !== roll) continue;
    const owner = tileOwner(state, t);
    if (owner !== null && state.players[owner]?.alive) stars.set(owner, (stars.get(owner) ?? 0) + TOKEN_PAYOUT);
  }
  return [...stars].sort((a, b) => a[0] - b[0]).map(([player, n]) => ({ player, stars: n }));
}
/** The level a city reaches with this much population (1 to MAX_LEVEL). */
export function levelFor(population: number): number {
  let level = 1;
  for (let l = 1; l <= MAX_LEVEL; l++) if (population >= (LEVEL_POPULATION[l - 1] ?? Infinity)) level = l;
  return level;
}

/** Population still needed for the next level, or null at the top level. */
export function populationToNextLevel(city: City): number | null {
  const next = LEVEL_POPULATION[city.level];
  return next === undefined ? null : next - city.population;
}

/** How many units a city can support. */
export function unitCapacity(city: City): number {
  return city.level + UNITS_PER_LEVEL_BONUS;
}

export function supportedUnits(state: GameState, city: City): number {
  return state.units.filter((u) => u.home === city.id).length;
}

/**
 * The player's city that a hex belongs to: one of theirs within 1 hex (the city itself or a
 * neighbour). When two are in reach, the nearest wins, then the lower id.
 */
export function territoryCity(state: GameState, player: number, hex: HexRef): City | undefined {
  let best: City | undefined;
  for (const city of state.cities) {
    if (city.owner !== player) continue;
    const d = distance(city, hex);
    if (d > 1) continue;
    if (!best || d < distance(best, hex) || (d === distance(best, hex) && city.id < best.id)) best = city;
  }
  return best;
}

/** Final score: 5 per city, 1 per population, 2 per tech and 1 per unit. Eliminated players score 0. */
export function score(state: GameState, player: number): number {
  const p = state.players[player];
  if (!p?.alive) return 0;
  const cities = state.cities.filter((c) => c.owner === player);
  return cities.length * 5 + cities.reduce((n, c) => n + c.population, 0) + p.techs.length * 2 + state.units.filter((u) => u.owner === player).length;
}
