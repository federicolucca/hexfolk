// What the HUD panel offers for the selected hex: built from the engine's legal actions and
// checkAction reasons, so the UI never decides what is allowed. Pure: no DOM.
import { cityAt, tileAtHex } from '../core/board';
import { cityIncome, populationToNextLevel, supportedUnits, unitCapacity } from '../core/economy';
import { checkAction } from '../core/engine';
import { HARVEST_COST, UNIT_STATS, UNIT_TYPES } from '../core/rules';
import type { Action, GameState, HexRef } from '../core/state';
import { PLAYER_COLOURS } from '../render/atlas';
import { describeCity } from './describe';

export interface PanelCard {
  icon?: string;
  label: string;
  detail: string;
  /** The action to take, or undefined when it is not legal now (detail then says why). */
  action?: Action;
}

export interface Panel {
  title: string;
  cards: PanelCard[];
}

const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

function card(state: GameState, player: number, action: Action, icon: string, label: string, detail: string): PanelCard {
  const reason = checkAction(state, player, action);
  return reason === null ? { icon, label, detail, action } : { icon, label, detail: reason };
}

/** The panel for a hex the human selected, or null when there is nothing to do there. */
export function panelFor(state: GameState, player: number, hex: HexRef): Panel | null {
  if (state.over || state.current !== player) return null;
  const cards: PanelCard[] = [];
  const titleParts: string[] = [];
  const city = cityAt(state, hex);
  const unit = state.units.find((u) => u.q === hex.q && u.r === hex.r);
  const tile = tileAtHex(state, hex);

  if (unit && unit.owner === player && city && city.owner !== player) {
    cards.push(card(state, player, { type: 'capture', unit: unit.id }, `units/${unit.type}_${PLAYER_COLOURS[player]}`, `Capture`, city.owner === null ? 'Village' : 'Enemy city'));
  }

  if (city && city.owner === player) {
    const next = populationToNextLevel(city);
    titleParts.push(
      `${describeCity(city)} · level ${city.level}`,
      next === null ? `pop ${city.population}` : `pop ${city.population} (+${next} to grow)`,
      `+${cityIncome(city)}★/turn`,
      `units ${supportedUnits(state, city)}/${unitCapacity(city)}`,
    );
    for (const type of UNIT_TYPES) {
      const stats = UNIT_STATS[type];
      cards.push(card(state, player, { type: 'train', city: city.id, unit: type }, `units/${type}_${PLAYER_COLOURS[player]}`, capitalise(type), `${stats.cost}★`));
    }
  }

  if (tile?.resource) {
    cards.push(card(state, player, { type: 'harvest', at: { q: hex.q, r: hex.r } }, `overlays/${tile.resource}`, `Harvest ${tile.resource}`, `${HARVEST_COST}★ · +1 pop`));
  }

  if (cards.length === 0) return null;
  return { title: titleParts.join(' · ') || 'Actions', cards };
}
