// Benchmark harness: plays one 2-player game between two step agents, one action at a time, and
// records every decision. Pure apart from the injected clock: no DOM, no I/O, no network.
//
// Fixed rule for a bad decision (see docs/PROTOCOL.md): a malformed or illegal action, an agent
// error or a reply after the time limit is never corrected. It is logged as such and the seat's
// turn ends (end_turn is applied in its place). An agent that takes more than MAX_ACTIONS_PER_TURN
// actions in one turn also has its turn ended; that is logged as a "cap", not as a bad move.
import { score as scoreOf } from '../economy';
import { checkAction, legalActions, newGame, type Observation, observe, step } from '../engine';
import type { Action, GameState } from '../state';
import { parseAction } from '../validate';

export const BENCH_FORMAT = 'hexfolk-bench/1';
export const MAX_ACTIONS_PER_TURN = 20;
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface Usage {
  tokensIn: number;
  tokensOut: number;
  /** US dollars, as reported or estimated by the agent; 0 for local code. */
  costUsd: number;
}

export interface Decision {
  /** The action as the agent produced it; checked by the harness, never trusted. */
  action: unknown;
  /** The model's raw reply, kept in the log (truncated). */
  raw?: string;
  usage?: Usage;
  /** For an agent that showed the legal actions in another order: shown index i was legal action order[i]. */
  order?: number[];
}

/** Anything that plays a seat one action at a time. */
export interface StepAgent {
  readonly name: string;
  choose(view: Observation, legal: Action[]): Decision | Promise<Decision>;
}

export type MoveStatus = 'ok' | 'malformed' | 'illegal' | 'timeout' | 'error' | 'cap';
export const BAD_STATUSES: readonly MoveStatus[] = ['malformed', 'illegal', 'timeout', 'error'];

export interface LogHeader {
  type: 'header';
  format: typeof BENCH_FORMAT;
  seed: number;
  turnLimit: number;
  agents: [string, string];
  maxActionsPerTurn: number;
  timeoutMs: number;
  /** Free-form provenance, e.g. the git commit and rules version; filled by the caller. */
  meta?: Record<string, string>;
}

export interface LogMove {
  type: 'move';
  /** 0-based index of this decision in the game. */
  i: number;
  turn: number;
  player: number;
  status: MoveStatus;
  /** The action that was applied: the agent's on "ok", end_turn otherwise. */
  applied: Action;
  /** What the agent returned when it was not applied as is (null after a timeout or an error). */
  submitted?: unknown;
  reason?: string;
  raw?: string;
  ms: number;
  usage?: Usage;
  order?: number[];
}

export interface SeatSummary {
  agent: string;
  decisions: number;
  bad: Record<'malformed' | 'illegal' | 'timeout' | 'error', number>;
  caps: number;
  ms: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  score: number;
}

export interface LogResult {
  type: 'result';
  winner: number | null;
  reason: 'domination' | 'turn_limit' | 'unfinished';
  /** The round the game ended in. */
  turns: number;
  seats: [SeatSummary, SeatSummary];
}

export interface GameLog {
  header: LogHeader;
  moves: LogMove[];
  result: LogResult;
}

export interface GameOptions {
  seed: number;
  agents: [StepAgent, StepAgent];
  turnLimit?: number;
  timeoutMs?: number;
  maxActionsPerTurn?: number;
  meta?: Record<string, string>;
  now?: () => number;
  /** Called after each decision (for progress output). */
  onMove?: (move: LogMove) => void;
}

const RAW_LIMIT = 2000;
const END: Action = { type: 'end_turn' };
const TIMEOUT = Symbol('timeout');
/** A hard stop so a broken engine can never loop forever. */
const MAX_DECISIONS = 20_000;

async function decide(agent: StepAgent, view: Observation, legal: Action[], timeoutMs: number): Promise<Decision | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => agent.choose(view, legal)),
      new Promise<typeof TIMEOUT>((resolve) => (timer = setTimeout(() => resolve(TIMEOUT), timeoutMs))),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Plays one game to the end and returns its full log. */
