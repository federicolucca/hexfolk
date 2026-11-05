// Agents: anything that plays a seat. The browser's AI, the simulator's bots and MCP clients all
// implement this, so a smarter AI (minimax) or an external agent can plug in without engine changes.
import { legalActions, type Observation, observe, step } from './engine';
import type { Action, GameEvent, GameState, Rejection } from './state';

export interface Agent {
  readonly name: string;
  /**
   * Chooses the actions for one whole turn, in order. The observation is a copy, so an agent may
   * simulate on it with step(). The runner ends the turn if the list does not.
   */
  decide(observation: Observation, legal: Action[]): Action[] | Promise<Action[]>;
}

/** Ends its turn straight away. */
export const passAgent: Agent = { name: 'pass', decide: () => [{ type: 'end_turn' }] };

export interface TurnResult {
  state: GameState;
  actions: Action[];
  events: GameEvent[];
  rejected: Rejection[];
  /** Milliseconds the agent took to decide. */
  latencyMs: number;
}

/**
 * Lets an agent play the current player's turn and applies it. Illegal actions are skipped and
 * reported; if the agent did not end its turn, the runner does (the default action).
 */
export async function playTurn(state: GameState, agent: Agent, now: () => number = () => performance.now()): Promise<TurnResult> {
  const player = state.current;
  const started = now();
  const actions = await agent.decide(observe(state, player), legalActions(state, player));
  const latencyMs = now() - started;
  const result = step(state, player, actions);
  const events = [...result.events];
  let next = result.state;
  const applied = [...actions];
  if (!next.over && next.current === player) {
    const ended = step(next, player, [{ type: 'end_turn' }]);
    next = ended.state;
    events.push(...ended.events);
    applied.push({ type: 'end_turn' });
  }
  return { state: next, actions: applied, events, rejected: result.rejected, latencyMs };
}
