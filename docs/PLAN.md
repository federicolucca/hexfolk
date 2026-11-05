# Plan

How hexfolk v0.1 is put together. The rules are in the [README](../README.md); choices made along
the way are in [DECISIONS.md](DECISIONS.md).

## Architecture

```
src/core    rules, state, map generation, AI. Pure TypeScript: no DOM, no canvas, no globals.
src/render  Canvas 2D drawing, camera, pointer input. Reads game data, never changes the rules.
src/ui      HTML HUD (seed, buttons, tile info), URL parameters.
src/main.ts wires core, render and ui together.
tests/      Vitest tests: all of src/core, plus the pure math helpers in src/render and src/ui.
assets/     tile art per theme (assets/raw/tiles), the source of the atlases.
scripts/    dev tooling: tile generator (Gemini) and atlas builder (sharp). Not shipped.
public/     static files; public/atlas/ is built from assets/ by `npm run atlas`.
```

- **One-way flow.** The UI turns input into actions, `src/core` applies them to the game state and
  returns a new state, and `src/render` draws that state. Rendering never decides anything.
- **Plain data.** Every piece of state is JSON-serialisable (no classes, Maps or Sets), so saving
  is `JSON.stringify` and tests can compare whole states.
- **Determinism.** Everything random comes from the seeded PRNG in the state, so a seed and a list
  of actions always replay to the same game.
- **No runtime dependencies.** Vite and TypeScript at build time; sharp only for building the
  tile atlases.

## Data model

### Today (map milestone)

```ts
type Terrain = 'grass' | 'forest' | 'mountain' | 'water';
interface Tile { q: number; r: number; terrain: Terrain }            // axial, pointy-top
interface City { q: number; r: number; kind: 'capital' | 'village'; owner: number | null }
interface GameMap {
  seed: number; width: 11; height: 11; playerCount: number;
  tiles: Tile[];   // row-major: tiles[row * width + col], odd-r offset rows
  cities: City[];  // capitals first, in player order, then neutral villages
}
```

### Planned for v0.1

```ts
type PlayerId = number;                                   // 0 .. playerCount - 1
type Colour = 'blue' | 'red' | 'yellow' | 'green';        // player 0 is blue, 1 red, 2 yellow, 3 green
type TechId = 'hunting' | 'fishing' | 'riding' | 'climbing' | 'archery' | 'fortification';
type UnitType = 'warrior' | 'archer' | 'rider' | 'defender';

interface Player {
  id: PlayerId; colour: Colour; human: boolean;
  stars: number; techs: TechId[]; alive: boolean;
}

interface City {                    // extends today's City
  q: number; r: number; kind: 'capital' | 'village';
  owner: PlayerId | null;
  population: number;               // grows from resources gathered on adjacent tiles
  level: number;                    // goes up at population thresholds
}

interface Unit {
  id: number; type: UnitType; owner: PlayerId;
  q: number; r: number; health: number;
  moved: boolean; attacked: boolean;
}

interface UnitStats {               // static table, not in the state
  attack: number; defence: number; movement: number; range: number;
  health: number; cost: number; tech: TechId | null;
}

interface GameState {
  version: 1;
  rngState: number;                 // PRNG state, for the AI's tie-breaks
  turn: number;                     // 1 .. 30
  currentPlayer: PlayerId;
  map: GameMap;
  players: Player[];
  units: Unit[];
  nextUnitId: number;
  winner: PlayerId | null;
}

type Action =
  | { type: 'move'; unitId: number; to: { q: number; r: number } }
  | { type: 'attack'; unitId: number; targetId: number }
  | { type: 'capture'; unitId: number }
  | { type: 'train'; city: { q: number; r: number }; unit: UnitType }
  | { type: 'research'; tech: TechId }
  | { type: 'endTurn' };

// The whole rule set behind one pure function:
function applyAction(state: GameState, action: Action): GameState;
function legalActions(state: GameState): Action[];
```

## Modules

| Module | Status | Responsibility |
| --- | --- | --- |
| `core/rng.ts` | done | mulberry32 seeded PRNG |
| `core/hex.ts` | done | axial helpers: neighbours, distance, offset conversion |
| `core/map.ts` | done | seeded 11x11 island, capitals and villages |
| `core/units.ts` | planned | unit stats table, movement range, pathing |
| `core/techs.ts` | planned | tech tree, costs, what each tech unlocks |
| `core/economy.ts` | planned | stars per turn, city growth and levels, village capture |
| `core/combat.ts` | planned | deterministic damage formula |
| `core/state.ts` | planned | `GameState`, `applyAction`, `legalActions`, victory and score |
| `core/ai.ts` | planned | greedy heuristic opponent, under 100 ms per turn |
| `core/save.ts` | planned | versioned autosave to and from JSON |
| `render/palette.ts` | done | every colour used by the canvas and the HUD |
| `core/theme.ts` | done | the four themes, `themeFromSeed` |
| `render/layout.ts` | done | hex to pixel and pixel to hex for the atlas tile spacing |
| `render/camera.ts` | done | pan, zoom around a point, clamping, world to screen |
| `render/atlas.ts` | done | atlas format and validation, which frame and variant each tile uses |
| `render/atlasLoader.ts` | done | loads a theme's atlas, and its @2x image once it is needed |
| `render/gesture.ts` | done | tap-or-drag threshold, pinch and wheel maths |
| `render/renderer.ts` | done | draws the map back to front, HiDPI, selection highlight |
| `render/input.ts` | done | pointer and wheel gestures: tap, drag, pinch, wheel zoom |
| `render/units.ts` | planned | unit tokens (vector until there is unit art) |
| `ui/hud.ts` | done | seed, New map button, selected tile |
| `ui/url.ts` | done | `?seed=`, `?theme=` and `?players=` parsing |
| `ui/describe.ts` | done | text for the selected tile |
| `scripts/build-atlas.ts` | done | packs the tile art into per-theme atlases (`npm run atlas`) |
| `scripts/atlas-geometry.ts` | done | measures the hex in each tile, grid packing (tested) |

## Milestones

Each milestone ends with green tests, a clean build, a commit and a deploy.

1. Map: generation, rendering, pan and zoom, GitHub Pages deploy.
2. Units: the four unit types and movement.
3. Cities and economy: stars, growth, levels, village capture.
4. Techs and combat.
5. AI opponents.
6. Release: autosave, victory, docs.
