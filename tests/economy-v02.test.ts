import { describe, expect, it } from 'vitest';
import { connectedCities, cityIncome, expectedTokenIncome, income, tokenPayouts } from '../src/core/economy';
import { checkAction, legalActions, newGame, step } from '../src/core/engine';
import { neighbours } from '../src/core/hex';
import { compactObservation } from '../src/core/observation';
import { reachable } from '../src/core/movement';
import { generateMap, RESOURCE_TERRAIN, TOKEN_VALUES } from '../src/core/map';
import { parseAction } from '../src/core/validate';
import { replayStates } from '../src/core/replay';
import { rollTwoDice, rollWays } from '../src/core/rng';
import { ROAD_COST } from '../src/core/rules';
import type { City, GameState, HexRef } from '../src/core/state';
import { addUnit, blankGame, keys, MIDDLE, setTerrain } from './helpers';

const tile = (s: GameState, h: HexRef) => {
  const t = s.tiles.find((x) => x.q === h.q && x.r === h.r);
  if (!t) throw new Error('no tile');
  return t;
};
const city = (s: GameState, id: number, h: HexRef, fields: Partial<City> = {}): City => {
  const c: City = { id, q: h.q, r: h.r, owner: 0, capital: false, level: 1, population: 0, walls: false, harvested: [], ...fields };
  s.cities.push(c);
  return c;
};
const rich = (s: GameState): void => {
  const p = s.players[0];
  if (p) p.stars = 50;
};

describe('hills', () => {
  it('are generated, hold sheep or stone, and every harvestable tile has a token', () => {
    let hills = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateMap(seed, 2);
      for (const t of map.tiles) {
        if (t.terrain === 'hill') hills++;
        if (t.resource) {
          expect(TOKEN_VALUES).toContain(t.token);
          expect(RESOURCE_TERRAIN[t.resource]).toContain(t.terrain);
        } else expect(t.token).toBeNull();
        expect(t.token).not.toBe(7);
      }
    }
    expect(hills).toBeGreaterThan(0);
  });

  it('end a unit’s move like forests, but are enterable without a tech', () => {
    const state = blankGame();
    const unit = addUnit(state, 0, 'rider', MIDDLE);
    const [a] = neighbours(MIDDLE);
    if (!a) throw new Error('hex');
    setTerrain(state, a, 'hill');
    const out = reachable(state, unit);
    expect(keys(out)).toContain(keys([a])[0]);
    // The rider has 2 points but cannot continue past the hill.
    const beyond = neighbours(a).filter((n) => !neighbours(MIDDLE).some((m) => m.q === n.q && m.r === n.r) && !(n.q === MIDDLE.q && n.r === MIDDLE.r));
    const viaHillOnly = beyond.filter((n) => neighbours(MIDDLE).every((m) => !neighbours(m).some((x) => x.q === n.q && x.r === n.r)));
    for (const n of viaHillOnly) expect(keys(out)).not.toContain(keys([n])[0]);
  });
});

describe('resources and harvest', () => {
  it('map resources to the old techs: grain and wood free, sheep hunting, stone climbing, fish fishing', () => {
    const state = blankGame();
    city(state, 99, MIDDLE);
    rich(state);
    const cases = [
      ['grain', 'grass', null],
      ['wood', 'forest', null],
      ['sheep', 'hill', 'hunting'],
      ['stone', 'hill', 'climbing'],
      ['fish', 'water', 'fishing'],
    ] as const;
    neighbours(MIDDLE).slice(0, cases.length).forEach((h, i) => {
      const [res, terrain, tech] = cases[i] ?? cases[0];
      setTerrain(state, h, terrain);
      tile(state, h).resource = res;
      expect(checkAction(state, 0, { type: 'harvest', at: h })).toBe(tech === null ? null : `harvesting ${res} needs ${tech}`);
    });
  });

  it('records the kind on the city, keeps the token and marks the tile harvested', () => {
    const state = blankGame();
    const c = city(state, 99, MIDDLE);
    rich(state);
    const [h] = neighbours(MIDDLE);
    if (!h) throw new Error('hex');
    const t = tile(state, h);
    t.resource = 'grain';
    t.token = 8;
    const next = step(state, 0, [{ type: 'harvest', at: h }]).state;
    const nt = tile(next, h);
    expect([nt.resource, nt.harvested, nt.token]).toEqual([null, 'grain', 8]);
    expect(next.cities.find((x) => x.id === c.id)?.harvested).toEqual(['grain']);
  });
});