export async function runGame(options: GameOptions): Promise<GameLog> {
  const { seed, agents, turnLimit = 30, timeoutMs = DEFAULT_TIMEOUT_MS, maxActionsPerTurn = MAX_ACTIONS_PER_TURN, now = () => performance.now() } = options;
  let state = newGame({ seed, players: 2, turnLimit });
  const header: LogHeader = { type: 'header', format: BENCH_FORMAT, seed, turnLimit, agents: [agents[0].name, agents[1].name], maxActionsPerTurn, timeoutMs, ...(options.meta ? { meta: options.meta } : {}) };
  const moves: LogMove[] = [];
  let actionsThisTurn = 0;
  let reason: LogResult['reason'] = 'unfinished';

  while (!state.over && moves.length < MAX_DECISIONS) {
    const player = state.current;
    const agent = agents[player] as StepAgent;
    const turn = state.turn;
    let move: LogMove;
    if (actionsThisTurn >= maxActionsPerTurn) {
      move = { type: 'move', i: moves.length, turn, player, status: 'cap', applied: END, reason: `more than ${maxActionsPerTurn} actions in one turn`, ms: 0 };
    } else {
      const legal = legalActions(state, player);
      const started = now();
      let outcome: Decision | typeof TIMEOUT | Error;
      try {
        outcome = await decide(agent, observe(state, player), legal, timeoutMs);
      } catch (err) {
        outcome = err instanceof Error ? err : new Error(String(err));
      }
      const ms = Math.round((now() - started) * 100) / 100;
      const base = { type: 'move' as const, i: moves.length, turn, player, ms };
      if (outcome === TIMEOUT) {
        move = { ...base, status: 'timeout', applied: END, submitted: null, reason: `no reply within ${timeoutMs} ms` };
      } else if (outcome instanceof Error) {
        move = { ...base, status: 'error', applied: END, submitted: null, reason: outcome.message.slice(0, 300) };
      } else {
        const extra = { ...(outcome.raw !== undefined ? { raw: outcome.raw.slice(0, RAW_LIMIT) } : {}), ...(outcome.usage ? { usage: outcome.usage } : {}), ...(outcome.order ? { order: outcome.order } : {}) };
        const parsed = parseAction(outcome.action);
        if (!parsed.ok) {
          move = { ...base, status: 'malformed', applied: END, submitted: outcome.action ?? null, reason: parsed.error, ...extra };
        } else {
          const why = checkAction(state, player, parsed.value);
          move = why === null ? { ...base, status: 'ok', applied: parsed.value, ...extra } : { ...base, status: 'illegal', applied: END, submitted: parsed.value, reason: why, ...extra };
        }
      }
    }
    const result = step(state, player, [move.applied]);
    state = result.state;
    const over = result.events.find((e) => e.type === 'game_over');
    if (over?.type === 'game_over') reason = over.reason;
    actionsThisTurn = state.current === player && !state.over ? actionsThisTurn + 1 : 0;
    moves.push(move);
    options.onMove?.(move);
  }
  return { header, moves, result: summarise(header, moves, state, reason) };
}

function summarise(header: LogHeader, moves: LogMove[], state: GameState, reason: LogResult['reason']): LogResult {
  const seat = (p: number): SeatSummary => {
    const mine = moves.filter((m) => m.player === p);
    const count = (s: MoveStatus) => mine.filter((m) => m.status === s).length;
    const sum = (f: (m: LogMove) => number) => Math.round(mine.reduce((n, m) => n + f(m), 0) * 1e6) / 1e6;
    return {
      agent: header.agents[p] as string,
      decisions: mine.filter((m) => m.status !== 'cap').length,
      bad: { malformed: count('malformed'), illegal: count('illegal'), timeout: count('timeout'), error: count('error') },
      caps: count('cap'),
      ms: sum((m) => m.ms),
      tokensIn: sum((m) => m.usage?.tokensIn ?? 0),
      tokensOut: sum((m) => m.usage?.tokensOut ?? 0),
      costUsd: sum((m) => m.usage?.costUsd ?? 0),
      score: scoreOf(state, p),
    };
  };
  return { type: 'result', winner: state.over ? state.winner : null, reason, turns: Math.min(state.turn, state.turnLimit), seats: [seat(0), seat(1)] };
}

/** JSONL: header, one line per decision, result. */
export function serializeLog(log: GameLog): string {
  return [log.header, ...log.moves, log.result].map((l) => JSON.stringify(l)).join('\n') + '\n';
}

export function parseLog(text: string): GameLog {
  const lines = text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as { type: string });
  const header = lines[0] as LogHeader | undefined;
  const result = lines[lines.length - 1] as LogResult | undefined;
  if (header?.type !== 'header' || header.format !== BENCH_FORMAT) throw new Error(`not a ${BENCH_FORMAT} log`);
  if (result?.type !== 'result') throw new Error('the log has no result line (unfinished game?)');
  return { header, moves: lines.slice(1, -1) as LogMove[], result };
}

/**
 * Rebuilds the game from the log alone (seed + applied actions) and checks it ends exactly as
 * logged. Returns the final state, or throws on the first mismatch.
 */
export function rebuildFromLog(log: GameLog): GameState {
  let state = newGame({ seed: log.header.seed, players: 2, turnLimit: log.header.turnLimit });
  for (const move of log.moves) {
    if (state.current !== move.player) throw new Error(`move ${move.i}: logged for player ${move.player}, but it is player ${state.current}'s turn`);
    const result = step(state, move.player, [move.applied]);
    if (result.rejected.length > 0) throw new Error(`move ${move.i}: the applied action is illegal (${result.rejected[0]?.reason})`);
    state = result.state;
  }
  const winner = state.over ? state.winner : null;
  if (winner !== log.result.winner || Math.min(state.turn, state.turnLimit) !== log.result.turns) {
    throw new Error(`the rebuilt game ends differently: winner ${winner}, round ${state.turn}; the log says winner ${log.result.winner}, round ${log.result.turns}`);
  }
  return state;
}
