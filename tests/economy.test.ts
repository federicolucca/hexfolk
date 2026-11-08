import { describe, expect, it } from 'vitest';
import { cityIncome, income, levelFor, populationToNextLevel, territoryCity, unitCapacity } from '../src/core/economy';
import { checkAction, legalActions, newGame, step } from '../src/core/engine';
import { neighbours } from '../src/core/hex';
import { STARTING_STARS } from '../src/core/rules';
import type { City, GameState } from '../src/core/state';
import { addUnit, blankGame, MIDDLE } from './helpers';

/** A blank 2-player board with one city of player 0 in the middle. */
function withCity(fields: Partial<City> = {}): { state: GameState; city: City } {
  const state = blankGame();
  const city: City = { id: 99, q: MIDDLE.q, r: MIDDLE.r, owner: 0, capital: false, level: 1, population: 0, walls: false, harvested: [], ...fields };
  state.cities.push(city);
  const me = state.players[0];
  if (me) me.stars = 20;
  return { state, city };
}

describe('income', () => {
  it('pays base + population, plus 1 for a capital', () => {
    const base = { id: 0, q: 0, r: 0, owner: 0, capital: false, level: 1, population: 0, walls: false, harvested: [] };
    expect(cityIncome(base)).toBe(1);
    expect(cityIncome({ ...base, capital: true })).toBe(2);
    expect(cityIncome({ ...base, population: 3 })).toBe(4);
  });

  it('is paid at the start of each turn, including the first', () => {
    const state = newGame({ seed: 4, players: 2 });
    expect(state.players[0]?.stars).toBe(STARTING_STARS + 2);
    expect(state.players[1]?.stars).toBe(STARTING_STARS);
    const after = step(state, 0, [{ type: 'end_turn' }]);
    expect(after.state.players[1]?.stars).toBe(STARTING_STARS + 2);
    expect(after.events).toContainEqual({ type: 'income', player: 1, stars: 2 });
    expect(income(after.state, 1)).toBe(2);
  });
});

describe('levels', () => {
  it('rise at 2 and 5 total population, up to level 3', () => {
    expect([0, 1, 2, 4, 5, 9].map(levelFor)).toEqual([1, 1, 2, 2, 3, 3]);
    const city = { id: 0, q: 0, r: 0, owner: 0, capital: false, level: 2, population: 3, walls: false, harvested: [] };
    expect(populationToNextLevel(city)).toBe(2);
    expect(populationToNextLevel({ ...city, level: 3 })).toBeNull();
    expect(unitCapacity(city)).toBe(3);
  });
});

describe('harvest', () => {
  it('costs 2 stars, removes the resource and grows the nearest city', () => {
    const { state, city } = withCity({ population: 1 });
    const hex = neighbours(city)[0];
    if (!hex) throw new Error('no hex');
    const tile = state.tiles.find((t) => t.q === hex.q && t.r === hex.r);
    if (!tile) throw new Error('no tile');
    tile.resource = 'grain';
    const { state: after, events } = step(state, 0, [{ type: 'harvest', at: hex }]);
    expect(after.players[0]?.stars).toBe(18);
    expect(after.tiles.find((t) => t.q === hex.q && t.r === hex.r)?.resource).toBeNull();
    expect(after.cities.find((c) => c.id === city.id)).toMatchObject({ population: 2, level: 2 });
    expect(events).toContainEqual({ type: 'city_grew', city: city.id, level: 2 });
  });

  it('needs the right tech, a city in reach and enough stars', () => {
    const { state, city } = withCity();
    const [a, b] = neighbours(city);
    if (!a || !b) throw new Error('no hex');
    const tileA = state.tiles.find((t) => t.q === a.q && t.r === a.r);
    const tileB = state.tiles.find((t) => t.q === b.q && t.r === b.r);
    if (!tileA || !tileB) throw new Error('no tile');
    tileA.terrain = 'hill';
    tileA.resource = 'sheep';
    expect(checkAction(state, 0, { type: 'harvest', at: a })).toMatch(/needs hunting/);
    state.players[0]?.techs.push('hunting');
    expect(checkAction(state, 0, { type: 'harvest', at: a })).toBeNull();
    const far = { q: city.q + 3, r: city.r };
    const farTile = state.tiles.find((t) => t.q === far.q && t.r === far.r);
    if (farTile) farTile.resource = 'grain';
    expect(checkAction(state, 0, { type: 'harvest', at: far })).toMatch(/not next to/);
    tileB.resource = 'grain';
    const me = state.players[0];
    if (me) me.stars = 1;
    expect(checkAction(state, 0, { type: 'harvest', at: b })).toMatch(/needs 2 stars/);
    expect(checkAction(state, 0, { type: 'harvest', at: MIDDLE })).toMatch(/no resource/);
  });

  it('credits the nearer of two cities, then the lower id', () => {
    const { state, city } = withCity();
    const other: City = { ...city, id: 5, q: city.q + 2, r: city.r };
    state.cities.push(other);
    const between = { q: city.q + 1, r: city.r };
    expect(territoryCity(state, 0, between)?.id).toBe(5);
    expect(territoryCity(state, 0, city)?.id).toBe(99);
  });
});

