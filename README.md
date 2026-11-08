# hexfolk

A minimal turn-based 4X strategy game on a hex map, playable in desktop and mobile browsers.
Explore, expand, exploit and exterminate on a small procedurally generated island, against AI rivals,
in under 30 turns.

> **Status: map milestone.** A seeded island you can pan, zoom and inspect. Units and rules come
> next; this README describes what v0.1 will be.

**Demo:** https://federicolucca.github.io/hexfolk/ (add `?seed=123` for a given map, `&theme=icelands`
to pick the theme, `&players=2` for fewer capitals)

## What it is

hexfolk is a single-player game: you lead one tribe against 1 to 3 AI opponents. Every game is
short, readable at a glance and playable one-handed on a phone. Each game is set in one of four
themes (greenlands, drylands, icelands, deadlands) with its own hand-drawn-style tile art, drawn on
a canvas. There is no backend and nothing to install.

### Rules (v0.2)

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

v0.1 is built in milestones. Each one was playable, tested and committed:

1. **Plan:** architecture, data model and module list (`docs/PLAN.md`) ✅
2. **Map:** procedural map, rendering, pan and zoom ✅
3. **Units:** the four unit types and movement ✅
4. **Cities and economy:** stars, growth, levels, village capture ✅
5. **Techs and combat:** the six techs, walls and deterministic combat ✅
6. **AI:** greedy heuristic opponents behind the `Agent` interface ✅
7. **Release:** autosave, victory conditions, docs, GitHub Pages deploy ✅

v0.1 is playable: 1 human against 1 to 3 AIs, ending by domination or the highest score on turn 30.

After v0.1, possible additions include more tribes, a minimax AI, larger maps and more techs and
units. None of these are planned yet.

## Agents & MCP

hexfolk is also a small testbed for game-playing agents. The rules live in a pure, deterministic TypeScript
engine (`src/core`: `newGame`, `observe`, `legalActions`, `step`), so the same code runs in the browser, in a
headless simulator and behind an MCP server. There is no fog of war: `observe()` returns the whole board.
No LLM results exist yet; what is here is the harness and three built-in baselines (`random`, `greedy-easy`,
`greedy-normal`).

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
`--timeout-ms`. Plugging in an external MCP/LLM agent is future work: an `Agent` whose `decide()` calls
out would do it; the sim makes no network calls and needs no API keys.

**Replay viewer.** Open the game with `?replay=<url>` (for example `?replay=replays/sample.jsonl`) or use
the Replay button to load a `.jsonl` file, then step with first / previous / play / next / last.

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
