// results.csv (one row per game) and the tables and chart regenerated from it. No dependencies:
// the chart is a hand-written SVG. Statistics follow docs/PROTOCOL.md: a 95% Wilson interval on
// every rate; two agents whose win-rate intervals overlap are "not distinguishable".
import type { GameLog } from '../src/core/bench/harness';
import { wilson } from '../src/core/stats';

const SEAT_FIELDS = ['decisions', 'malformed', 'illegal', 'timeout', 'error', 'caps', 'ms', 'tokens_in', 'tokens_out', 'cost_usd', 'score'] as const;
export const CSV_HEADER = ['id', 'set', 'seed', 'seat0', 'seat1', 'winner_seat', 'winner_agent', 'reason', 'turns', ...[0, 1].flatMap((s) => SEAT_FIELDS.map((f) => `s${s}_${f}`)), 'log'].join(',');

export function csvRow(id: string, set: string, log: GameLog, file: string): string {
  const r = log.result;
  const seat = (s: 0 | 1) => {
    const x = r.seats[s];
    return [x.decisions, x.bad.malformed, x.bad.illegal, x.bad.timeout, x.bad.error, x.caps, x.ms.toFixed(1), x.tokensIn, x.tokensOut, x.costUsd.toFixed(6), x.score];
  };
  return [id, set, log.header.seed, log.header.agents[0], log.header.agents[1], r.winner ?? '', r.winner === null ? 'draw' : log.header.agents[r.winner], r.reason, r.turns, ...seat(0), ...seat(1), file].join(',');
}

export type Row = Record<string, string>;

export function parseCsv(text: string): Row[] {
  const [head, ...lines] = text.trim().split('\n');
  const cols = (head ?? '').split(',');
  return lines.filter(Boolean).map((l) => {
    const cells = l.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? '']));
  });
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ci = (k: number, n: number) => {
  const [lo, hi] = wilson(k, n);
  return { rate: n ? k / n : 0, lo, hi, text: `${pct(n ? k / n : 0)} (${pct(lo)} to ${pct(hi)})` };
};

interface PairStat {
  a: string;
  b: string;
  n: number;
  aWins: number;
  bWins: number;
  draws: number;
}

export function pairStats(rows: Row[]): PairStat[] {
  const map = new Map<string, PairStat>();
  for (const r of rows) {
    const [a, b] = [r.seat0 as string, r.seat1 as string].sort();
    const key = `${a}|${b}`;
    const p = map.get(key) ?? { a: a as string, b: b as string, n: 0, aWins: 0, bWins: 0, draws: 0 };
    p.n++;
    if (r.winner_agent === 'draw') p.draws++;
    else if (r.winner_agent === p.a) p.aWins++;
    else p.bWins++;
    map.set(key, p);
  }
  return [...map.values()].sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
}

export function verdict(p: PairStat): string {
  const a = ci(p.aWins, p.n);
  const b = ci(p.bWins, p.n);
  if (a.lo > b.hi) return `${p.a} better`;
  if (b.lo > a.hi) return `${p.b} better`;
  return 'not distinguishable';
}

