// What an agent reads: a compact JSON view of an observation plus a short text summary for LLMs.
// hexfolk has no fog of war, so the view holds the whole board and every unit (see DECISIONS.md);
// observe() in the engine is the single place to change if fog is added.
import { income, score } from './economy';
import { observe } from './engine';
import type { GameState } from './state';

const TERRAIN_CHAR = { grass: 'g', forest: 'f', mountain: 'm', water: 'w' } as const;

export interface CompactObservation {
  you: number;
  turn: number;
  turnLimit: number;
  current: number;
  over: boolean;
  winner: number | null;
  stars: number;
  income: number;
  techs: string[];
  players: { id: number; alive: boolean; stars: number; techs: string[]; score: number; cities: number; units: number }[];
  cities: { id: number; q: number; r: number; owner: number | null; capital: boolean; level: number; pop: number; walls: boolean }[];
  units: { id: number; type: string; owner: number; q: number; r: number; hp: number; moved: boolean; attacked: boolean }[];
  /** Terrain rows: row r starts at axial q0 and each character is the next q. g grass, f forest, m mountain, w water. */
  rows: { r: number; q0: number; t: string }[];
  resources: { q: number; r: number; kind: string }[];
}

export function compactObservation(state: GameState, player: number): CompactObservation {
  const view = observe(state, player).state;
  const me = view.players[player];
  const byRow = new Map<number, typeof view.tiles>();
  for (const t of view.tiles) byRow.set(t.r, [...(byRow.get(t.r) ?? []), t]);
  const rows = [...byRow].sort((a, b) => a[0] - b[0]).map(([r, tiles]) => {
    const sorted = [...tiles].sort((a, b) => a.q - b.q);
    return { r, q0: sorted[0]?.q ?? 0, t: sorted.map((t) => TERRAIN_CHAR[t.terrain]).join('') };
  });
  return {
    you: player,
    turn: view.turn,
    turnLimit: view.turnLimit,
    current: view.current,
    over: view.over,
    winner: view.winner,
    stars: me?.stars ?? 0,
    income: income(view, player),
    techs: me?.techs ?? [],
    players: view.players.map((p) => ({
      id: p.id,
      alive: p.alive,
      stars: p.stars,
      techs: p.techs,
      score: score(view, p.id),
      cities: view.cities.filter((c) => c.owner === p.id).length,
      units: view.units.filter((u) => u.owner === p.id).length,
    })),
    cities: view.cities.map((c) => ({ id: c.id, q: c.q, r: c.r, owner: c.owner, capital: c.capital, level: c.level, pop: c.population, walls: c.walls })),
    units: view.units.map((u) => ({ id: u.id, type: u.type, owner: u.owner, q: u.q, r: u.r, hp: u.hp, moved: u.moved, attacked: u.attacked })),
    rows,
    resources: view.tiles.flatMap((t) => (t.resource ? [{ q: t.q, r: t.r, kind: t.resource }] : [])),
  };
}

/** A few lines of plain text: whose turn it is, what the seat owns and what it could do. */
export function describeObservation(state: GameState, player: number, legalCount?: number): string {
  const o = compactObservation(state, player);
  const mine = o.units.filter((u) => u.owner === player);
  const theirs = o.units.filter((u) => u.owner !== player);
  const city = (c: CompactObservation['cities'][number]): string => `#${c.id}@${c.q},${c.r}${c.capital ? ' capital' : ''} L${c.level}${c.walls ? ' walls' : ''}`;
  const unit = (u: CompactObservation['units'][number]): string => `#${u.id} ${u.type} ${u.hp}hp@${u.q},${u.r}${u.moved || u.attacked ? ' (spent)' : ''}`;
  const lines = [
    o.over ? `Game over (${o.winner === null ? 'draw' : `player ${o.winner} won`}).` : `Round ${o.turn}/${o.turnLimit}; ${o.current === player ? 'it is your turn' : `waiting for player ${o.current}`}.`,
    `You are player ${player}: ${o.stars} stars (+${o.income} per turn), techs: ${o.techs.join(', ') || 'none'}.`,
    `Your cities: ${o.cities.filter((c) => c.owner === player).map(city).join('; ') || 'none'}.`,
    `Your units: ${mine.map(unit).join('; ') || 'none'}.`,
    `Enemy units: ${theirs.map((u) => `p${u.owner} ${unit(u)}`).join('; ') || 'none'}.`,
    `Other cities: ${o.cities.filter((c) => c.owner !== player).map((c) => `${city(c)} owner ${c.owner ?? 'neutral'}`).join('; ') || 'none'}.`,
  ];
  if (legalCount !== undefined) lines.push(`${legalCount} legal actions; end the turn with {"type":"end_turn"}.`);
  return lines.join('\n');
}
