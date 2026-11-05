import { describe, expect, it } from 'vitest';
import { checkAction, legalActions, newGame, observe, step } from '../src/core/engine';
import { distance, neighbours } from '../src/core/hex';
import { reachable } from '../src/core/movement';
import type { Action, GameState } from '../src/core/state';
import { addUnit, blankGame, keys, MIDDLE, setTerrain } from './helpers';

describe('newGame', () => {
  it('starts every player with a warrior on their capital', () => {
    for (const players of [2, 3, 4]) {
      const state = newGame({ seed: 42, players });
      expect(state.players).toHaveLength(players);
      expect(state.turn).toBe(1);
      expect(state.current).toBe(0);
      for (let p = 0; p < players; p++) {
        const capital = state.cities.find((c) => c.capital && c.owner === p);
        const units = state.units.filter((u) => u.owner === p);
        expect(capital).toBeDefined();
        expect(units).toHaveLength(1);
        expect(units[0]).toMatchObject({ type: 'warrior', q: capital?.q, r: capital?.r, home: capital?.id });
      }
    }
  });

  it('is deterministic and plain JSON', () => {
    const a = newGame({ seed: 7, players: 3, turnLimit: 20 });
    expect(newGame({ seed: 7, players: 3, turnLimit: 20 })).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.turnLimit).toBe(20);
  });

  it('rejects bad settings', () => {
    expect(() => newGame({ seed: 1, players: 5 })).toThrow(RangeError);
    expect(() => newGame({ seed: 1, players: 2, turnLimit: 0 })).toThrow(RangeError);
  });
});

describe('observe', () => {
  it('returns a copy of the whole state (no fog of war in v0.1)', () => {
    const state = newGame({ seed: 3, players: 2 });
    const obs = observe(state, 1);
    expect(obs.you).toBe(1);
    expect(obs.state).toEqual(state);
    obs.state.units = [];
    expect(state.units).toHaveLength(2);
  });
});

describe('movement', () => {
  it('moves a warrior one hex onto grass', () => {
    const state = blankGame();
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    expect(keys(reachable(state, w))).toEqual(keys(neighbours(MIDDLE)));
  });

  it('moves a rider two hexes over grass', () => {
    const state = blankGame();
    const r = addUnit(state, 0, 'rider', MIDDLE);
    const hexes = reachable(state, r);
    expect(hexes).toHaveLength(18);
    for (const h of hexes) expect(distance(h, MIDDLE)).toBeLessThanOrEqual(2);
  });

  it('never enters water, and enters mountains only with Climbing', () => {
    const state = blankGame();
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    const [east, southEast] = neighbours(MIDDLE);
    if (!east || !southEast) throw new Error('no neighbours');
    setTerrain(state, east, 'water');
    setTerrain(state, southEast, 'mountain');
    expect(keys(reachable(state, w))).not.toContain(`${east.q},${east.r}`);
    expect(keys(reachable(state, w))).not.toContain(`${southEast.q},${southEast.r}`);
    state.players[0]?.techs.push('climbing');
    expect(keys(reachable(state, w))).toContain(`${southEast.q},${southEast.r}`);
    expect(keys(reachable(state, w))).not.toContain(`${east.q},${east.r}`);
  });

  it('stops a rider when it enters a forest', () => {
    const state = blankGame();
    const r = addUnit(state, 0, 'rider', MIDDLE);
    const east = { q: MIDDLE.q + 1, r: MIDDLE.r };
    const farEast = { q: MIDDLE.q + 2, r: MIDDLE.r };
    // Only the eastern path: surround the rider with water except the forest to the east.
    for (const n of neighbours(MIDDLE)) setTerrain(state, n, 'water');
    setTerrain(state, east, 'forest');
    expect(keys(reachable(state, r))).toEqual([`${east.q},${east.r}`]);
    setTerrain(state, east, 'grass');
    expect(keys(reachable(state, r))).toContain(`${farEast.q},${farEast.r}`);
  });

  it('cannot move onto or through other units', () => {
    const state = blankGame();
    const r = addUnit(state, 0, 'rider', MIDDLE);
    for (const n of neighbours(MIDDLE)) addUnit(state, 1, 'warrior', n);
    expect(reachable(state, r)).toEqual([]);
  });

  it('cannot move twice in a turn', () => {
    const state = blankGame();
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    const to = neighbours(MIDDLE)[0];
    if (!to) throw new Error('no neighbour');
    const { state: after } = step(state, 0, [{ type: 'move', unit: w.id, to }]);
    const moved = after.units.find((u) => u.id === w.id);
    expect(moved).toMatchObject({ q: to.q, r: to.r, moved: true });
    expect(moved && reachable(after, moved)).toEqual([]);
  });
});

