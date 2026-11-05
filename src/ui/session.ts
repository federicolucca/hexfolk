// A game in the browser: the human's taps become engine actions, and agents play the other seats.
// Every rule question goes to the engine (legalActions, step); this only keeps the selection.
import { type Agent, playTurn } from '../core/agent';
import { legalActions, step } from '../core/engine';
import type { Action, GameEvent, GameState, HexRef } from '../core/state';
import type { Highlights } from '../render/renderer';

const same = (a: HexRef, b: HexRef): boolean => a.q === b.q && a.r === b.r;

export class Session {
  /** The tapped hex and, if the human selected one of their units there, its id. */
  selectedHex: HexRef | null = null;
  selectedUnit: number | null = null;

  constructor(
    public state: GameState,
    readonly human: number,
    private readonly agents: Readonly<Record<number, Agent>>,
  ) {}

  get humanToMove(): boolean {
    return !this.state.over && this.state.current === this.human;
  }

  /** The human's legal actions now (empty when it is not their turn). */
  legal(): Action[] {
    return legalActions(this.state, this.human);
  }

  private unitActions(unitId: number): Action[] {
    return this.legal().filter((a) => 'unit' in a && a.unit === unitId);
  }

  highlights(): Highlights {
    const legal = this.legal();
    const active = new Set(legal.flatMap((a) => ('unit' in a ? [a.unit] : [])));
    const done = this.humanToMove ? this.state.units.filter((u) => u.owner === this.human && !active.has(u.id)).map((u) => u.id) : [];
    const mine = this.selectedUnit === null ? [] : this.unitActions(this.selectedUnit);
    return {
      selected: this.selectedHex,
      reach: mine.flatMap((a) => (a.type === 'move' ? [a.to] : [])),
      targets: mine.flatMap((a) => (a.type === 'attack' ? [a.target] : [])),
      done,
    };
  }

  /** Applies one of the human's actions. */
  act(action: Action): GameEvent[] {
    const result = step(this.state, this.human, [action]);
    this.state = result.state;
    // Drop the unit selection once it has nothing left to do.
    if (this.selectedUnit !== null && this.unitActions(this.selectedUnit).length === 0) this.selectedUnit = null;
    return result.events;
  }

  /**
   * A tap on a hex: moves the selected unit there if it can, otherwise selects the hex (and the
   * human's unit on it, if any). Tapping the selected hex again clears the selection.
   */
  tap(at: HexRef): GameEvent[] {
    const hex = { q: at.q, r: at.r };
    if (this.selectedUnit !== null) {
      const move = this.unitActions(this.selectedUnit).find((a) => a.type === 'move' && same(a.to, hex));
      if (move) {
        const events = this.act(move);
        this.selectedHex = hex;
        // Keep the unit selected if it can still do something (e.g. attack after moving).
        this.selectedUnit = this.unitActions(this.selectedUnit).length > 0 ? this.selectedUnit : null;
        return events;
      }
    }
    if (this.selectedUnit !== null && this.unitActions(this.selectedUnit).some((a) => a.type === 'attack' && same(a.target, hex))) {
      // Select the enemy but keep the attacker: the panel then offers the attack with its preview.
      this.selectedHex = hex;
      return [];
    }
    if (this.selectedHex && same(this.selectedHex, hex)) {
      this.clearSelection();
      return [];
    }
    this.selectedHex = hex;
    const unit = this.state.units.find((u) => same(u, hex));
    this.selectedUnit = unit && unit.owner === this.human ? unit.id : null;
    return [];
  }

  clearSelection(): void {
    this.selectedHex = null;
    this.selectedUnit = null;
  }

  /** Ends the human's turn and lets the agents play until it is the human's turn again. */
  async endTurn(onAgentTurn?: (state: GameState) => void): Promise<GameEvent[]> {
    const events = this.humanToMove ? this.act({ type: 'end_turn' }) : [];
    this.clearSelection();
    events.push(...(await this.runAgents(onAgentTurn)));
    return events;
  }

  /** Plays agent turns until it is the human's turn or the game is over. */
  async runAgents(onAgentTurn?: (state: GameState) => void): Promise<GameEvent[]> {
    const events: GameEvent[] = [];
    let guard = 0;
    while (!this.state.over && this.state.current !== this.human && guard++ < 100) {
      const agent = this.agents[this.state.current];
      if (!agent) throw new Error(`no agent for player ${this.state.current}`);
      const result = await playTurn(this.state, agent);
      this.state = result.state;
      events.push(...result.events);
      onAgentTurn?.(this.state);
    }
    return events;
  }
}