describe('train', () => {
  it('spends stars and puts a unit on the city that cannot act this turn', () => {
    const { state, city } = withCity();
    const { state: after, events } = step(state, 0, [{ type: 'train', city: city.id, unit: 'warrior' }]);
    const unit = after.units.find((u) => u.home === city.id);
    expect(after.players[0]?.stars).toBe(18);
    expect(unit).toMatchObject({ type: 'warrior', owner: 0, q: city.q, r: city.r, moved: true, attacked: true });
    expect(events[0]).toMatchObject({ type: 'trained', city: city.id, unitType: 'warrior' });
  });

  it('needs a free city tile, the tech, the stars and spare capacity', () => {
    const { state, city } = withCity();
    expect(checkAction(state, 0, { type: 'train', city: city.id, unit: 'archer' })).toMatch(/need archery/);
    const me = state.players[0];
    if (me) me.stars = 1;
    expect(checkAction(state, 0, { type: 'train', city: city.id, unit: 'warrior' })).toMatch(/needs 2 stars/);
    if (me) me.stars = 20;
    addUnit(state, 0, 'warrior', city);
    expect(checkAction(state, 0, { type: 'train', city: city.id, unit: 'warrior' })).toMatch(/occupied/);
    state.units = [];
    addUnit(state, 0, 'warrior', { q: city.q + 2, r: city.r }, { home: city.id });
    addUnit(state, 0, 'warrior', { q: city.q + 3, r: city.r }, { home: city.id });
    expect(checkAction(state, 0, { type: 'train', city: city.id, unit: 'warrior' })).toMatch(/no more units/);
    expect(checkAction(state, 0, { type: 'train', city: 12345, unit: 'warrior' })).toMatch(/no such city/);
  });
});

describe('capture', () => {
  it('takes a neutral village with a unit that started its turn there', () => {
    const state = blankGame();
    const village: City = { id: 50, q: MIDDLE.q, r: MIDDLE.r, owner: null, capital: false, level: 1, population: 0, walls: false, harvested: [] };
    state.cities.push(village);
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    const { state: after, events } = step(state, 0, [{ type: 'capture', unit: w.id }]);
    expect(after.cities.find((c) => c.id === 50)?.owner).toBe(0);
    expect(after.units.find((u) => u.id === w.id)).toMatchObject({ moved: true, attacked: true });
    expect(events).toContainEqual({ type: 'captured', unit: w.id, city: 50, from: null });
  });

  it('is not allowed on the turn the unit arrives, nor on your own city', () => {
    const state = blankGame();
    state.cities.push({ id: 50, q: MIDDLE.q, r: MIDDLE.r, owner: null, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    const w = addUnit(state, 0, 'warrior', { q: MIDDLE.q - 1, r: MIDDLE.r });
    const moved = step(state, 0, [{ type: 'move', unit: w.id, to: MIDDLE }]).state;
    expect(checkAction(moved, 0, { type: 'capture', unit: w.id })).toMatch(/start its turn/);
    const mine = structuredClone(moved);
    const c = mine.cities.find((x) => x.id === 50);
    if (c) c.owner = 0;
    expect(checkAction(mine, 0, { type: 'capture', unit: w.id })).toMatch(/already yours/);
    expect(checkAction(state, 0, { type: 'capture', unit: w.id })).toMatch(/no city/);
  });

  it('eliminates a player whose capital is taken, and the last one standing wins', () => {
    const state = newGame({ seed: 21, players: 2 });
    const enemyCapital = state.cities.find((c) => c.capital && c.owner === 1);
    if (!enemyCapital) throw new Error('no capital');
    state.units = state.units.filter((u) => u.owner === 0);
    const w = addUnit(state, 0, 'warrior', enemyCapital);
    const { state: after, events } = step(state, 0, [{ type: 'capture', unit: w.id }]);
    expect(after.players[1]?.alive).toBe(false);
    expect(after.units.every((u) => u.owner === 0)).toBe(true);
    expect(after.cities.find((c) => c.id === enemyCapital.id)).toMatchObject({ owner: 0, capital: false });
    expect(after.over).toBe(true);
    expect(after.winner).toBe(0);
    expect(events).toContainEqual({ type: 'eliminated', player: 1, by: 0 });
    expect(events).toContainEqual({ type: 'game_over', winner: 0, reason: 'domination' });
    expect(legalActions(after, 0)).toEqual([]);
  });

  it('turns the loser\'s other cities neutral and skips them in the turn order', () => {
    const state = newGame({ seed: 22, players: 3 });
    const capital1 = state.cities.find((c) => c.capital && c.owner === 1);
    const village = state.cities.find((c) => c.owner === null);
    if (!capital1 || !village) throw new Error('setup');
    village.owner = 1;
    state.units = state.units.filter((u) => u.owner !== 1 && !(u.q === capital1.q && u.r === capital1.r));
    const w = addUnit(state, 0, 'warrior', capital1);
    const after = step(state, 0, [{ type: 'capture', unit: w.id }, { type: 'end_turn' }]).state;
    expect(after.cities.find((c) => c.id === village.id)?.owner).toBeNull();
    expect(after.over).toBe(false);
    expect(after.current).toBe(2);
  });
});

describe('legal actions', () => {
  it('offers training and harvesting only when they are legal', () => {
    const { state, city } = withCity();
    const hex = neighbours(city)[0];
    const tile = hex && state.tiles.find((t) => t.q === hex.q && t.r === hex.r);
    if (!tile || !hex) throw new Error('setup');
    tile.resource = 'grain';
    const legal = legalActions(state, 0);
    expect(legal).toContainEqual({ type: 'train', city: city.id, unit: 'warrior' });
    expect(legal).not.toContainEqual({ type: 'train', city: city.id, unit: 'archer' });
    expect(legal).toContainEqual({ type: 'harvest', at: { q: hex.q, r: hex.r } });
    for (const a of legal) expect(checkAction(state, 0, a)).toBeNull();
  });
});