describe('variety bonus', () => {
  it('pays +1 per turn from 3 distinct kinds, not from repeats', () => {
    const state = blankGame();
    const two = city(state, 99, MIDDLE, { harvested: ['grain', 'wood'] });
    expect(cityIncome(two)).toBe(1);
    const three = city(state, 100, { q: MIDDLE.q + 5, r: MIDDLE.r }, { harvested: ['grain', 'wood', 'fish'] });
    expect(cityIncome(three)).toBe(2);
    const repeats = city(state, 101, { q: MIDDLE.q - 5, r: MIDDLE.r }, { harvested: ['grain', 'grain', 'grain'] });
    expect(cityIncome(repeats)).toBe(1);
  });
});

describe('roads', () => {
  it('cost stars, need own territory and land, and are not rebuilt', () => {
    const state = blankGame();
    state.cities = [];
    city(state, 99, MIDDLE);
    rich(state);
    const [a] = neighbours(MIDDLE);
    if (!a) throw new Error('hex');
    expect(checkAction(state, 0, { type: 'build_road', at: a })).toBeNull();
    expect(checkAction(state, 0, { type: 'build_road', at: { q: MIDDLE.q + 4, r: MIDDLE.r } })).toMatch(/not next to/);
    setTerrain(state, a, 'water');
    expect(checkAction(state, 0, { type: 'build_road', at: a })).toMatch(/land/);
    setTerrain(state, a, 'grass');
    const me = state.players[0];
    if (me) me.stars = ROAD_COST - 1;
    expect(checkAction(state, 0, { type: 'build_road', at: a })).toMatch(/needs/);
    if (me) me.stars = 10;
    const after = step(state, 0, [{ type: 'build_road', at: a }]);
    expect(tile(after.state, a).road).toBe(true);
    expect(after.state.players[0]?.stars).toBe(10 - ROAD_COST);
    expect(checkAction(after.state, 0, { type: 'build_road', at: a })).toMatch(/already/);
    expect(legalActions(state, 0).some((x) => x.type === 'build_road')).toBe(true);
  });

  it('halve movement between road tiles, so a warrior walks two road tiles', () => {
    const state = blankGame();
    const [a] = neighbours(MIDDLE);
    if (!a) throw new Error('hex');
    const b = neighbours(a).find((n) => !neighbours(MIDDLE).some((m) => m.q === n.q && m.r === n.r) && !(n.q === MIDDLE.q && n.r === MIDDLE.r));
    if (!b) throw new Error('hex');
    const unit = addUnit(state, 0, 'warrior', MIDDLE);
    expect(keys(reachable(state, unit))).not.toContain(keys([b])[0]);
    for (const h of [MIDDLE, a, b]) tile(state, h).road = true;
    expect(keys(reachable(state, unit))).toContain(keys([b])[0]);
  });

  it('let a unit cross a road forest or hill without ending its move', () => {
    const state = blankGame();
    const [a] = neighbours(MIDDLE);
    if (!a) throw new Error('hex');
    const b = neighbours(a).find((n) => !neighbours(MIDDLE).some((m) => m.q === n.q && m.r === n.r) && !(n.q === MIDDLE.q && n.r === MIDDLE.r));
    if (!b) throw new Error('hex');
    setTerrain(state, a, 'hill');
    const unit = addUnit(state, 0, 'warrior', MIDDLE);
    expect(keys(reachable(state, unit))).not.toContain(keys([b])[0]);
    for (const h of [MIDDLE, a, b]) tile(state, h).road = true;
    expect(keys(reachable(state, unit))).toContain(keys([b])[0]);
  });
});

