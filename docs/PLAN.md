# Plan

How hexfolk v0.1 is put together. The rules are in the [README](../README.md); every choice made
where a rule was ambiguous is in [DECISIONS.md](DECISIONS.md); the art pipeline is in
[ART.md](ART.md).

## Architecture

```
src/core    the headless engine: rules, state, map generation, agents. Pure TypeScript, no DOM.
src/render  Canvas 2D drawing, camera, pointer input. Reads state and highlights; decides nothing.
src/ui      HTML HUD, URL parameters, the browser session (taps -> engine actions).
src/main.ts wires core, render and ui together.
mcp/        the MCP server (stdio) for external agents. Node only, never in the browser bundle.
scripts/    dev tooling: tile generator, atlas builder, match simulator. Not shipped.
tests/      Vitest: the engine, agents, replays, and the pure helpers of render and ui.
public/     static files; public/atlas/ is built from assets/ by `npm run atlas`.
```

- **One engine, many players.** The browser UI, the built-in AI, the simulator and the MCP server
  all play through the same four functions in `src/core/engine.ts`:

  ```ts
  newGame({ seed, players, turnLimit }): GameState
  observe(state, player): Observation          // what the player sees (v0.1: everything)
  legalActions(state, player): Action[]        // empty when it is not their turn
  step(state, player, actions): { state, events, rejected }
  ```

  `step` never changes its input, applies the actions in order, skips illegal ones with a reason,
  and reports what happened as events.
- **Agents.** Anything that plays a seat implements `Agent.decide(observation, legal) -> Action[]`
  (sync or async) for one whole turn. `playTurn` runs one, times it, ends the turn if the agent did
  not (the default action) and reports illegal actions. The greedy AI, a random bot, and MCP
  clients are all agents, so a minimax AI or an LLM can plug in without touching the engine.
- **Plain data.** The state is JSON-serialisable (no classes, Maps or Sets), so saving is
  `JSON.stringify` and tests compare whole states.
- **Determinism.** The map comes from the seed; the rules use no randomness. The same seed and the
  same actions always give the same game, so a replay is the seed plus the action list.
- **No fog of war in v0.1.** `observe` returns a copy of the whole state; agents may simulate on it.
- **No runtime dependencies.** Vite and TypeScript at build time; sharp for the atlases; the MCP
  SDK and tsx only in the Node tools.

## Data model

```ts
type UnitType = 'warrior' | 'archer' | 'rider' | 'defender';
type TechId = 'hunting' | 'fishing' | 'riding' | 'climbing' | 'archery' | 'fortification';

interface Tile   { q; r; terrain: 'grass' | 'forest' | 'mountain' | 'water'; resource }  // axial
interface Player { id; stars; techs: TechId[]; alive }
interface City   { id; q; r; owner: number | null; capital; level; population; walls }
interface Unit   { id; type; owner; q; r; hp; moved; attacked; home: number | null }

interface GameState {
  version: 1; seed; turnLimit; turn; current;   // turn is 1-based; current = player to move
  width; height; tiles: Tile[];                 // 11x11, row-major, odd-r offset rows
  players; cities; units; nextUnitId;
  over: boolean; winner: number | null;
}

type Action =
  | { type: 'move'; unit; to: { q; r } }
  | { type: 'attack'; unit; target }            // target = unit id
  | { type: 'capture'; unit }
  | { type: 'train'; city; unit: UnitType }
  | { type: 'harvest'; at: { q; r } }
  | { type: 'research'; tech: TechId }
  | { type: 'build_walls'; city }
  | { type: 'end_turn' };
```

Unit stats, tech costs and other numbers are tables in `src/core/rules.ts`.

## Modules

| Module | Status | Responsibility |
| --- | --- | --- |
| `core/rng.ts` | done | mulberry32 seeded PRNG, `hashHex` |
| `core/hex.ts` | done | axial helpers: neighbours, distance, offset conversion, rounding |
| `core/map.ts` | done | seeded 11x11 island, capitals and villages |
| `core/theme.ts` | done | the four themes, `themeFromSeed` |
| `core/rules.ts` | done | unit stats, techs, costs and other tunable numbers |
| `core/state.ts` | done | `GameState`, `Action`, `GameEvent` types |
| `core/board.ts` | done | lookups: tile, unit and city at a hex |
| `core/movement.ts` | done | reachable hexes with terrain costs |
| `core/engine.ts` | done (b) | `newGame`, `observe`, `legalActions`, `checkAction`, `step` |
| `core/agent.ts` | done (b) | the `Agent` interface, `playTurn`, the pass agent |
| `core/economy.ts` | (c) | stars per turn, training, harvesting, growth, levels, capture |
| `core/combat.ts` | (d) | deterministic damage, retaliation, attack preview |
| `core/techs.ts` | (d) | research, what each tech unlocks |
| `core/agents/greedy.ts` | (e) | greedy heuristic AI, under 100 ms per turn |
| `core/agents/random.ts` | (e) | seeded random legal actions (a baseline for the simulator) |
| `core/score.ts` | (f) | score, victory, end of game |
| `core/replay.ts` | (g) | JSONL replays: record and rebuild a game |
| `core/summary.ts` | (g) | a short text summary of an observation, for LLM agents |
| `render/*` | done | palette, layout, camera, gestures, atlases, renderer, input |
| `ui/session.ts` | done (b) | the browser game: taps to actions, highlights, agents' turns |
| `ui/hud.ts` | done (b) | top bar, dock (turn, stars, selection, end turn), card panel |
| `ui/describe.ts` | done | HUD texts |
| `ui/url.ts` | done | `?seed=`, `?theme=`, `?players=` |
| `ui/save.ts` | (f) | autosave to localStorage at every end of turn |
| `mcp/server.ts` | (g) | MCP server: matches, seats, observations, actions, timeouts, replays |
| `scripts/sim.ts` | (g) | `npm run sim`: seeded tournaments, JSONL replays, results table |
| `scripts/build-atlas.ts` | done | per-theme tile atlases and the common atlas (`npm run atlas`) |

## Milestones

Each milestone ends with green tests, a clean build, a commit, a deploy check and its GitHub issue
closed.

- (a) Map: generation, rendering, pan and zoom, GitHub Pages deploy. **Done.**
- (b) Units and movement: the engine API, unit stats, reachable hexes, turn order, tap to move.
  **Done.**
- (c) Cities and economy: stars, training, harvesting resources, growth, levels, village capture.
- (d) Techs and combat: research, deterministic combat with preview, capital capture, walls.
- (e) Greedy AI behind the agent interface, with a benchmark.
- (f) Save, victory and docs: autosave, new game with a seed, domination or score at the turn
  limit, CONTRIBUTING.md, docs/ISSUES.md.
- (g) Agents and MCP: MCP server, simulator with replays and a results table, replay viewer.
