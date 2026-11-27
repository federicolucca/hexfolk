# hexfolk

A minimal turn-based 4X strategy game on a hex map, playable in desktop and mobile browsers.
Explore, expand, exploit and exterminate on a small procedurally generated island, against AI rivals,
in under 30 turns.

**Demo:** https://federicolucca.github.io/hexfolk/ (add `?seed=123` for a given map, `&theme=icelands`
to pick the theme, `&players=2` for fewer capitals)

## What it is

hexfolk is a single-player game: you lead one tribe against 1 to 3 AI opponents. Every game is
short, readable at a glance and playable one-handed on a phone. Each game is set in one of four
themes (greenlands, drylands, icelands, deadlands) with its own hand-drawn-style tile art, drawn on
a canvas. There is no backend and nothing to install.

### Rules (v1.0.0, frozen for the benchmark at tag `bench-v1`)

- **Map:** 11x11 pointy-top hexes, generated from a seed. Terrains: grass, forest, hill, mountain, water.
  Forests, hills and mountains end a unit's move when it enters them (mountains need Climbing).
  Each player starts with a capital, and neutral villages wait to be captured.
- **Economy:** every city produces *stars* each turn (a base amount plus its population).
  Stars are the only currency; they buy techs, units and roads.
- **Resources:** grain (grass), wood (forest), sheep (hills), stone (hills and mountains) and fish
  (water). Harvesting one next to your city costs 2 stars and adds 1 population. Grain and wood
  need no tech; sheep need Hunting, stone Climbing, fish Fishing.