describe('legality', () => {
  it('lists actions only for the player to move, always including end_turn', () => {
    const state = newGame({ seed: 11, players: 3 });
    expect(legalActions(state, 1)).toEqual([]);
    const legal = legalActions(state, 0);
    expect(legal).toContainEqual({ type: 'end_turn' });
    for (const a of legal) expect(checkAction(state, 0, a)).toBeNull();
  });

  it('explains why an action is illegal', () => {
    const state = blankGame();
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    const enemy = addUnit(state, 1, 'warrior', { q: MIDDLE.q + 3, r: MIDDLE.r });
    expect(checkAction(state, 1, { type: 'end_turn' })).toMatch(/player 0's turn/);
    expect(checkAction(state, 0, { type: 'move', unit: enemy.id, to: MIDDLE })).toMatch(/no such unit/);
    expect(checkAction(state, 0, { type: 'move', unit: w.id, to: { q: MIDDLE.q + 2, r: MIDDLE.r } })).toMatch(/out of reach/);
    expect(checkAction(state, 0, { type: 'fly' } as unknown as Action)).toMatch(/unknown/);
  });
});

describe('step', () => {
  it('does not change its input, and skips illegal actions with a reason', () => {
    const state = blankGame();
    const w = addUnit(state, 0, 'warrior', MIDDLE);
    const before = structuredClone(state);
    const far = { q: MIDDLE.q + 4, r: MIDDLE.r };
    const result = step(state, 0, [{ type: 'move', unit: w.id, to: far }]);
    expect(state).toEqual(before);
    expect(result.rejected).toEqual([{ action: { type: 'move', unit: w.id, to: far }, reason: 'that hex is out of reach' }]);
    expect(result.state).toEqual(before);
  });

  it('passes the turn in order, counts turns and refreshes units', () => {
    let state: GameState = newGame({ seed: 9, players: 3 });
    const warrior = state.units.find((u) => u.owner === 0);
    const to = warrior && legalActions(state, 0).find((a) => a.type === 'move');
    if (!warrior || !to) throw new Error('no move');
    state = step(state, 0, [to, { type: 'end_turn' }]).state;
    expect(state.current).toBe(1);
    expect(state.turn).toBe(1);
    expect(state.units.find((u) => u.id === warrior.id)?.moved).toBe(true);
    state = step(state, 1, [{ type: 'end_turn' }]).state;
    const last = step(state, 2, [{ type: 'end_turn' }]);
    expect(last.state.current).toBe(0);
    expect(last.state.turn).toBe(2);
    expect(last.state.units.find((u) => u.id === warrior.id)?.moved).toBe(false);
    expect(last.events).toContainEqual({ type: 'turn_started', player: 0, turn: 2 });
  });

  it('rejects actions after the player ended their turn', () => {
    const state = newGame({ seed: 9, players: 2 });
    const result = step(state, 0, [{ type: 'end_turn' }, { type: 'end_turn' }]);
    expect(result.rejected).toHaveLength(1);
    expect(result.state.current).toBe(1);
  });

  it('replays identically from the same seed and actions', () => {
    const play = (): GameState => {
      let state = newGame({ seed: 2024, players: 2 });
      for (let i = 0; i < 10; i++) {
        const legal = legalActions(state, state.current);
        const move = legal.find((a) => a.type === 'move');
        state = step(state, state.current, move ? [move, { type: 'end_turn' }] : [{ type: 'end_turn' }]).state;
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});
