// Replays: a header (seed, players, turn limit, who played), one line per player turn with the
// actions that were accepted, and a result line. Because the engine is deterministic, the header
// plus the actions rebuild every state. Serialised as JSONL (one JSON object per line).
import { newGame, step } from './engine';
import type { Action, GameState } from './state';
import { parseActions } from './validate';

export interface ReplayHeader {
  type: 'header';
  version: 1;
  game: 'hexfolk';
  seed: number;
  players: number;
  turnLimit: number;
  /** One label per seat, e.g. "greedy-normal" or "mcp:client". */
  seats: string[];
}

export interface ReplayTurn {
  type: 'turn';
  /** Round number when the turn started. */
  turn: number;
  player: number;
  /** The accepted actions, in order, ending with end_turn unless the game ended first. */
  actions: Action[];
  /** How many submitted actions were rejected as illegal. */
  rejected: number;
  timedOut?: boolean;
  latencyMs?: number;
}

export interface ReplayResult {
  type: 'result';
  winner: number | null;
  /** The round the game ended in. */
  turns: number;
  reason: 'domination' | 'turn_limit' | 'unfinished';
}

export interface Replay {
  header: ReplayHeader;
  turns: ReplayTurn[];
  result?: ReplayResult;
}

export function serializeReplay(replay: Replay): string {
  const lines: unknown[] = [replay.header, ...replay.turns];
  if (replay.result) lines.push(replay.result);
  return `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses and validates a JSONL replay. Throws an Error with a line number on bad input. */
export function parseReplay(text: string): Replay {
  const rows = text.split('\n').filter((l) => l.trim() !== '');
  let header: ReplayHeader | undefined;
  let result: ReplayResult | undefined;
  const turns: ReplayTurn[] = [];
  for (const [i, line] of rows.entries()) {
    const where = `replay line ${i + 1}`;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error(`${where}: not valid JSON`);
    }
    if (!isObject(row)) throw new Error(`${where}: expected an object`);
    if (row.type === 'header') {
      const h = row as Partial<ReplayHeader>;
      if (i !== 0 || h.game !== 'hexfolk' || h.version !== 1) throw new Error(`${where}: not a hexfolk v1 header`);
      if (!Number.isInteger(h.seed) || !Number.isInteger(h.players) || !Number.isInteger(h.turnLimit)) throw new Error(`${where}: bad header fields`);
      if ((h.players as number) < 2 || (h.players as number) > 4) throw new Error(`${where}: players must be 2 to 4`);
      header = { type: 'header', version: 1, game: 'hexfolk', seed: h.seed as number, players: h.players as number, turnLimit: h.turnLimit as number, seats: Array.isArray(h.seats) ? h.seats.map(String) : [] };
    } else if (row.type === 'turn') {
      const actions = parseActions(row.actions);
      if (!actions.ok || !Number.isInteger(row.player) || !Number.isInteger(row.turn)) throw new Error(`${where}: bad turn entry`);
      turns.push({ type: 'turn', turn: row.turn as number, player: row.player as number, actions: actions.value, rejected: Number(row.rejected ?? 0), ...(row.timedOut === true ? { timedOut: true } : {}), ...(typeof row.latencyMs === 'number' ? { latencyMs: row.latencyMs } : {}) });
    } else if (row.type === 'result') {
      result = { type: 'result', winner: typeof row.winner === 'number' ? row.winner : null, turns: Number(row.turns), reason: row.reason === 'domination' || row.reason === 'turn_limit' ? row.reason : 'unfinished' };
    } else {
      throw new Error(`${where}: unknown line type`);
    }
  }
  if (!header) throw new Error('replay has no header');
  return { header, turns, ...(result ? { result } : {}) };
}

/**
 * Every state of the match: states[0] is the start, states[i] the position after turns[i - 1].
 * Throws if a turn is not the current player's (a corrupt replay).
 */
export function replayStates(replay: Replay): GameState[] {
  const { seed, players, turnLimit } = replay.header;
  let state = newGame({ seed, players, turnLimit });
  const states = [state];
  for (const [i, turn] of replay.turns.entries()) {
    if (turn.player !== state.current) throw new Error(`replay turn ${i + 1}: expected player ${state.current}, found ${turn.player}`);
    state = step(state, turn.player, turn.actions).state;
    states.push(state);
  }
  return states;
}
