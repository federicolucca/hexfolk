import { describe, expect, it } from 'vitest';
import { newGame } from '../src/core/engine';
import { neighbours } from '../src/core/hex';
import { panelFor } from '../src/ui/panels';
import { addUnit, blankGame, MIDDLE } from './helpers';

describe('panelFor', () => {
  it('offers the four units in your city, enabled only when legal', () => {
    const state = newGame({ seed: 8, players: 2 });
    const capital = state.cities.find((c) => c.capital && c.owner === 0);
    if (!capital) throw new Error('no capital');
    state.units = [];
    const panel = panelFor(state, 0, capital);
    expect(panel?.title).toMatch(/Blue capital · level 1/);
    expect(panel?.cards.map((c) => c.label)).toEqual(expect.arrayContaining(['Warrior', 'Archer', 'Rider', 'Defender']));
    expect(panel?.cards.find((c) => c.label === 'Warrior')?.action).toEqual({ type: 'train', city: capital.id, unit: 'warrior' });
    const archer = panel?.cards.find((c) => c.label === 'Archer');
    expect(archer?.detail).toBe('archers need archery');
    expect(archer?.action).toBeUndefined();
  });

  it('offers capture to your unit on a city that is not yours', () => {
    const state = blankGame();
    state.cities.push({ id: 7, q: MIDDLE.q, r: MIDDLE.r, owner: null, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    expect(panelFor(state, 0, MIDDLE)?.cards[0]).toMatchObject({ label: 'Capture', action: { type: 'capture', unit: w.id } });
  });

  it('offers harvesting a resource, only a road on an empty tile, and nothing or on the enemy turn', () => {
    const state = blankGame();
    state.cities.push({ id: 7, q: MIDDLE.q, r: MIDDLE.r, owner: 0, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    const hex = neighbours(MIDDLE)[0];
    const tile = hex && state.tiles.find((t) => t.q === hex.q && t.r === hex.r);
    if (!tile || !hex) throw new Error('setup');
    tile.resource = 'grain';
    expect(panelFor(state, 0, hex)?.cards[0]).toMatchObject({ label: 'Harvest grain', action: { type: 'harvest', at: hex } });
    const empty = neighbours(MIDDLE)[1];
    if (empty) expect(panelFor(state, 0, empty)?.cards.map((c) => c.label)).toEqual(['Build road']);
    expect(panelFor(state, 1, hex)).toBeNull();
  });
});