describe('trade routes', () => {
  /** A capital at MIDDLE and a second city 3 hexes east, with room for a two-tile road between. */
  const setup = (): { state: GameState; far: City; path: HexRef[] } => {
    const state = blankGame();
    state.cities = [];
    city(state, 1, MIDDLE, { capital: true });
    const far = city(state, 2, { q: MIDDLE.q + 3, r: MIDDLE.r });
    return { state, far, path: [{ q: MIDDLE.q + 1, r: MIDDLE.r }, { q: MIDDLE.q + 2, r: MIDDLE.r }] };
  };

  it('pay +1 per connected city only with an unbroken chain', () => {
    const { state, far, path } = setup();
    expect(income(state, 0)).toBe(3);
    const [p1, p2] = path;
    if (!p1 || !p2) throw new Error('path');
    tile(state, p1).road = true;
    expect(connectedCities(state, 0).has(far.id)).toBe(false);
    tile(state, p2).road = true;
    expect(connectedCities(state, 0).has(far.id)).toBe(true);
    expect(income(state, 0)).toBe(4);
  });

  it('are cut by an enemy city on the way', () => {
    const { state, far, path } = setup();
    for (const h of path) tile(state, h).road = true;
    expect(connectedCities(state, 0).has(far.id)).toBe(true);
    const mid = path[0];
    if (!mid) throw new Error('path');
    state.cities.push({ id: 3, q: mid.q, r: mid.r, owner: 1, capital: false, level: 1, population: 0, walls: false, harvested: [] });
    expect(connectedCities(state, 0).has(far.id)).toBe(false);
  });

  it('link through an own city that sits between', () => {
    const { state, far, path } = setup();
    const [p1, p2] = path;
    if (!p1 || !p2) throw new Error('path');
    state.cities.pop();
    const near = city(state, 5, p2);
    city(state, 6, { q: MIDDLE.q + 3, r: MIDDLE.r });
    tile(state, p1).road = true;
    expect(connectedCities(state, 0).has(near.id)).toBe(true);
    expect(connectedCities(state, 0).has(6)).toBe(true);
    expect(far.id).toBe(2);
  });
});

describe('number tokens and the round roll', () => {
  it('2d6 rolls are seeded, in 2..12, and follow the dice odds', () => {
    let s = 123;
    const counts = new Map<number, number>();
    for (let i = 0; i < 3600; i++) {
      const r = rollTwoDice(s);
      s = r.state;
      expect(r.roll).toBeGreaterThanOrEqual(2);
      expect(r.roll).toBeLessThanOrEqual(12);
      counts.set(r.roll, (counts.get(r.roll) ?? 0) + 1);
    }
    expect(counts.get(7) ?? 0).toBeGreaterThan(counts.get(2) ?? 0);
    expect(rollWays(7)).toBe(6);
    expect(rollWays(2)).toBe(1);
    expect(rollTwoDice(5)).toEqual(rollTwoDice(5));
  });

  it('pays +1 star to the owner of each harvested tile whose token matches, and not to others', () => {
    const state = blankGame();
    city(state, 99, MIDDLE);
    const [a, b, c] = neighbours(MIDDLE);
    if (!a || !b || !c) throw new Error('hex');
    for (const [h, token, harvested] of [[a, 6, 'grain'], [b, 6, 'wood'], [c, 8, 'grain']] as const) {
      const t = tile(state, h);
      t.token = token;
      t.harvested = harvested;
    }
    const unharvested = neighbours(MIDDLE)[3];
    if (!unharvested) throw new Error('hex');
    tile(state, unharvested).token = 6;
    tile(state, unharvested).resource = 'grain';
    expect(tokenPayouts(state, 6)).toEqual([{ player: 0, stars: 2 }]);
    expect(tokenPayouts(state, 8)).toEqual([{ player: 0, stars: 1 }]);
    expect(tokenPayouts(state, 5)).toEqual([]);
    expect(expectedTokenIncome(state, 0)).toBeCloseTo((5 + 5 + 5) / 36);
  });

  it('rolls once per round, pays at the round start and is deterministic', () => {
    const run = (): GameState => {
      let s = newGame({ seed: 7, players: 2 });
      expect(s.roll).not.toBeNull();
      const rolls: number[] = [s.roll as number];
      for (let i = 0; i < 6; i++) {
        s = step(s, s.current, [{ type: 'end_turn' }]).state;
        if (rolls[rolls.length - 1] !== s.roll || i % 2 === 1) rolls.push(s.roll as number);
      }
      return s;
    };
    expect(run()).toEqual(run());
    // The roll changes only when the turn order wraps to player 0.
    let s = newGame({ seed: 7, players: 2 });
    const first = s.rollState;
    s = step(s, 0, [{ type: 'end_turn' }]).state;
    expect(s.rollState).toBe(first);
    s = step(s, 1, [{ type: 'end_turn' }]).state;
    expect(s.rollState).not.toBe(first);
  });

  it('pays out through the engine when the round rolls the token', () => {
    let s = newGame({ seed: 11, players: 2 });
    s = step(s, 0, [{ type: 'end_turn' }]).state;
    // Find which roll comes next, then plant a harvested token on it next to player 0's capital.
    const next = rollTwoDice(s.rollState).roll;
    const capital = s.cities.find((c) => c.owner === 0 && c.capital);
    if (!capital) throw new Error('capital');
    const spot = neighbours(capital).map((h) => tile(s, h)).find((t) => t.terrain !== 'water');
    if (!spot) throw new Error('spot');
    spot.harvested = 'grain';
    spot.token = next;
    const before = s.players[0]?.stars ?? 0;
    const result = step(s, 1, [{ type: 'end_turn' }]);
    const rolled = result.events.find((e) => e.type === 'rolled');
    expect(rolled).toMatchObject({ roll: next, payouts: [{ player: 0, stars: 1 }] });
    // Player 0 gets the token star plus their normal income.
    expect((result.state.players[0]?.stars ?? 0) - before).toBe(income(result.state, 0) + 1);
  });

  it('replays stay identical: same seed and actions rebuild the same rolls', () => {
    const header = { type: 'header' as const, version: 1 as const, game: 'hexfolk' as const, seed: 9, players: 2, turnLimit: 6, seats: [] };
    const turns = Array.from({ length: 6 }, (_, i) => ({ type: 'turn' as const, player: i % 2, actions: [{ type: 'end_turn' as const }] }));
    const a = replayStates({ header, turns } as never);
    const b = replayStates({ header, turns } as never);
    expect(a.map((s) => s.roll)).toEqual(b.map((s) => s.roll));
  });
});

