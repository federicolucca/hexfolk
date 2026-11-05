// A baseline opponent: picks uniformly among the legal actions (end_turn included) until it picks
// end_turn. Seeded, so the same seed and position give the same turn.
import type { Agent } from '../agent';
import { legalActions, type Observation, step } from '../engine';
import { createRng, type Rng } from '../rng';
import type { Action } from '../state';

const MAX_STEPS = 40;

export class RandomAgent implements Agent {
  readonly name = 'random';
  private readonly rng: Rng;

  constructor(seed = 1) {
    this.rng = createRng(seed);
  }

  decide(observation: Observation, legal: Action[]): Action[] {
    const me = observation.you;
    let state = observation.state;
    let options = legal;
    const chosen: Action[] = [];
    for (let i = 0; i < MAX_STEPS; i++) {
      const action = this.rng.pick(options);
      chosen.push(action);
      if (action.type === 'end_turn') return chosen;
      state = step(state, me, [action]).state;
      options = legalActions(state, me);
    }
    chosen.push({ type: 'end_turn' });
    return chosen;
  }
}
