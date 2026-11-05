// Tournament runner: `npm run sim -- --seeds 7`. Plays every pair of agent configs from both seats
// on every seed (mirrored), writes JSONL replays and a markdown results table to sim-out/.
// Bundled for Node by vite.node.config.ts (the core uses extensionless imports).
// No network, no API keys: only built-in bots. An external MCP/LLM agent can be plugged in later
// by adding an Agent whose decide() calls out (see "Agents & MCP" in the README).
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Agent } from '../src/core/agent';
import { GreedyAgent } from '../src/core/ai';
import { RandomAgent } from '../src/core/ai/random';
import { runMatch } from '../src/core/match';
import { serializeReplay } from '../src/core/replay';
import { DEFAULT_TURN_LIMIT } from '../src/core/rules';
import { type GameRecord, renderReport } from '../src/core/stats';

type Factory = (seed: number, seat: number) => Agent;

/** The built-in agent configs. */
export const CONFIGS: Readonly<Record<string, Factory>> = {
  random: (seed, seat) => new RandomAgent(seed * 2 + seat + 1),
  'greedy-easy': () => new GreedyAgent('easy'),
  'greedy-normal': () => new GreedyAgent('normal'),
};

interface Args {
  seeds: number;
  firstSeed: number;
  turnLimit: number;
  agents: string[];
  out: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { seeds: 7, firstSeed: 1, turnLimit: DEFAULT_TURN_LIMIT, agents: Object.keys(CONFIGS), out: 'sim-out', timeoutMs: 10_000 };
  const num = (flag: string, v: string | undefined, min: number): number => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min) throw new Error(`${flag} needs an integer >= ${min}`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--seeds': args.seeds = num(flag, value, 1); break;
      case '--first-seed': args.firstSeed = num(flag, value, 0); break;
      case '--turn-limit': args.turnLimit = num(flag, value, 1); break;
      case '--timeout-ms': args.timeoutMs = num(flag, value, 1); break;
      case '--out': args.out = value ?? args.out; break;
      case '--agents': args.agents = (value ?? '').split(',').filter(Boolean); break;
      default: throw new Error(`unknown option ${flag}. Options: --seeds N --first-seed N --turn-limit N --agents a,b,c --out DIR --timeout-ms N`);
    }
    i++;
  }
  const unknown = args.agents.filter((a) => !(a in CONFIGS));
  if (unknown.length > 0) throw new Error(`unknown agent(s): ${unknown.join(', ')}. Available: ${Object.keys(CONFIGS).join(', ')}`);
  if (new Set(args.agents).size < 2) throw new Error('need at least two different agents');
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const out = resolve(args.out);
  await rm(join(out, 'replays'), { recursive: true, force: true });
  await mkdir(join(out, 'replays'), { recursive: true });
  const games: GameRecord[] = [];
  const pairs = args.agents.flatMap((a, i) => args.agents.slice(i + 1).map((b) => [a, b] as const));
  for (let s = 0; s < args.seeds; s++) {
    const seed = args.firstSeed + s;
    for (const [a, b] of pairs) {
      // Mirrored: the same map with the two agents swapping seats.
      for (const seats of [[a, b], [b, a]] as const) {
        const agents = seats.map((name, seat) => (CONFIGS[name] as Factory)(seed, seat));
        const { match, replay } = await runMatch({ seed, players: 2, turnLimit: args.turnLimit, agents, timeoutMs: args.timeoutMs, seats: [...seats] });
        const id = `${String(games.length + 1).padStart(3, '0')}-s${seed}-${seats[0]}-vs-${seats[1]}`;
        await writeFile(join(out, 'replays', `${id}.jsonl`), serializeReplay(replay));
        games.push({ seats: [...seats], winner: match.state.winner, turns: replay.result?.turns ?? match.state.turn, reason: replay.result?.reason ?? 'unfinished', stats: match.stats });
      }
    }
  }
  const command = `npm run sim -- --seeds ${args.seeds} --first-seed ${args.firstSeed} --turn-limit ${args.turnLimit} --agents ${args.agents.join(',')}`;
  const report = renderReport(args.agents, games, { command, firstSeed: args.firstSeed, seeds: args.seeds, turnLimit: args.turnLimit });
  await writeFile(join(out, 'results.md'), report);
  await writeFile(join(out, 'results.json'), `${JSON.stringify(games, null, 1)}\n`);
  console.log(report);
  console.log(`Wrote ${games.length} replays and results.md to ${out}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