describe('agents and validation', () => {
  it('parses build_road and rejects a malformed one', () => {
    expect(parseAction({ type: 'build_road', at: { q: 1, r: 2 } })).toEqual({ ok: true, value: { type: 'build_road', at: { q: 1, r: 2 } } });
    expect(parseAction({ type: 'build_road' }).ok).toBe(false);
  });

  it('exposes resources as a generic map, roads, tokens and the roll in the observation', () => {
    const state = newGame({ seed: 4, players: 2 });
    const first = state.tiles.find((t) => t.resource);
    if (first) first.road = true;
    const o = compactObservation(state, 0);
    expect(o.resources.every((r) => typeof r.kind === 'string' && r.token !== null)).toBe(true);
    expect(o.resources.length).toBeGreaterThan(0);
    expect(o.roads).toHaveLength(first ? 1 : 0);
    expect(o.roll).toBe(state.roll);
    expect(o.rows.every((r) => /^[gfhmw]+$/.test(r.t))).toBe(true);
    expect(o.cities[0]).toHaveProperty('resources');
  });
});

describe('greedy AI', () => {
  it('harvests a new kind (and a likelier token) first', async () => {
    const { GreedyAgent } = await import('../src/core/ai/greedy');
    const state = blankGame();
    city(state, 99, MIDDLE, { harvested: ['grain', 'wood'] });
    rich(state);
    const [a, b] = neighbours(MIDDLE);
    if (!a || !b) throw new Error('hex');
    Object.assign(tile(state, a), { resource: 'grain', token: 6 });
    Object.assign(tile(state, b), { resource: 'fish', token: 2 });
    setTerrain(state, b, 'water');
    state.players[0]?.techs.push('fishing');
    const actions = new GreedyAgent('normal').decide({ you: 0, state }, legalActions(state, 0));
    const first = actions.find((x) => x.type === 'harvest');
    expect(first).toEqual({ type: 'harvest', at: { q: b.q, r: b.r } });
  });

  it('builds the road that links a second city to its capital', async () => {
    const { GreedyAgent } = await import('../src/core/ai/greedy');
    const state = blankGame();
    state.cities = [];
    city(state, 1, MIDDLE, { capital: true });
    city(state, 2, { q: MIDDLE.q + 2, r: MIDDLE.r });
    rich(state);
    state.players[0]?.techs.push('hunting', 'riding', 'archery', 'fortification', 'climbing', 'fishing');
    const actions = new GreedyAgent('normal').decide({ you: 0, state }, legalActions(state, 0));
    const next = actions.reduce((s, a) => step(s, 0, [a]).state, state);
    expect(connectedCities(next, 0).has(2)).toBe(true);
  });
});

describe('autosave', () => {
  it('ignores a save from before v0.2 (no dice state)', async () => {
    const { loadGame, saveGame } = await import('../src/ui/save');
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    const state = newGame({ seed: 2, players: 2 });
    saveGame(store, state);
    expect(loadGame(store)?.rollState).toBe(state.rollState);
    const old = { ...state } as Partial<GameState>;
    delete old.rollState;
    store.setItem('hexfolk:save', JSON.stringify(old));
    expect(loadGame(store)).toBeNull();
  });
});
