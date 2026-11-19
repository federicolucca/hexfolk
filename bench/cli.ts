// hexfolk benchmark command line. Built for Node by vite.node.config.ts.
//   npm run bench -- play --seed 7 --a rule --b random [--out game.jsonl]   one game, no graphics
//   npm run bench -- replay game.jsonl                                       rebuild a game from its log and check it
//   npm run bench -- run --set tune --seeds 50 --pairs rule:random,... --out DIR [--parallel 4] [--dry-run]
//   npm run bench -- report DIR                                              tables and charts from DIR/results.csv
// Seed sets are fixed in docs/PROTOCOL.md: "tune" for development, "test" held out for the final numbers.
import { execSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASELINES } from '../src/core/bench/baselines';
import { type GameLog, parseLog, rebuildFromLog, runGame, serializeLog, type StepAgent } from '../src/core/bench/harness';
import { CSV_HEADER, csvRow, renderResults } from './report';

export const SEED_SETS: Readonly<Record<string, number>> = { tune: 1, test: 100_001 };
export const RULES_VERSION = 'v1.0.0';

export function makeAgent(name: string, seed: number, seat: number): StepAgent {
  const baseline = BASELINES[name];
  if (baseline) return baseline(seed, seat);
  throw new Error(`unknown agent ${name}; baselines: ${Object.keys(BASELINES).join(', ')}`);
}

function meta(): Record<string, string> {
  let commit = 'unknown';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch { /* not a git checkout */ }
  return { rules: RULES_VERSION, commit };
}

function flags(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i] as string;
    if (!f.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out.set(f.slice(2), 'true');
    else (out.set(f.slice(2), next), i++);
  }
  return out;
}

const int = (v: string | undefined, name: string, fallback?: number): number => {
  if (v === undefined && fallback !== undefined) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`--${name} needs an integer`);
  return n;
};

async function play(f: Map<string, string>): Promise<void> {
  const seed = int(f.get('seed'), 'seed');
  const a = f.get('a') ?? '';
  const b = f.get('b') ?? '';
  const log = await runGame({ seed, agents: [makeAgent(a, seed, 0), makeAgent(b, seed, 1)], turnLimit: int(f.get('turn-limit'), 'turn-limit', 30), meta: meta() });
  const out = f.get('out') ?? `game-s${seed}-${a}-vs-${b}.jsonl`;
  await writeFile(out, serializeLog(log));
  console.log(describe(log));
  console.log(`Log: ${out}`);
}

function describe(log: GameLog): string {
  const { header: h, result: r } = log;
  const who = r.winner === null ? 'draw' : `${h.agents[r.winner]} (seat ${r.winner}) wins`;
  const bad = r.seats.map((s) => `${s.agent}: ${s.decisions} decisions, ${Object.values(s.bad).reduce((x, y) => x + y, 0)} bad, ${s.caps} caps, ${s.ms.toFixed(0)} ms, $${s.costUsd.toFixed(4)}`);
  return [`Seed ${h.seed}: ${h.agents[0]} vs ${h.agents[1]}: ${who} by ${r.reason} in round ${r.turns}.`, ...bad].join('\n');
}

async function replay(file: string | undefined): Promise<void> {
  if (!file) throw new Error('usage: bench replay FILE');
  const log = parseLog(await readFile(file, 'utf8'));
  rebuildFromLog(log);
  console.log(describe(log));
  console.log(`Rebuilt from seed ${log.header.seed} and ${log.moves.length} logged decisions: identical ending.`);
}

interface Job {
  id: string;
  set: string;
  seed: number;
  seats: [string, string];
}

function jobs(f: Map<string, string>): Job[] {
  const set = f.get('set') ?? '';
  const first = SEED_SETS[set];
  if (first === undefined) throw new Error(`--set must be one of ${Object.keys(SEED_SETS).join(', ')}`);
  const count = int(f.get('seeds'), 'seeds');
  const offset = int(f.get('seed-offset'), 'seed-offset', 0);
  const pairs = (f.get('pairs') ?? '').split(',').filter(Boolean).map((p) => p.split(':') as [string, string]);
  if (pairs.length === 0 || pairs.some((p) => p.length !== 2)) throw new Error('--pairs needs a,b pairs like rule:random,lookahead:rule');
  const out: Job[] = [];
  for (let s = offset; s < offset + count; s++) {
    const seed = first + s;
    for (const [a, b] of pairs) {
      for (const seats of [[a, b], [b, a]] as [string, string][]) out.push({ id: `${set}-s${seed}-${seats[0]}-vs-${seats[1]}`, set, seed, seats });
    }
  }
  return out;
}

async function run(f: Map<string, string>): Promise<void> {
  const dir = resolve(f.get('out') ?? 'bench-out');
  const list = jobs(f);
  const csv = join(dir, 'results.csv');
  await mkdir(join(dir, 'logs'), { recursive: true });
  if (!existsSync(csv)) await writeFile(csv, `${CSV_HEADER}\n`);
  const done = new Set((await readFile(csv, 'utf8')).split('\n').slice(1).map((l) => l.split(',')[0]));
  const todo = list.filter((j) => !done.has(j.id));
  const llmSeats = todo.reduce((n, j) => n + j.seats.filter((s) => !BASELINES[s]).length, 0);
  console.log(`${list.length} games in this batch, ${todo.length} still to play, ${llmSeats} language-model seats.`);
  if (f.get('dry-run') === 'true') return;
  const parallel = int(f.get('parallel'), 'parallel', 1);
  const info = meta();
  let next = 0;
  let finished = 0;
  const worker = async () => {
    while (next < todo.length) {
      const job = todo[next++] as Job;
      const agents: [StepAgent, StepAgent] = [makeAgent(job.seats[0], job.seed, 0), makeAgent(job.seats[1], job.seed, 1)];
      const log = await runGame({ seed: job.seed, agents, meta: info });
      const file = join('logs', `${job.id}.jsonl`);
      await writeFile(join(dir, file), serializeLog(log));
      await appendFile(csv, `${csvRow(job.id, job.set, log, file)}\n`);
      finished++;
      if (finished % 10 === 0 || finished === todo.length) console.log(`${finished}/${todo.length} games`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, parallel) }, worker));
}

async function report(dir: string | undefined): Promise<void> {
  const base = resolve(dir ?? 'bench-out');
  const { markdown, svg } = renderResults(await readFile(join(base, 'results.csv'), 'utf8'));
  await writeFile(join(base, 'tables.md'), markdown);
  await writeFile(join(base, 'winrates.svg'), svg);
  console.log(markdown);
  console.log(`Wrote tables.md and winrates.svg to ${base}`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  if (command === 'play') return play(f);
  if (command === 'replay') return replay(rest[0]);
  if (command === 'run') return run(f);
  if (command === 'report') return report(rest[0]);
  throw new Error('usage: bench play|replay|run|report (see the header of bench/cli.ts)');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
