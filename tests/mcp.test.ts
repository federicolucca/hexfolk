// The MCP tool handlers, called directly (no stdio, no network).
import { describe, expect, it } from 'vitest';
import { MatchStore, ToolError } from '../packages/mcp/src/handlers';
import { parseReplay, replayStates } from '../src/core/replay';

const setup = async (extra: Record<string, unknown> = {}, now = () => 0) => {
  const store = new MatchStore({ now });
  const { match_id } = await store.createMatch({ seed: 4, players: 2, turn_limit: 6, ...extra });
  return { store, id: match_id };
};

describe('MCP handlers', () => {
  it('create_match validates its input', async () => {
    const store = new MatchStore();
    await expect(store.createMatch({ players: 9 })).rejects.toBeInstanceOf(ToolError);
    await expect(store.createMatch({ players: 2, turn_limit: 0 })).rejects.toThrow(/turn_limit/);
    await expect(store.createMatch({ players: 2, seed: -1 })).rejects.toThrow(/seed/);
    await expect(store.createMatch({ players: 2, difficulty: 'insane' })).rejects.toThrow(/difficulty/);
    const ok = await store.createMatch({ seed: 4, players: 3, turn_limit: 5 });
    expect(ok).toMatchObject({ seed: 4, players: 3, turn_limit: 5, status: 'lobby', difficulty: 'normal' });
  });

  it('rejects unknown matches, bad seats and double joins', async () => {
    const { store, id } = await setup();
    await expect(store.getMatchStatus({ match_id: 'nope' })).rejects.toThrow(/no such match/);
    await expect(store.joinMatch({ match_id: id, seat: 2 })).rejects.toThrow(/seat/);
    await expect(store.joinMatch({ match_id: id, seat: 1.5 })).rejects.toThrow(/seat/);
    await store.joinMatch({ match_id: id, seat: 0 });
    await expect(store.joinMatch({ match_id: id, seat: 0 })).rejects.toThrow(/already taken/);
  });

  it('the built-in AI plays unjoined seats; the joined seat gets the turn', async () => {
    const { store, id } = await setup();
    expect((await store.getMatchStatus({ match_id: id })).status).toBe('lobby');
    // The client takes seat 1, so the AI plays seat 0 first.
    const joined = await store.joinMatch({ match_id: id, seat: 1, name: 'tester' });
    expect(joined).toMatchObject({ status: 'in_progress', your_turn: true });
    const status = await store.getMatchStatus({ match_id: id });
    expect(status.current_seat).toBe(1);
    expect(status.seats[0]?.controller).toBe('ai:greedy');
    expect(status.seats[1]?.controller).toBe('mcp:tester');
  });

  it('get_observation returns a summary and compact JSON; list_legal_actions lists actions', async () => {
    const { store, id } = await setup();
    await store.joinMatch({ match_id: id, seat: 0 });
    const obs = await store.getObservation({ match_id: id, seat: 0 });
    expect(obs.your_turn).toBe(true);
    expect(obs.summary).toContain('You are player 0');
    expect(obs.observation.units.length).toBeGreaterThan(0);
    expect(obs.observation.rows.length).toBeGreaterThan(0);
    const legal = await store.listLegalActions({ match_id: id, seat: 0 });
    expect(legal.actions).toContainEqual({ type: 'end_turn' });
    expect((await store.listLegalActions({ match_id: id, seat: 1 })).count).toBe(0);
  });

  it('submit_actions rejects illegal actions server-side and malformed ones outright', async () => {
    const { store, id } = await setup();
    await store.joinMatch({ match_id: id, seat: 0 });
    const r = await store.submitActions({ match_id: id, seat: 0, actions: [{ type: 'move', unit: 999, to: { q: 0, r: 0 } }] });
    expect(r.rejected).toHaveLength(1);
    expect(r.turn_ended).toBe(false);
    await expect(store.submitActions({ match_id: id, seat: 0, actions: [{ type: 'teleport' }] })).rejects.toThrow(/unknown action/);
    await expect(store.submitActions({ match_id: id, seat: 0, actions: 'end_turn' })).rejects.toThrow(/array/);
    await expect(store.submitActions({ match_id: id, seat: 1, actions: [] })).rejects.toThrow(/not been joined/);
    const ended = await store.submitActions({ match_id: id, seat: 0, actions: [{ type: 'end_turn' }] });
    expect(ended.turn_ended).toBe(true);
    // The AI answered, so it is the client's turn again.
    expect(ended.your_turn).toBe(true);
  });

  it('plays a whole match against the AI and serves a replay that rebuilds the result', async () => {
    const { store, id } = await setup();
    await store.joinMatch({ match_id: id, seat: 0 });
    for (let i = 0; i < 20; i++) {
      if ((await store.getMatchStatus({ match_id: id })).status === 'finished') break;
      await store.submitActions({ match_id: id, seat: 0, actions: [{ type: 'end_turn' }] });
    }
    const status = await store.getMatchStatus({ match_id: id });
    expect(status.status).toBe('finished');
    await expect(store.submitActions({ match_id: id, seat: 0, actions: [] })).rejects.toThrow(/over/);
    const replay = parseReplay((await store.getReplay({ match_id: id })).jsonl);
    expect(replay.header.seats[0]).toBe('mcp:client');
    expect(replay.result?.winner).toBe(status.winner);
    expect(replayStates(replay).at(-1)?.over).toBe(true);
  });

  it('ends a slow seat\'s turn by default after the per-turn timeout', async () => {
    let t = 0;
    const { store, id } = await setup({ turn_timeout_ms: 1000 }, () => t);
    await store.joinMatch({ match_id: id, seat: 0 });
    t = 500;
    expect((await store.getObservation({ match_id: id, seat: 0 })).your_turn).toBe(true);
    t = 5000; // past the deadline: seat 0's turn was ended, the AI played, and a new deadline started
    const obs = await store.getObservation({ match_id: id, seat: 0 });
    expect(obs.your_turn).toBe(true);
    const status = await store.getMatchStatus({ match_id: id });
    expect(status.seats[0]?.stats.timeouts).toBe(1);
    expect(status.turn).toBe(2);
  });
});
