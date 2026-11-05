// Statistics for the tournament table: Wilson interval, a maximum-likelihood Elo fit and the
// markdown report. Pure functions over plain result records.
import type { SeatStats } from './match';

export interface GameRecord {
  /** Agent names by seat. */
  seats: string[];
  /** Winning seat, or null for a draw. */
  winner: number | null;
  turns: number;
  reason: string;
  stats: SeatStats[];
}

/** 95% Wilson score interval for k successes in n trials, as fractions. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/**
 * Elo ratings fitted by maximum likelihood to all pairwise results (a draw is half a point), with
 * one virtual draw per pair so a clean sweep stays finite. Centred on 1000. Independent of the
 * order of the games, unlike a running Elo.
 */
export function fitElo(names: string[], games: Pick<GameRecord, 'seats' | 'winner'>[]): Map<string, number> {
  const idx = new Map(names.map((n, i) => [n, i]));
  const n = names.length;
  const score = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const played = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const g of games) {
    const [a, b] = [idx.get(g.seats[0] ?? ''), idx.get(g.seats[1] ?? '')];
    if (a === undefined || b === undefined || a === b || g.seats.length !== 2) continue;
    const sa = g.winner === null ? 0.5 : g.winner === 0 ? 1 : 0;
    score[a]![b]! += sa;
    score[b]![a]! += 1 - sa;
    played[a]![b]!++;
    played[b]![a]!++;
  }
  const rating = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 2000; iter++) {
    const next = [...rating];
    for (let i = 0; i < n; i++) {
      let actual = 0;
      let expected = 0;
      let total = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || played[i]![j] === 0) continue;
        const games = played[i]![j]! + 1;
        actual += score[i]![j]! + 0.5;
        expected += games / (1 + 10 ** ((rating[j]! - rating[i]!) / 400));
        total += games;
      }
      if (total > 0) next[i] = rating[i]! + (200 * (actual - expected)) / total;
    }
    const mean = next.reduce((s, v) => s + v, 0) / n;
    for (let i = 0; i < n; i++) rating[i] = next[i]! - mean;
  }
  return new Map(names.map((name, i) => [name, 1000 + rating[i]!]));
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;
const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, v) => s + v, 0) / xs.length);
const quantile = (xs: number[], q: number): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
};

export interface Summary {
  name: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  ci: [number, number];
  elo: number;
  avgTurns: number;
  decisions: number;
  actions: number;
  illegal: number;
  timeouts: number;
  errors: number;
  latencyMeanMs: number;
  latencyP95Ms: number;
}

export function summarise(names: string[], games: GameRecord[]): Summary[] {
  const elo = fitElo(names, games);
  return names.map((name) => {
    const mine = games.flatMap((g) => g.seats.flatMap((s, seat) => (s === name ? [{ g, seat }] : [])));
    const wins = mine.filter(({ g, seat }) => g.winner === seat).length;
    const draws = mine.filter(({ g }) => g.winner === null).length;
    const sum = (f: (s: SeatStats) => number): number => mine.reduce((t, { g, seat }) => t + f(g.stats[seat] as SeatStats), 0);
    const latencies = mine.flatMap(({ g, seat }) => (g.stats[seat] as SeatStats).latencyMs);
    return {
      name,
      matches: mine.length,
      wins,
      draws,
      losses: mine.length - wins - draws,
      winRate: mine.length ? wins / mine.length : 0,
      ci: wilson(wins, mine.length),
      elo: elo.get(name) ?? 1000,
      avgTurns: mean(mine.map(({ g }) => g.turns)),
      decisions: sum((s) => s.decisions),
      actions: sum((s) => s.actions),
      illegal: sum((s) => s.illegal),
      timeouts: sum((s) => s.timeouts),
      errors: sum((s) => s.errors),
      latencyMeanMs: mean(latencies),
      latencyP95Ms: quantile(latencies, 0.95),
    };
  });
}

export interface ReportInfo {
  command: string;
  firstSeed: number;
  seeds: number;
  turnLimit: number;
}

/** The markdown results: per-agent table, head-to-head table and how the games ended. */
export function renderReport(names: string[], games: GameRecord[], info: ReportInfo): string {
  const rows = summarise(names, games).sort((a, b) => b.elo - a.elo);
  const lines: string[] = [];
  lines.push(`# hexfolk tournament`, '');
  lines.push(`- Command: \`${info.command}\``);
  lines.push(`- Matches: ${games.length} (2 players, seeds ${info.firstSeed}..${info.firstSeed + info.seeds - 1}, turn limit ${info.turnLimit}), every pairing played from both seats on every seed (mirrored)`);
  lines.push(`- Win rate counts wins only (draws are listed separately) with a 95% Wilson interval; Elo is a maximum-likelihood fit centred on 1000.`, '');
  lines.push('| Agent | Matches | W / D / L | Win rate (95% CI) | Elo | Avg turns | Illegal actions | Timeouts | Latency mean / p95 (ms) |');
  lines.push('| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const r of rows) {
    const illegal = r.actions === 0 ? '0' : `${r.illegal}/${r.actions} (${pct(r.illegal / r.actions)})`;
    lines.push(`| ${r.name} | ${r.matches} | ${r.wins} / ${r.draws} / ${r.losses} | ${pct(r.winRate)} (${pct(r.ci[0])} to ${pct(r.ci[1])}) | ${r.elo.toFixed(0)} | ${r.avgTurns.toFixed(1)} | ${illegal} | ${r.timeouts + r.errors} | ${r.latencyMeanMs.toFixed(2)} / ${r.latencyP95Ms.toFixed(2)} |`);
  }
  lines.push('', '## Head to head (row agent\'s wins against column agent, draws in brackets)', '');
  lines.push(`| | ${names.join(' | ')} |`, `| --- |${names.map(() => ' ---:').join(' |')} |`);
  for (const a of names) {
    const cells = names.map((b) => {
      if (a === b) return '-';
      const vs = games.filter((g) => g.seats.includes(a) && g.seats.includes(b));
      const w = vs.filter((g) => g.winner !== null && g.seats[g.winner] === a).length;
      const d = vs.filter((g) => g.winner === null).length;
      return `${w}/${vs.length}${d ? ` (${d})` : ''}`;
    });
    lines.push(`| ${a} | ${cells.join(' | ')} |`);
  }
  const byReason = new Map<string, number>();
  for (const g of games) byReason.set(g.reason, (byReason.get(g.reason) ?? 0) + 1);
  lines.push('', `Endings: ${[...byReason].map(([k, v]) => `${k} ${v}`).join(', ')}.`, '');
  return lines.join('\n');
}
