// A match referee shared by the simulator and the MCP server: it owns the state, applies each seat's
// actions through the engine (illegal ones are skipped and counted), ends a turn by default when
// asked to, and records the replay plus per-seat statistics. No DOM, no I/O.
import { type Agent } from './agent';
import { legalActions, newGame, observe, step } from './engine';
import { DEFAULT_TURN_LIMIT } from './rules';
import type { Replay, ReplayTurn } from './replay';
import type { Action, GameEvent, GameState, Rejection } from './state';

export interface SeatStats {
  /** Turns played. */
  decisions: number;
  /** Actions submitted, legal or not. */
  actions: number;
  illegal: number;
  /** Turns ended by the default action because the agent was too slow. */
  timeouts: number;
  /** Turns where the agent threw; also ended by the default action. */
  errors: number;
  latencyMs: number[];
}

export interface SubmitOptions {
  /** End the turn if the actions did not (the default action). */
  autoEnd?: boolean;
  timedOut?: boolean;
  errored?: boolean;
  latencyMs?: number;
}

export interface SubmitResult {
  rejected: Rejection[];
  events: GameEvent[];
  turnEnded: boolean;
}

export interface MatchSetup {
  seed: number;
  players: number;
  turnLimit?: number;
  /** One label per seat for the replay header. */
  seats?: string[];
}

export class Match {
  state: GameState;
  readonly stats: SeatStats[];
  private readonly replayData: Replay;
  private pending: Action[] = [];
  private pendingRejected = 0;
  private pendingTurn = 0;
  private pendingLatency = 0;
  private pendingTimedOut = false;

  constructor({ seed, players, turnLimit = DEFAULT_TURN_LIMIT, seats }: MatchSetup) {
    this.state = newGame({ seed, players, turnLimit });
    this.stats = Array.from({ length: players }, () => ({ decisions: 0, actions: 0, illegal: 0, timeouts: 0, errors: 0, latencyMs: [] }));
    this.replayData = {
      header: { type: 'header', version: 1, game: 'hexfolk', seed: this.state.seed, players, turnLimit, seats: seats ?? Array.from({ length: players }, (_, i) => `seat${i}`) },
      turns: [],
    };
  }

  get over(): boolean {
    return this.state.over;
  }

  /** The replay so far; the result line is added once the game is over. */
  replay(): Replay {
    const result = this.state.over ? { type: 'result' as const, winner: this.state.winner, turns: Math.min(this.state.turn, this.state.turnLimit), reason: this.reason } : undefined;
    return { header: this.replayData.header, turns: [...this.replayData.turns], ...(result ? { result } : {}) };
  }

  private reason: 'domination' | 'turn_limit' | 'unfinished' = 'unfinished';

  /** Applies a seat's actions. Wrong-turn and illegal actions are rejected, never applied. */
  submit(player: number, actions: readonly Action[], options: SubmitOptions = {}): SubmitResult {
    const seat = this.stats[player];
    if (this.pending.length === 0 && this.pendingRejected === 0) this.pendingTurn = this.state.turn;
    const raw = step(this.state, player, actions);
    // Actions queued after the winning move (e.g. the trailing end_turn) are not mistakes.
    const result = this.state.over ? raw : { ...raw, rejected: raw.rejected.filter((r) => !(raw.state.over && r.reason === 'the game is over')) };
    const bad = new Set(raw.rejected.map((r) => r.action));
    const accepted = actions.filter((a) => !bad.has(a));
    let next = result.state;
    const events = [...result.events];
    if (options.autoEnd && !next.over && next.current === player && player === this.state.current) {
      const ended = step(next, player, [{ type: 'end_turn' }]);
      next = ended.state;
      events.push(...ended.events);
      accepted.push({ type: 'end_turn' });
    }
    const wasCurrent = player === this.state.current;
    this.state = next;
    if (seat) {
      seat.actions += actions.length;
      seat.illegal += result.rejected.length;
    }
    if (wasCurrent) {
      this.pending.push(...accepted);
      this.pendingRejected += result.rejected.length;
      this.pendingLatency += options.latencyMs ?? 0;
      this.pendingTimedOut ||= options.timedOut === true;
    }
    const over = events.find((e) => e.type === 'game_over');
    if (over?.type === 'game_over') this.reason = over.reason;
    const turnEnded = wasCurrent && (next.over || next.current !== player);
    if (turnEnded) this.flush(player, options);
    return { rejected: result.rejected, events, turnEnded };
  }

  private flush(player: number, options: SubmitOptions): void {
    const entry: ReplayTurn = {
      type: 'turn',
      turn: this.pendingTurn,
      player,
      actions: this.pending,
      rejected: this.pendingRejected,
      ...(this.pendingTimedOut ? { timedOut: true } : {}),
      ...(this.pendingLatency > 0 ? { latencyMs: Math.round(this.pendingLatency * 100) / 100 } : {}),
    };
    this.replayData.turns.push(entry);
    const seat = this.stats[player];
    if (seat) {
      seat.decisions++;
      seat.latencyMs.push(this.pendingLatency);
      if (this.pendingTimedOut) seat.timeouts++;
      if (options.errored) seat.errors++;
    }
    this.pending = [];
    this.pendingRejected = 0;
    this.pendingLatency = 0;
    this.pendingTimedOut = false;
  }
}

export interface RunOptions extends MatchSetup {
  agents: Agent[];
  /** Per-turn limit for an agent that returns a promise; a synchronous agent cannot be interrupted. */
  timeoutMs?: number;
  now?: () => number;
}

export interface RunResult {
  match: Match;
  replay: Replay;
}

const TIMEOUT = Symbol('timeout');

/** Plays a whole match: each seat's agent decides, the referee validates and applies. */
export async function runMatch(options: RunOptions): Promise<RunResult> {
  const { agents, timeoutMs = 10_000, now = () => performance.now() } = options;
  if (agents.length !== options.players) throw new RangeError(`need ${options.players} agents, got ${agents.length}`);
  const match = new Match({ ...options, seats: options.seats ?? agents.map((a) => a.name) });
  let guard = 0;
  while (!match.over && guard++ < 10_000) {
    const player = match.state.current;
    const agent = agents[player] as Agent;
    const started = now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let actions: Action[] = [];
    let timedOut = false;
    let errored = false;
    try {
      const decision = Promise.resolve(agent.decide(observe(match.state, player), legalActions(match.state, player)));
      const raced = await Promise.race([decision, new Promise<typeof TIMEOUT>((resolve) => (timer = setTimeout(() => resolve(TIMEOUT), timeoutMs)))]);
      if (raced === TIMEOUT) timedOut = true;
      else actions = raced;
    } catch {
      errored = true;
    } finally {
      clearTimeout(timer);
    }
    match.submit(player, actions, { autoEnd: true, timedOut, errored, latencyMs: now() - started });
  }
  return { match, replay: match.replay() };
}
