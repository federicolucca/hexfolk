import { describe, expect, it } from 'vitest';
import { previewAttack } from '../src/core/combat';
import { checkAction, legalActions, step } from '../src/core/engine';
import { TECH_COST, WALLS_COST } from '../src/core/rules';
import { addUnit, blankGame, MIDDLE } from './helpers';

const E = { q: MIDDLE.q + 1, r: MIDDLE.r };
const FAR = { q: MIDDLE.q + 2, r: MIDDLE.r };

describe('combat', () => {
  it('equal full-health warriors trade 5 for 5, and the preview matches the result', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE);
    const d = addUnit(s, 1, 'warrior', E);
    const p = previewAttack(s, a, d);
    expect(p).toMatchObject({ damage: 5, counter: 5, kills: false, attackerDies: false });
    const r = step(s, 0, [{ type: 'attack', unit: a.id, target: E }]);
    expect(r.state.units.map((u) => u.hp)).toEqual([5, 5]);
    expect(r.state.units[0]?.attacked).toBe(true);
  });

  it('is deterministic', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'rider', MIDDLE);
    const d = addUnit(s, 1, 'defender', E);
    expect(previewAttack(s, a, d)).toEqual(previewAttack(s, a, d));
  });

  it('a wounded attacker deals less damage', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE, { hp: 4 });
    const d = addUnit(s, 1, 'warrior', E);
    expect(previewAttack(s, a, d).damage).toBeLessThan(5);
  });

  it('a kill removes the defender and there is no counter-attack', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 1, 'warrior', E, { hp: 3 });
    const r = step(s, 0, [{ type: 'attack', unit: a.id, target: E }]);
    expect(r.state.units).toHaveLength(1);
    expect(r.state.units[0]?.hp).toBe(10);
    expect(r.events.some((e) => e.type === 'attacked' && e.killed)).toBe(true);
  });

  it('the counter-attack can kill a weak attacker', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE, { hp: 2 });
    addUnit(s, 1, 'defender', E);
    const r = step(s, 0, [{ type: 'attack', unit: a.id, target: E }]);
    expect(r.state.units.map((u) => u.owner)).toEqual([1]);
  });

  it('ranged attacks from 2 hexes away get no counter from a melee defender', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'archer', MIDDLE);
    const d = addUnit(s, 1, 'warrior', FAR);
    expect(previewAttack(s, a, d)).toMatchObject({ damage: 5, counter: 0 });
    expect(checkAction(s, 0, { type: 'attack', unit: a.id, target: FAR })).toBeNull();
  });

  it('a melee unit cannot attack at range 2, and cannot attack friends or empty hexes', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 1, 'warrior', FAR);
    addUnit(s, 0, 'warrior', E);
    expect(checkAction(s, 0, { type: 'attack', unit: a.id, target: FAR })).toBe('out of range');
    expect(checkAction(s, 0, { type: 'attack', unit: a.id, target: E })).toBe('no enemy unit there');
    expect(checkAction(s, 0, { type: 'attack', unit: a.id, target: { q: 0, r: 0 } })).toBe('no enemy unit there');
  });

  it('a unit attacks once per turn but may move first', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'rider', MIDDLE);
    addUnit(s, 1, 'warrior', { q: MIDDLE.q + 2, r: MIDDLE.r });
    const r = step(s, 0, [
      { type: 'move', unit: a.id, to: E },
      { type: 'attack', unit: a.id, target: FAR },
      { type: 'attack', unit: a.id, target: FAR },
    ]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]?.reason).toBe('this unit has already attacked');
  });

  it('walls on the defender\'s own city cut the damage it takes', () => {
    const s = blankGame();
    const city = s.cities.find((c) => c.owner === 1);
    if (!city) throw new Error('no city');
    const a = addUnit(s, 0, 'warrior', { q: city.q + 1, r: city.r });
    const d = addUnit(s, 1, 'warrior', city);
    const open = previewAttack(s, a, d).damage;
    city.walls = true;
    expect(previewAttack(s, a, d).damage).toBeLessThan(open);
  });

  it('legalActions lists attacks', () => {
    const s = blankGame();
    const a = addUnit(s, 0, 'warrior', MIDDLE);
    addUnit(s, 1, 'warrior', E);
    expect(legalActions(s, 0)).toContainEqual({ type: 'attack', unit: a.id, target: E });
  });
});

describe('techs and walls', () => {
  it('research costs stars and cannot be repeated', () => {
    const s = blankGame();
    s.players[0]!.stars = TECH_COST;
    const r = step(s, 0, [{ type: 'research', tech: 'riding' }, { type: 'research', tech: 'riding' }]);
    expect(r.state.players[0]?.techs).toEqual(['riding']);
    expect(r.state.players[0]?.stars).toBe(0);
    expect(r.rejected).toHaveLength(1);
  });

  it('research needs enough stars', () => {
    const s = blankGame();
    s.players[0]!.stars = TECH_COST - 1;
    expect(checkAction(s, 0, { type: 'research', tech: 'hunting' })).toMatch(/needs/);
  });

  it('unit techs unlock training', () => {
    const s = blankGame();
    const city = s.cities.find((c) => c.owner === 0)!;
    s.players[0]!.stars = 20;
    expect(checkAction(s, 0, { type: 'train', city: city.id, unit: 'rider' })).toMatch(/riding/);
    s.players[0]!.techs.push('riding');
    expect(checkAction(s, 0, { type: 'train', city: city.id, unit: 'rider' })).toBeNull();
    expect(checkAction(s, 0, { type: 'train', city: city.id, unit: 'archer' })).toMatch(/archery/);
    expect(checkAction(s, 0, { type: 'train', city: city.id, unit: 'defender' })).toMatch(/fortification/);
  });

  it('walls need fortification and stars, and only once', () => {
    const s = blankGame();
    const city = s.cities.find((c) => c.owner === 0)!;
    s.players[0]!.stars = 10;
    expect(checkAction(s, 0, { type: 'build_walls', city: city.id })).toMatch(/fortification/);
    s.players[0]!.techs.push('fortification');
    const r = step(s, 0, [{ type: 'build_walls', city: city.id }, { type: 'build_walls', city: city.id }]);
    expect(r.state.cities.find((c) => c.id === city.id)?.walls).toBe(true);
    expect(r.state.players[0]?.stars).toBe(10 - WALLS_COST);
    expect(r.rejected).toHaveLength(1);
  });

  it('only the owner can build walls', () => {
    const s = blankGame();
    const enemy = s.cities.find((c) => c.owner === 1)!;
    s.players[0]!.techs.push('fortification');
    s.players[0]!.stars = 10;
    expect(checkAction(s, 0, { type: 'build_walls', city: enemy.id })).toBe('no such city of yours');
  });
});
