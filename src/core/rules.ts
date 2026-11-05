// Static rule tables: unit stats, techs and tunable numbers. Plain data, no logic.
import type { Resource } from './map';

export type UnitType = 'warrior' | 'archer' | 'rider' | 'defender';
export type TechId = 'hunting' | 'fishing' | 'riding' | 'climbing' | 'archery' | 'fortification';

export interface UnitStats {
  attack: number;
  defence: number;
  /** Movement points per turn. Grass costs 1; entering a forest or mountain ends the move. */
  movement: number;
  /** Attack range in hexes (1 = adjacent). */
  range: number;
  health: number;
  /** Stars to train one. */
  cost: number;
  /** Tech needed to train it, or null if every player has it from the start. */
  tech: TechId | null;
}

export const UNIT_TYPES: readonly UnitType[] = ['warrior', 'archer', 'rider', 'defender'];

export const UNIT_STATS: Readonly<Record<UnitType, UnitStats>> = {
  warrior: { attack: 2, defence: 2, movement: 1, range: 1, health: 10, cost: 2, tech: null },
  archer: { attack: 2, defence: 1, movement: 1, range: 2, health: 10, cost: 3, tech: 'archery' },
  rider: { attack: 2, defence: 1, movement: 2, range: 1, health: 10, cost: 3, tech: 'riding' },
  defender: { attack: 1, defence: 3, movement: 1, range: 1, health: 15, cost: 3, tech: 'fortification' },
};

/** Players: 2 to 4. Player 0 is the human in the browser; the others are agents. */
export const DEFAULT_TURN_LIMIT = 30;

/** Stars before the first turn's income (a capital earns 2, so everyone starts their turn on 5). */
export const STARTING_STARS = 3;

/** Stars per turn: every city earns its base plus its population; a capital earns 1 more. */
export const CITY_BASE_INCOME = 1;
export const CAPITAL_BONUS_INCOME = 1;

/** Harvesting a resource next to one of your cities costs this and adds 1 population. */
export const HARVEST_COST = 2;
export const RESOURCE_TECH: Readonly<Record<Resource, TechId | null>> = {
  fruit: null,
  game: 'hunting',
  fish: 'fishing',
  ore: 'climbing',
};

/** Total population needed for each city level (index 0 = level 1). */
export const LEVEL_POPULATION: readonly number[] = [0, 2, 5];
export const MAX_LEVEL = LEVEL_POPULATION.length;
/** A city supports up to level + this many units (its "home" units). */
export const UNITS_PER_LEVEL_BONUS = 1;

export const TECH_IDS: readonly TechId[] = ['hunting', 'fishing', 'riding', 'climbing', 'archery', 'fortification'];
/** Stars to research any one tech. */
export const TECH_COST = 4;
/** Stars to build walls on a city (needs fortification). */
export const WALLS_COST = 3;
/** A unit defending on its own walled city defends this many times better. */
export const WALLS_DEFENCE_BONUS = 2;
/** Damage scale: a full-health warrior hitting an equal one deals 5 of 10 health. */
export const DAMAGE_FACTOR = 4.5;
