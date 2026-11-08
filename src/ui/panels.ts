// What the HUD panel offers for the selected hex: built from the engine's legal actions and
// checkAction reasons, so the UI never decides what is allowed. Pure: no DOM.
import { cityAt, tileAtHex } from '../core/board';
import { cityIncome, connectedCities, populationToNextLevel, supportedUnits, unitCapacity } from '../core/economy';
import { checkAction } from '../core/engine';
import { previewAttack } from '../core/combat';
import { HARVEST_COST, ROAD_COST, TECH_COST, TECH_IDS, UNIT_STATS, UNIT_TYPES, WALLS_COST, WALLS_DEFENCE_BONUS } from '../core/rules';
import type { Action, GameState, HexRef } from '../core/state';
import { PLAYER_COLOURS } from '../render/atlas';
import { describeCity } from './describe';

export interface PanelCard {
  icon?: string;
  label: string;
  detail: string;
  /** The action to take, or undefined when it is not legal now (detail then says why). */
  action?: Action;
  /** Already researched. */
  owned?: boolean;
}

export interface Panel {
  title: string;
  cards: PanelCard[];
}

const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

function card(state: GameState, player: number, action: Action, icon: string | undefined, label: string, detail: string): PanelCard {
  const reason = checkAction(state, player, action);
  const base = icon === undefined ? { label } : { icon, label };
  return reason === null ? { ...base, detail, action } : { ...base, detail: reason };
}

/** The panel for a hex the human selected, or null when there is nothing to do there. */
/** `attacker` is the human's selected unit: when the hex holds an enemy it can hit, the panel previews the attack. */
export function panelFor(state: GameState, player: number, hex: HexRef, attacker: number | null = null): Panel | null {
  if (state.over || state.current !== player) return null;
  const cards: PanelCard[] = [];
  const titleParts: string[] = [];
  const city = cityAt(state, hex);
  const unit = state.units.find((u) => u.q === hex.q && u.r === hex.r);
  const tile = tileAtHex(state, hex);

  const hitter = attacker === null ? undefined : state.units.find((u) => u.id === attacker);
  if (hitter && unit && unit.owner !== player) {
    const p = previewAttack(state, hitter, unit);
    const detail = `deals ${p.damage}${p.kills ? ' · kills it' : ''}${p.counter > 0 ? ` · takes ${p.counter}${p.attackerDies ? ' · you die' : ''}` : ''}`;
    cards.push(card(state, player, { type: 'attack', unit: hitter.id, target: { q: hex.q, r: hex.r } }, `units/${hitter.type}_${PLAYER_COLOURS[player]}`, 'Attack', detail));
    titleParts.push(`Attack ${unit.type} (${unit.hp} HP)`);
  }

  if (unit && unit.owner === player && city && city.owner !== player) {
    cards.push(card(state, player, { type: 'capture', unit: unit.id }, `units/${unit.type}_${PLAYER_COLOURS[player]}`, `Capture`, city.owner === null ? 'Village' : 'Enemy city'));
  }

  if (city && city.owner === player) {
    const next = populationToNextLevel(city);
    titleParts.push(
      `${describeCity(city)} · level ${city.level}`,
      next === null ? `pop ${city.population}` : `pop ${city.population} (+${next} to grow)`,
      `+${cityIncome(city, connectedCities(state, player).has(city.id))}★/turn`,
      `units ${supportedUnits(state, city)}/${unitCapacity(city)}`,
    );
    cards.push(card(state, player, { type: 'build_walls', city: city.id }, 'overlays/walls', city.walls ? 'Walls built' : 'Build walls', `${WALLS_COST}★ · defence ×${WALLS_DEFENCE_BONUS}`));
    for (const type of UNIT_TYPES) {
      const stats = UNIT_STATS[type];
      cards.push(card(state, player, { type: 'train', city: city.id, unit: type }, `units/${type}_${PLAYER_COLOURS[player]}`, capitalise(type), `${stats.cost}★`));
    }
  }

  if (tile?.resource) {
    cards.push(card(state, player, { type: 'harvest', at: { q: hex.q, r: hex.r } }, tile.resource === 'fish' ? 'overlays/fish' : undefined, `Harvest ${tile.resource}`, `${HARVEST_COST}★ · +1 pop${tile.token === null ? '' : ` · token ${tile.token}`}`));
  }
  if (tile && !city && tile.terrain !== 'water' && !tile.road) {
    cards.push(card(state, player, { type: 'build_road', at: { q: hex.q, r: hex.r } }, undefined, 'Build road', `${ROAD_COST}★ · half-cost moves, trade routes`));
  }

  if (cards.length === 0) return null;
  return { title: titleParts.join(' · ') || 'Actions', cards };
}

/** The tech panel: one card per tech with its icon, the first thing a player opens each game. */
export function techPanel(state: GameState, player: number): Panel {
  const owned = state.players[player]?.techs ?? [];
  const cards = TECH_IDS.map((tech): PanelCard => {
    const c = card(state, player, { type: 'research', tech }, `icons/${tech}`, capitalise(tech), `${TECH_COST}★ · ${TECH_EFFECT[tech]}`);
    return owned.includes(tech) ? { icon: c.icon ?? '', label: c.label, detail: `Researched · ${TECH_EFFECT[tech]}`, owned: true } : c;
  });
  return { title: 'Techs', cards };
}

const TECH_EFFECT = {
  hunting: 'harvest sheep',
  fishing: 'harvest fish',
  riding: 'train riders',
  climbing: 'enter mountains, harvest stone',
  archery: 'train archers',
  fortification: 'defenders, walls',
} as const;
