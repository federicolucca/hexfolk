// The MCP tool handlers, with no SDK and no I/O so they can be called (and tested) directly.
// Every input is validated here: a client is never trusted. Seats nobody has joined are played by
// the built-in greedy AI once the match has started (the first join_match starts it). A joined
// seat has a per-turn deadline; when it passes, the turn is ended by the default action (end_turn).
// The deadline is enforced lazily, on the next call that touches the match.
import type { Agent } from '../../../src/core/agent';
import { type Difficulty, GreedyAgent, isDifficulty } from '../../../src/core/ai';
import { legalActions, observe } from '../../../src/core/engine';
import { Match } from '../../../src/core/match';
import { compactObservation, describeObservation } from '../../../src/core/observation';
import { serializeReplay } from '../../../src/core/replay';
import { MAX_PLAYERS as MAX_PLAYERS_HINT, MIN_PLAYERS as MIN_PLAYERS_HINT } from '../../../src/core/map';
import { DEFAULT_TURN_LIMIT } from '../../../src/core/rules';
import type { Action } from '../../../src/core/state';
import { parseActions } from '../../../src/core/validate';

export const DEFAULT_TURN_TIMEOUT_MS = 120_000;
const MAX_MATCHES = 50;
const MAX_TURN_LIMIT = 200;
const MAX_LEGAL_LISTED = 600;

/** A problem with the client's request: reported to it as a tool error, never a crash. */
export class ToolError extends Error {}

interface Entry {
  id: string;
  match: Match;
  difficulty: Difficulty;
  timeoutMs: number;
  /** seat -> label of the client that joined it. */
  joined: Map<number, string>;
  ai: Agent;
  started: boolean;
  /** Epoch ms by which the current joined seat must finish its turn, or null. */
  deadline: number | null;
}

export interface StoreOptions {
  now?: () => number;
  /** Test hook: a fixed seed for matches created without one. */
  randomSeed?: () => number;
}

const isUint32 = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;

export class MatchStore {
  private readonly matches = new Map<string, Entry>();
  private counter = 0;
  private readonly now: () => number;
  private readonly randomSeed: () => number;

  constructor(options: StoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.randomSeed = options.randomSeed ?? (() => Math.floor(Math.random() * 0x100000000));
  }

  private entry(id: unknown): Entry {
    const found = typeof id === 'string' ? this.matches.get(id) : undefined;
    if (!found) throw new ToolError(`no such match: ${String(id)}`);
    return found;
  }

