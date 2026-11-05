// Where a unit can move this turn. Pure.
import { neighbours } from './hex';
import { tileIndexIn } from './board';
import { UNIT_STATS } from './rules';
import type { GameState, HexRef, Unit } from './state';

/** Grass costs 1 movement point; forest and mountain end the move; water is impassable. */
export function canEnter(state: GameState, unit: Unit, hex: HexRef): boolean {
  const tile = state.tiles[tileIndexIn(state, hex) ?? -1];
  if (!tile || tile.terrain === 'water') return false;
  if (tile.terrain === 'mountain' && !state.players[unit.owner]?.techs.includes('climbing')) return false;
  return !state.units.some((u) => u.q === hex.q && u.r === hex.r);
}

/**
 * Every hex the unit can reach this turn (not counting where it stands), by Dijkstra over
 * movement points. A unit that has moved or attacked cannot move again.
 */
export function reachable(state: GameState, unit: Unit): HexRef[] {
  if (unit.moved || unit.attacked) return [];
  const budget = UNIT_STATS[unit.type].movement;
  const best = new Map<string, number>([[`${unit.q},${unit.r}`, budget]]);
  const result: HexRef[] = [];
  const frontier: { hex: HexRef; left: number }[] = [{ hex: { q: unit.q, r: unit.r }, left: budget }];
  while (frontier.length > 0) {
    frontier.sort((a, b) => b.left - a.left);
    const { hex, left } = frontier.shift() as { hex: HexRef; left: number };
    for (const n of neighbours(hex)) {
      if (!canEnter(state, unit, n)) continue;
      const terrain = state.tiles[tileIndexIn(state, n) ?? -1]?.terrain;
      const remaining = terrain === 'grass' ? left - 1 : 0;
      const key = `${n.q},${n.r}`;
      const seen = best.get(key);
      if (seen !== undefined && seen >= remaining) continue;
      if (seen === undefined) result.push(n);
      best.set(key, remaining);
      if (remaining > 0) frontier.push({ hex: n, left: remaining });
    }
  }
  return result;
}