export function renderResults(csvText: string): { markdown: string; svg: string } {
  const rows = parseCsv(csvText);
  const pairs = pairStats(rows);
  const out: string[] = [];
  const sets = [...new Set(rows.map((r) => r.set))].join(', ');
  out.push(`Games: ${rows.length} (seed set: ${sets}). Each pairing is played on the same seeds from both seats.`, '');
  out.push('## Head to head', '', '| A | B | Games | A wins (95% CI) | B wins (95% CI) | Draws | Verdict |', '| --- | --- | ---: | --- | --- | ---: | --- |');
  for (const p of pairs) out.push(`| ${p.a} | ${p.b} | ${p.n} | ${ci(p.aWins, p.n).text} | ${ci(p.bWins, p.n).text} | ${p.draws} | ${verdict(p)} |`);

  const agents = [...new Set(rows.flatMap((r) => [r.seat0 as string, r.seat1 as string]))].sort();
  out.push('', '## Per agent', '', '| Agent | Games | Decisions | Bad decisions (95% CI) | Malformed | Illegal | Timeout | Error | Caps | ms per decision | Cost per game (USD) | Tokens in / out per game |', '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const name of agents) {
    const seats = rows.flatMap((r) => [0, 1].filter((s) => r[`seat${s}`] === name).map((s) => (f: string) => Number(r[`s${s}_${f}`] ?? 0)));
    const sum = (f: string) => seats.reduce((n, g) => n + g(f), 0);
    const decisions = sum('decisions');
    const bad = sum('malformed') + sum('illegal') + sum('timeout') + sum('error');
    const games = seats.length;
    out.push(`| ${name} | ${games} | ${decisions} | ${ci(bad, decisions).text} | ${sum('malformed')} | ${sum('illegal')} | ${sum('timeout')} | ${sum('error')} | ${sum('caps')} | ${(decisions ? sum('ms') / decisions : 0).toFixed(1)} | ${(sum('cost_usd') / Math.max(1, games)).toFixed(4)} | ${Math.round(sum('tokens_in') / Math.max(1, games))} / ${Math.round(sum('tokens_out') / Math.max(1, games))} |`);
  }

  const decided = rows.filter((r) => r.winner_seat !== '');
  const seat0 = decided.filter((r) => r.winner_seat === '0').length;
  const reasons = new Map<string, number>();
  for (const r of rows) reasons.set(r.reason as string, (reasons.get(r.reason as string) ?? 0) + 1);
  const turns = rows.reduce((n, r) => n + Number(r.turns), 0) / Math.max(1, rows.length);
  out.push('', '## Games', '', `- First seat wins ${ci(seat0, decided.length).text} of decided games.`, `- Endings: ${[...reasons].map(([k, v]) => `${k} ${v}`).join(', ')}.`, `- Average length: ${turns.toFixed(1)} rounds.`);
  out.push('', 'Bad decisions are counted per decision; decisions in one game are not independent, so that interval is optimistic.');
  return { markdown: `${out.join('\n')}\n`, svg: chart(pairs) };
}

/** Horizontal bars: A's and B's win rate in each pairing, with the 95% interval as a whisker. */
function chart(pairs: PairStat[]): string {
  const rowH = 46;
  const left = 260;
  const width = 760;
  const plot = width - left - 30;
  const height = 40 + pairs.length * rowH + 30;
  const x = (v: number) => left + v * plot;
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="sans-serif" font-size="12">`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(`<text x="${left}" y="20" fill="#222">Win rate per pairing (bars), 95% Wilson interval (whiskers)</text>`);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) parts.push(`<line x1="${x(t)}" x2="${x(t)}" y1="30" y2="${height - 30}" stroke="#ddd"/><text x="${x(t)}" y="${height - 12}" text-anchor="middle" fill="#555">${t * 100}%</text>`);
  pairs.forEach((p, i) => {
    const y = 40 + i * rowH;
    for (const [k, name, wins, color] of [[0, p.a, p.aWins, '#3b6ea8'], [1, p.b, p.bWins, '#c0703a']] as const) {
      const c = ci(wins, p.n);
      const yy = y + k * 18;
      parts.push(`<text x="${left - 8}" y="${yy + 11}" text-anchor="end" fill="#222">${name}${k === 0 ? ` vs ${p.b}` : ''}</text>`);
      parts.push(`<rect x="${left}" y="${yy}" width="${(c.rate * plot).toFixed(1)}" height="14" fill="${color}"/>`);
      parts.push(`<line x1="${x(c.lo).toFixed(1)}" x2="${x(c.hi).toFixed(1)}" y1="${yy + 7}" y2="${yy + 7}" stroke="#111" stroke-width="1.5"/>`);
    }
  });
  parts.push('</svg>');
  return `${parts.join('\n')}\n`;
}