  private seatOf(e: Entry, seat: unknown): number {
    if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 0 || seat >= e.match.state.players.length) {
      throw new ToolError(`seat must be an integer from 0 to ${e.match.state.players.length - 1}`);
    }
    return seat;
  }

  /** Plays the AI seats until a joined seat is to move or the game is over; enforces the deadline. */
  private advance(e: Entry): void {
    if (!e.started) return;
    for (let guard = 0; guard < 1000 && !e.match.over; guard++) {
      const seat = e.match.state.current;
      if (e.joined.has(seat)) {
        if (e.deadline === null) e.deadline = this.now() + e.timeoutMs;
        if (this.now() < e.deadline) return;
        // Too slow: the default action is to end the turn.
        e.match.submit(seat, [], { autoEnd: true, timedOut: true });
        e.deadline = null;
        continue;
      }
      const started = this.now();
      const actions = e.ai.decide(observe(e.match.state, seat), legalActions(e.match.state, seat));
      if (actions instanceof Promise) throw new Error('the built-in AI must be synchronous');
      e.match.submit(seat, actions, { autoEnd: true, latencyMs: this.now() - started });
    }
  }

  private status(e: Entry): 'lobby' | 'in_progress' | 'finished' {
    return e.match.over ? 'finished' : e.started ? 'in_progress' : 'lobby';
  }

  private remaining(e: Entry): number | null {
    return e.deadline === null || e.match.over ? null : Math.max(0, e.deadline - this.now());
  }

  async createMatch(input: { seed?: number; players?: number; turn_limit?: number; difficulty?: string; turn_timeout_ms?: number }) {
    const players = input.players ?? 2;
    if (!Number.isInteger(players) || players < MIN_PLAYERS_HINT || players > MAX_PLAYERS_HINT) throw new ToolError(`players must be an integer from ${MIN_PLAYERS_HINT} to ${MAX_PLAYERS_HINT}`);
    const turnLimit = input.turn_limit ?? DEFAULT_TURN_LIMIT;
    if (!Number.isInteger(turnLimit) || turnLimit < 1 || turnLimit > MAX_TURN_LIMIT) throw new ToolError(`turn_limit must be an integer from 1 to ${MAX_TURN_LIMIT}`);
    const difficulty = input.difficulty ?? 'normal';
    if (!isDifficulty(difficulty)) throw new ToolError('difficulty must be "easy" or "normal"');
    const timeoutMs = input.turn_timeout_ms ?? DEFAULT_TURN_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new ToolError('turn_timeout_ms must be an integer from 1 to 3600000');
    const seed = input.seed ?? this.randomSeed();
    if (!isUint32(seed)) throw new ToolError('seed must be an integer from 0 to 4294967295');
    if (this.matches.size >= MAX_MATCHES) {
      const finished = [...this.matches.values()].find((m) => m.match.over);
      if (!finished) throw new ToolError(`too many open matches (${MAX_MATCHES})`);
      this.matches.delete(finished.id);
    }
    const id = `m${++this.counter}`;
    const ai = new GreedyAgent(difficulty);
    const match = new Match({ seed, players, turnLimit, seats: Array.from({ length: players }, () => `ai:${ai.name}`) });
    this.matches.set(id, { id, match, difficulty, timeoutMs, joined: new Map(), ai, started: false, deadline: null });
    return {
      match_id: id,
      seed: match.state.seed,
      players,
      turn_limit: turnLimit,
      difficulty,
      turn_timeout_ms: timeoutMs,
      status: 'lobby' as const,
      note: 'Call join_match for each seat you play. The match starts at the first join; seats nobody has joined are played by the built-in AI.',
    };
  }

  async joinMatch(input: { match_id?: string; seat?: number; name?: string }) {
    const e = this.entry(input.match_id);
    const seat = this.seatOf(e, input.seat);
    if (e.match.over) throw new ToolError('the match is over');
    if (e.joined.has(seat)) throw new ToolError(`seat ${seat} is already taken`);
    if (e.started && e.match.stats[seat]?.decisions) throw new ToolError(`seat ${seat} is already being played by the built-in AI`);
    const label = `mcp:${(input.name ?? 'client').slice(0, 40)}`;
    e.joined.set(seat, label);
    e.match.replay().header.seats[seat] = label;
    e.started = true;
    this.advance(e);
    return { match_id: e.id, seat, status: this.status(e), your_turn: !e.match.over && e.match.state.current === seat, turn: e.match.state.turn, turn_timeout_ms: e.timeoutMs };
  }

  async getObservation(input: { match_id?: string; seat?: number }) {
    const e = this.entry(input.match_id);
    const seat = this.seatOf(e, input.seat);
    this.advance(e);
    const legal = legalActions(e.match.state, seat);
    return {
      your_turn: !e.match.over && e.match.state.current === seat,
      deadline_ms_remaining: this.remaining(e),
      summary: describeObservation(e.match.state, seat, legal.length),
      observation: compactObservation(e.match.state, seat),
    };
  }

  async listLegalActions(input: { match_id?: string; seat?: number }) {
    const e = this.entry(input.match_id);
    const seat = this.seatOf(e, input.seat);
    this.advance(e);
    const all = legalActions(e.match.state, seat);
    return { your_turn: all.length > 0, count: all.length, truncated: all.length > MAX_LEGAL_LISTED, actions: all.slice(0, MAX_LEGAL_LISTED) };
  }

  async submitActions(input: { match_id?: string; seat?: number; actions?: unknown }) {
    const e = this.entry(input.match_id);
    const seat = this.seatOf(e, input.seat);
    this.advance(e);
    if (!e.joined.has(seat)) throw new ToolError(`seat ${seat} has not been joined: call join_match first`);
    if (e.match.over) throw new ToolError('the match is over');
    if (e.match.state.current !== seat) throw new ToolError(`it is player ${e.match.state.current}'s turn, not seat ${seat}'s`);
    const parsed = parseActions(input.actions);
    if (!parsed.ok) throw new ToolError(parsed.error);
    const started = this.now();
    const result = e.match.submit(seat, parsed.value as Action[], { latencyMs: this.now() - started });
    if (result.turnEnded) e.deadline = null;
    this.advance(e);
    return {
      accepted: parsed.value.length - result.rejected.length,
      rejected: result.rejected.map((r) => ({ action: r.action, reason: r.reason })),
      turn_ended: result.turnEnded,
      your_turn: !e.match.over && e.match.state.current === seat,
      status: this.status(e),
      summary: describeObservation(e.match.state, seat),
    };
  }

  async getMatchStatus(input: { match_id?: string }) {
    const e = this.entry(input.match_id);
    this.advance(e);
    const s = e.match.state;
    const replay = e.match.replay();
    return {
      match_id: e.id,
      status: this.status(e),
      seed: s.seed,
      turn: s.turn,
      turn_limit: s.turnLimit,
      current_seat: s.over ? null : s.current,
      winner: s.winner,
      reason: replay.result?.reason ?? null,
      deadline_ms_remaining: this.remaining(e),
      seats: s.players.map((p) => ({ seat: p.id, controller: e.joined.get(p.id) ?? replay.header.seats[p.id], alive: p.alive, stats: { ...e.match.stats[p.id], latencyMs: undefined } })),
    };
  }

  async getReplay(input: { match_id?: string }) {
    const e = this.entry(input.match_id);
    this.advance(e);
    const replay = e.match.replay();
    return { status: this.status(e), turns: replay.turns.length, jsonl: serializeReplay(replay) };
  }
}