- **Variety:** a city that has harvested 3 or more different resource kinds earns +1 star per turn.
- **Number tokens:** every resource tile carries a number from 2 to 12 (never 7). At the start of
  each round two dice are rolled (from the game's seeded generator, so replays are identical), and
  every harvested tile showing that number pays its owner +1 star. The last roll is in the status bar.
- **Roads:** build one on a land tile in your territory (a city or a neighbour of one) for 2 stars,
  with no tech. A step between two road tiles (cities count as road) costs half a movement point.
  A city joined to your capital by an unbroken chain of road and city tiles earns +1 star per turn.
- **Cities:** they grow by gathering resources from adjacent tiles, and level up at population
  thresholds to unlock bonuses.
- **Techs (6):** Hunting, Fishing, Riding, Climbing, Archery, Fortification. Each one unlocks a
  resource, terrain or unit.
- **Units (4):** Warrior, Archer, Rider, Defender, each with attack, defence, movement, range and
  health.
- **Combat:** deterministic, with no dice. The outcome comes from a simple formula based on the
  attack/defence ratio and the units' health, so you always know what will happen before you
  strike.
- **Victory:** capture every enemy capital, or have the highest score at turn 30.
- **Saving:** the game autosaves locally at the end of every turn. You can start a new game from
  any seed.

### Controls

- Tap or click a tile to select it. Tap again to move or attack.
- Drag to pan. Pinch or use the mouse wheel to zoom.

## Design goals

- **Small and complete.** A tight rule set where every rule has a test.
- **Pure game logic.** The rules, state, map generation and AI are plain TypeScript with no
  rendering code. They can be tested in isolation, and the AI can be swapped for a smarter one
  (for example, minimax) later on.
- **Fast on phones.** An AI turn takes under 100 ms on a mobile device.
- **Zero runtime dependencies.** TypeScript, Vite and native Canvas 2D. No UI framework: the
  tiles are packed into one image atlas per theme at build time.

## Tech stack

- TypeScript (strict), Vite, Canvas 2D
- Vitest for the game logic
- GitHub Actions runs the tests and deploys to GitHub Pages

```
src/core    rules, state, map generation, AI (pure, no DOM)
src/render  canvas drawing, touch and mouse input
src/ui      minimal HTML/CSS HUD
tests/      Vitest tests for src/core and the pure helpers
assets/     tile art: assets/raw/tiles/<theme>/<terrain>_<n>.png plus manifest.json
scripts/    dev tooling: tile generator, atlas builder
public/     static files; public/atlas/ is built from assets/ and not committed
```

`npm run atlas` (run automatically before `dev` and `build`) packs each theme's tiles into
`public/atlas/<theme>.png` (128 px tiles), `<theme>@2x.png` (256 px, used on HiDPI screens and
close zoom) and `<theme>.json` (frames, the centre of each hex face, variants per terrain).

## Running locally

```sh
npm install
npm run dev      # start the dev server
npm test         # run the tests
npm run build    # build for production (builds the tile atlas first)
npm run atlas    # rebuild the tile atlas after changing assets/raw/tiles
```

## Roadmap

Done:

- **v0.1:** the playable game, built in milestones (plan, map, units, cities and economy, techs and
  combat, greedy AI, autosave, victory, GitHub Pages deploy).
- **v1.0.0:** the rules described above, frozen for the benchmark.
- **Agents and benchmark (tag `bench-v1`):** the headless `Agent` interface, the simulator, the MCP server
  (`packages/mcp`), the replay viewer, six reference baselines and the pre-registered benchmark of
  language and decision models (`docs/PROTOCOL.md`, protocol v1–v5).

Next (not scheduled yet): more agents run through the frozen v1.0.0 rules and harness, and, for the game
itself, more tribes, larger maps and more techs and units. Rule changes would get a new version, so
`bench-v1` stays reproducible.

## Agents & MCP

hexfolk is also a small testbed for game-playing agents. The rules live in a pure, deterministic TypeScript
engine (`src/core`: `newGame`, `observe`, `legalActions`, `step`), so the same code runs in the browser, in a
headless simulator and behind an MCP server. There is no fog of war: `observe()` returns the whole board.
The harness ships with six built-in baselines: `random`, `greedy-easy`, `greedy-normal`, `rule`, `lookahead`
and `search`. The benchmark table below uses five of them (all but `greedy-easy`).

**MCP server** (`packages/mcp`, stdio, official `@modelcontextprotocol/sdk`). Its dependencies live in
`packages/mcp/package.json` only: they never enter the browser bundle or the root `package.json`.

```sh
npm install                 # root dev tools
npm run mcp:build           # installs packages/mcp deps and bundles packages/mcp/dist/server.js
node packages/mcp/examples/pass-client.mjs   # smoke test: a tiny MCP client plays one match
```

Claude Code: `claude mcp add hexfolk -- node /absolute/path/to/hexfolk/packages/mcp/dist/server.js`

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hexfolk": { "command": "node", "args": ["/absolute/path/to/hexfolk/packages/mcp/dist/server.js"] }
  }
}
```

Tools: `create_match(seed?, players, turn_limit, difficulty?)`, `join_match(match_id, seat)`,
`get_observation` (compact JSON plus a short text summary), `list_legal_actions`, `submit_actions`,
`get_match_status`, `get_replay` (JSONL). Seats nobody joins are played by the built-in AI once the match
starts (the first `join_match` starts it). Every action is validated server-side; illegal ones are rejected
with a reason and never applied. A joined seat has a per-turn timeout (`turn_timeout_ms`, default 120 s);
when it passes, the turn ends by default (`end_turn`). The turn only ends when the client submits
`{"type":"end_turn"}`, so an agent can act in several calls.

**Simulator.** `npm run sim -- --seeds 7` plays every pair of `random`, `greedy-easy` and `greedy-normal`
from both seats on each seed (mirrored; 42 matches for 7 seeds), and writes JSONL replays plus `results.md`
(win rate with a 95% Wilson interval, Elo, average turns, illegal-action rate, timeouts, decision latency)
to `sim-out/` (gitignored). Options: `--first-seed`, `--turn-limit`, `--agents a,b`, `--out`,
`--timeout-ms`. The sim makes no network calls and needs no API keys. External language-model agents plug
in through the same `Agent` interface (`npm run bench`, see Benchmark below) or over MCP (`packages/mcp`).

**Replay viewer.** Open the game with `?replay=<url>` (for example `?replay=replays/sample.jsonl`) or use
the Replay button to load a `.jsonl` file, then step with first / previous / play / next / last.

## Benchmark

hexfolk is the game of the paper *Legal Is Not Good: A Pre-Registered Benchmark of Low-Cost Language and
Decision Models on a New Strategy Game* ([arXiv:2611.28713](https://arxiv.org/abs/2611.28713)). The code it
used is the tag [`bench-v1`](https://github.com/federicolucca/hexfolk/tree/bench-v1): the engine (rules
v1.0.0, frozen), the benchmark harness and its agents, and the pre-registered protocol
[`docs/PROTOCOL.md`](docs/PROTOCOL.md) with its version history v1–v5.

To replay the games, check out the tag and use `npm run bench` (`bench/cli.ts` lists every option):

```sh
git checkout bench-v1
npm install
# Batch 5 and batch 1: free reference players, seeds 100001–100100, no API key needed
npm run bench -- run --set test --seeds 100 --out bench-out/batch5 \
  --pairs search:greedy-normal,search:rule,search:lookahead,search:random
npm run bench -- run --set test --seeds 100 --out bench-out/batch1 \
  --pairs greedy-normal:rule,greedy-normal:lookahead,greedy-normal:random,rule:lookahead,rule:random,lookahead:random
