import { describe, expect, it } from 'vitest';
import { Session } from '../src/ui/session';
import { panelFor, techPanel } from '../src/ui/panels';
import { passAgent } from '../src/core/agent';
import { TECH_COST } from '../src/core/rules';
import { addUnit, blankGame, MIDDLE } from './helpers';

const E = { q: MIDDLE.q + 1, r: MIDDLE.r };

describe('attack UI', () => {
  it('shows targets, previews the attack, and attacks from the panel', () => {
    const state = blankGame();
    const a = addUnit(state, 0, 'warrior', MIDDLE);
    addUnit(state, 1, 'warrior', E);
    const session = new Session(state, 0, { 1: passAgent });
    session.tap(MIDDLE);
    expect(session.highlights().targets).toEqual([E]);
    session.tap(E);
    expect(session.selectedUnit).toBe(a.id);
    const panel = panelFor(session.state, 0, E, session.selectedUnit);
    expect(panel?.cards[0]).toMatchObject({ label: 'Attack', detail: 'deals 5 · takes 5' });
    const action = panel?.cards[0]?.action;
    expect(action).toBeDefined();
    if (action) session.act(action);
    expect(session.state.units.map((u) => u.hp)).toEqual([5, 5]);
  });

  it('the tech panel lists the six techs with icons and marks owned ones', () => {
    const state = blankGame();
    state.players[0]!.stars = TECH_COST;
    state.players[0]!.techs.push('hunting');
    const panel = techPanel(state, 0);
    expect(panel.cards.map((c) => c.icon)).toEqual(['hunting', 'fishing', 'riding', 'climbing', 'archery', 'fortification'].map((t) => `icons/${t}`));
    expect(panel.cards[0]?.owned).toBe(true);
    expect(panel.cards[1]?.action).toEqual({ type: 'research', tech: 'fishing' });
  });
});
