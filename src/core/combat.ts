// Deterministic combat. Pure: no randomness, so the preview is exactly what will happen.
import { distance } from './hex';
import { cityAt } from './board';
import { DAMAGE_FACTOR, UNIT_STATS, WALLS_DEFENCE_BONUS } from './rules';
import type { GameState, Unit } from './state';

export interface AttackPreview {
  /** Health the defender loses. */
  damage: number;
  /** Health the attacker loses in the counter-attack (0 when there is none). */
  counter: number;
  kills: boolean;
  attackerDies: boolean;
}

/** The defence multiplier: walls on the defender's own city. */
export function defenceBonus(state: GameState, defender: Unit): number {
  const city = cityAt(state, defender);
  return city?.owner === defender.owner && city.walls ? WALLS_DEFENCE_BONUS : 1;
}

/**
 * Attack and defence are scaled by health. The damage split follows the ratio of the two forces
 * (Polytopia's formula). A defender that survives hits back, if the attacker is within its range.
 */
export function previewAttack(state: GameState, attacker: Unit, defender: Unit): AttackPreview {
  const a = UNIT_STATS[attacker.type];
  const d = UNIT_STATS[defender.type];
  const attackForce = (a.attack * attacker.hp) / a.health;
  const defenceForce = (d.defence * defender.hp * defenceBonus(state, defender)) / d.health;
  const total = attackForce + defenceForce;
  const damage = Math.min(defender.hp, Math.round((attackForce / total) * a.attack * DAMAGE_FACTOR));
  const kills = damage >= defender.hp;
  const inRange = distance(attacker, defender) <= d.range;
  const counter = kills || !inRange ? 0 : Math.min(attacker.hp, Math.round((defenceForce / total) * d.defence * DAMAGE_FACTOR));
  return { damage, counter, kills, attackerDies: counter >= attacker.hp };
}