npm run bench -- report bench-out/batch5
```

Model agents use the same command with their names in `--pairs` and `--seeds 25` (seeds 100001–100025):
hosted ones need `OPENROUTER_API_KEY`, local ones (`localllama8b-*`, `localqwen7b-*`) an Ollama server in
`OLLAMA_URL`. The exact pairings of each batch are in `docs/PROTOCOL.md`.

Results (Table 2 of the paper). Head to head on the test seeds, both seats. In paid batches the paid agent
is A (in batch 3, the typed agent). A/B wins in % with 95% Wilson intervals; D = draws; verdict by
non-overlapping intervals. Batch 5 (search, the ceiling) is listed first. Batch 6 lists its 50-game
pairings; its 12-game pairings are in the paper's Appendix D. Batch 7 is the option-order control.

| A | B | n | A wins % [95% CI] | B wins % [95% CI] | D | Verdict |
|---|---|--:|--:|--:|--:|---|
| **Batch 5 (free search ceiling, protocol v3, seeds 100001–100100)** | | | | | | |
| search | greedy-normal | 200 | 91.0 [86.2, 94.2] | 8.5 [5.4, 13.2] | 1 | search better |
| search | rule | 200 | 95.0 [91.0, 97.3] | 4.5 [2.4, 8.3] | 1 | search better |
| search | lookahead | 200 | 89.0 [83.9, 92.6] | 8.0 [5.0, 12.6] | 6 | search better |
| search | random | 200 | 100.0 [98.1, 100.0] | 0.0 [0.0, 1.9] | 0 | search better |
| **Batch 1 (free references, seeds 100001–100100)** | | | | | | |
| greedy-normal | rule | 200 | 65.0 [58.2, 71.3] | 32.0 [25.9, 38.8] | 6 | greedy-normal better |
| greedy-normal | lookahead | 200 | 71.5 [64.9, 77.3] | 27.0 [21.3, 33.5] | 3 | greedy-normal better |
| greedy-normal | random | 200 | 98.0 [95.0, 99.2] | 2.0 [0.8, 5.0] | 0 | greedy-normal better |
| rule | lookahead | 200 | 69.0 [62.3, 75.0] | 30.0 [24.1, 36.7] | 2 | rule better |
| rule | random | 200 | 98.0 [95.0, 99.2] | 2.0 [0.8, 5.0] | 0 | rule better |
| lookahead | random | 200 | 97.0 [93.6, 98.6] | 3.0 [1.4, 6.4] | 0 | lookahead better |
| **Batch 2 (language models vs. references, seeds 100001–100025)** | | | | | | |
| llama8b-typed | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| ministral3b-typed | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| llama8b-free | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| ministral3b-free | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| llama8b-typed | random | 50 | 10.0 [4.3, 21.4] | 74.0 [60.4, 84.1] | 8 | random better |
| ministral3b-typed | random | 50 | 2.0 [0.4, 10.5] | 94.0 [83.8, 97.9] | 2 | random better |
| llama8b-free | random | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | random better |
| ministral3b-free | random | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | random better |
| **Batch 3 (typed vs. free, same model, seeds 100001–100025)** | | | | | | |
| llama8b-typed | llama8b-free | 50 | 82.0 [69.2, 90.2] | 10.0 [4.3, 21.4] | 4 | llama8b-typed better |
| ministral3b-typed | ministral3b-free | 50 | 76.0 [62.6, 85.7] | 20.0 [11.2, 33.0] | 2 | ministral3b-typed better |
| **Batch 4 run 2 (decision models, seeds 100001–100025)** | | | | | | |
| gemini-decision | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| nimble-decision | rule | 50 | 40.0 [27.6, 53.8] | 54.0 [40.4, 67.0] | 3 | n.d. |
| gemini-decision | lookahead | 50 | 22.0 [12.8, 35.2] | 76.0 [62.6, 85.7] | 1 | lookahead better |
| nimble-decision | lookahead | 50 | 64.0 [50.1, 75.9] | 36.0 [24.1, 49.9] | 0 | nimble-decision better |
| gemini-decision | random | 50 | 80.0 [67.0, 88.8] | 18.0 [9.8, 30.8] | 1 | gemini-decision better |
| nimble-decision | random | 50 | 100.0 [92.9, 100.0] | 0.0 [0.0, 7.1] | 0 | nimble-decision better |
| **Batch 6 (local typed agents, v4–v4.3, seeds 100001–100025)** | | | | | | |
| localllama8b-typed | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| localqwen7b-typed | rule | 50 | 0.0 [0.0, 7.1] | 100.0 [92.9, 100.0] | 0 | rule better |
| localllama8b-typed | random | 50 | 4.0 [1.1, 13.5] | 60.0 [46.2, 72.4] | 18 | random better |
| localqwen7b-typed | random | 50 | 30.0 [19.1, 43.8] | 40.0 [27.6, 53.8] | 15 | n.d. |
| **Batch 7 (option-order control: local typed agents, shuffled order, v5, seeds 100001–100025)** | | | | | | |
| localllama8b-typed-shuffled | random | 50 | 18.0 [9.8, 30.8] | 40.0 [27.6, 53.8] | 21 | n.d. |
| localqwen7b-typed-shuffled | random | 50 | 22.0 [12.8, 35.2] | 56.0 [42.3, 68.8] | 11 | random better |

The per-game results and game logs are not in the repository; see the paper's Code and Data Availability
section.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and look for issues labelled
`good first issue` (drafts in [docs/ISSUES.md](docs/ISSUES.md)). The short version: keep game
logic in `src/core` with tests, and keep rendering free of rules.

## Art

Tile art: original, generated for hexfolk with Gemini from the author's prompts
(`scripts/gen_tiles_gemini.py`).

## Licence

Code: MIT (see [LICENSE](LICENSE)).

Art (`assets/` and the generated `public/atlas`): [CC BY 4.0](LICENSE-ART), © 2026 Federico Lucca,
generated with Gemini from his prompts. Please credit "hexfolk art by Federico Lucca" if you reuse it.

hexfolk's names and rules are original.
