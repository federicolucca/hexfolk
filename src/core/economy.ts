// Stars, city growth and unit support. Pure.
import { distance } from './hex';
import {
  CAPITAL_BONUS_INCOME,
  CITY_BASE_INCOME,
  LEVEL_POPULATION,
  MAX_LEVEL,
  UNITS_PER_LEVEL_BONUS,
} from './rules';
import type { City, GameState, HexRef } from './state';

export function cityIncome(city: City): number {
  return CITY_BASE_INCOME + (city.capital ? CAPITAL_BONUS_INCOME : 0) + city.population;
}

/** Stars the player earns at the start of each of their turns. */
export function income(state: GameState, player: number): number {
  return state.cities.filter((c) => c.owner === player).reduce((sum, c) => sum + cityIncome(c), 0);
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
