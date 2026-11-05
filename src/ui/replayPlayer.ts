// Steps through a replay: one step per player turn. Pure (no DOM); the HUD and main.ts drive it.
import { type Replay, replayStates } from '../core/replay';
import type { GameState } from '../core/state';
import { playerName } from './describe';

export class ReplayPlayer {
  readonly states: GameState[];
  /** 0 is the start position; i is the position after the i-th turn. */
  index = 0;

  constructor(readonly replay: Replay) {
    this.states = replayStates(replay);
  }

  get state(): GameState {
    return this.states[this.index] as GameState;
  }

  get steps(): number {
    return this.replay.turns.length;
  }

  get atStart(): boolean {
    return this.index === 0;
  }

  get atEnd(): boolean {
    return this.index >= this.steps;
  }

  seek(index: number): void {
    this.index = Math.max(0, Math.min(this.steps, Math.trunc(index)));
  }

  next(): boolean {
    if (this.atEnd) return false;
    this.index++;
    return true;
  }

  prev(): boolean {
    if (this.atStart) return false;
    this.index--;
    return true;
  }

  /** Title and detail for the HUD: the position and who just played what. */
  describe(): { title: string; detail: string } {
    const title = `Replay ${this.index}/${this.steps}`;
    const last = this.replay.turns[this.index - 1];
    const seat = (p: number): string => `${playerName(p)} (${this.replay.header.seats[p] ?? `seat ${p}`})`;
    if (!last) return { title, detail: `Seed ${this.replay.header.seed}, ${this.replay.header.players} players. Press play or next.` };
    const counts = new Map<string, number>();
    for (const a of last.actions) if (a.type !== 'end_turn') counts.set(a.type, (counts.get(a.type) ?? 0) + 1);
    const did = [...counts].map(([k, v]) => `${v} ${k}`).join(', ') || 'ended the turn';
    const result = this.atEnd && this.replay.result ? ` Result: ${this.replay.result.winner === null ? 'draw' : `${playerName(this.replay.result.winner)} won`} (${this.replay.result.reason}).` : '';
    return { title, detail: `Round ${last.turn}: ${seat(last.player)} ${did}.${result}` };
  }
}
