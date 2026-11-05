// Static rule tables: unit stats, techs and tunable numbers. Plain data, no logic.

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
