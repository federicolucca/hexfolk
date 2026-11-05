// The game state, actions and events. Everything is plain JSON: save it with JSON.stringify.
import type { Resource, Tile } from './map';
import type { TechId, UnitType } from './rules';

export interface Player {
  id: number;
  stars: number;
  techs: TechId[];
  /** False once the player has been eliminated. */
  alive: boolean;
}

export interface City {
  id: number;
  q: number;
  r: number;
  /** Player id, or null for a neutral village. */
  owner: number | null;
  /** The starting city of its owner; losing it eliminates the owner. */
  capital: boolean;
  level: number;
  population: number;
  walls: boolean;
}

export interface Unit {
  id: number;
  type: UnitType;
  owner: number;
  q: number;
  r: number;
  hp: number;
  /** Moved this turn (it may still attack). */
  moved: boolean;
  /** Attacked or captured this turn (it is done). */
  attacked: boolean;
  /** The city that supports it (for the city's unit limit), or null. */
  home: number | null;
}

export interface GameState {
  version: 1;
  seed: number;
  turnLimit: number;
  /** 1-based; goes up when the turn order wraps back to the first player. */
  turn: number;
  /** The player whose turn it is. */
  current: number;
  width: number;
  height: number;
  /** Row-major: tiles[row * width + col]. */
  tiles: Tile[];
  players: Player[];
  cities: City[];
  units: Unit[];
  nextUnitId: number;
  over: boolean;
  /** The winner once the game is over; null for a draw or while playing. */
  winner: number | null;
}

export interface HexRef {
  q: number;
  r: number;
}

export type Action =
  | { type: 'move'; unit: number; to: HexRef }
  | { type: 'capture'; unit: number }
  | { type: 'train'; city: number; unit: UnitType }
  | { type: 'harvest'; at: HexRef }
  | { type: 'end_turn' };

export type GameEvent =
  | { type: 'moved'; unit: number; from: HexRef; to: HexRef }
  | { type: 'captured'; unit: number; city: number; from: number | null }
  | { type: 'trained'; unit: number; city: number; unitType: UnitType }
  | { type: 'harvested'; at: HexRef; resource: Resource; city: number }
  | { type: 'city_grew'; city: number; level: number }
  | { type: 'income'; player: number; stars: number }
  | { type: 'eliminated'; player: number; by: number }
  | { type: 'game_over'; winner: number | null; reason: 'domination' | 'turn_limit' }
  | { type: 'turn_ended'; player: number }
  | { type: 'turn_started'; player: number; turn: number };

export interface Rejection {
  action: Action;
  reason: string;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  /** Actions that were not legal when their turn came; they were skipped. */
  rejected: Rejection[];
}
