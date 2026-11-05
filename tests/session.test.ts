import { describe, expect, it } from 'vitest';
import { passAgent, playTurn } from '../src/core/agent';
import { newGame } from '../src/core/engine';
import { Session } from '../src/ui/session';

describe('Session', () => {
  const setup = () => {
    const state = newGame({ seed: 77, players: 2 });
    const session = new Session(state, 0, { 1: passAgent });
    const warrior = state.units.find((u) => u.owner === 0);
    if (!warrior) throw new Error('no warrior');
    return { session, warrior };
  };

  it('selects the human unit on tap and shows where it can go', () => {
    const { session, warrior } = setup();
    session.tap(warrior);
    expect(session.selectedUnit).toBe(warrior.id);
    expect(session.highlights().reach.length).toBeGreaterThan(0);
  });

  it('moves the selected unit to a reachable tile on the second tap', () => {
    const { session, warrior } = setup();
    session.tap(warrior);
    const to = session.highlights().reach[0];
    if (!to) throw new Error('nowhere to go');
    const events = session.tap(to);
    expect(events[0]).toMatchObject({ type: 'moved', unit: warrior.id, to });
    expect(session.state.units.find((u) => u.id === warrior.id)).toMatchObject({ q: to.q, r: to.r });
    expect(session.highlights().done).toContain(warrior.id);
  });

  it('only selects tiles, not units, of other players', () => {
    const { session } = setup();
    const enemy = session.state.units.find((u) => u.owner === 1);
    if (!enemy) throw new Error('no enemy');
    session.tap(enemy);
    expect(session.selectedUnit).toBeNull();
    expect(session.selectedHex).toEqual({ q: enemy.q, r: enemy.r });
    session.tap(enemy);
    expect(session.selectedHex).toBeNull();
  });

  it('lets the agents play until it is the human turn again', async () => {
    const { session } = setup();
    const events = await session.endTurn();
    expect(session.state.current).toBe(0);
    expect(session.state.turn).toBe(2);
    expect(events.filter((e) => e.type === 'turn_started').map((e) => ('player' in e ? e.player : -1))).toEqual([1, 0]);
  });
});

describe('playTurn', () => {
  it('ends the turn for an agent that forgets to', async () => {
    const state = newGame({ seed: 5, players: 2 });
    const lazy = { name: 'lazy', decide: () => [] };
    const result = await playTurn(state, lazy, () => 0);
    expect(result.state.current).toBe(1);
    expect(result.actions).toEqual([{ type: 'end_turn' }]);
    expect(result.latencyMs).toBe(0);
  });

  it('reports illegal actions and still ends the turn', async () => {
    const state = newGame({ seed: 5, players: 2 });
    const cheat = { name: 'cheat', decide: () => [{ type: 'move' as const, unit: 999, to: { q: 0, r: 0 } }] };
    const result = await playTurn(state, cheat);
    expect(result.rejected).toHaveLength(1);
    expect(result.state.current).toBe(1);
  });
});
