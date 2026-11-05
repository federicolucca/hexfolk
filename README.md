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

### Rules (v0.1)

- **Map:** 11x11 pointy-top hexes, generated from a seed. Terrains: grass, forest, mountain, water.
  Each player starts with a capital, and neutral villages wait to be captured.
- **Economy:** every city produces *stars* each turn (a base amount plus its population).
  Stars buy techs and units.
- **Cities:** they grow by gathering resources from adjacent tiles, and level up at population
  thresholds to unlock bonuses.
- **Techs (6):** Hunting, Fishing, Riding, Climbing, Archery, Fortification. Each one unlocks a
  terrain action or a unit.
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

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and look for issues labelled
`good first issue` (drafts in [docs/ISSUES.md](docs/ISSUES.md)). The short version: keep game
logic in `src/core` with tests, and keep rendering free of rules.

## Art

Tile art: original, generated for hexfolk with Gemini from the author's prompts
(`scripts/gen_tiles_gemini.py`).

## Licence

Code: MIT (see [LICENSE](LICENSE)). The licence for the tile art is not decided yet. hexfolk's
names and rules are original.
