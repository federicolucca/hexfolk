# hexfolk

A minimal turn-based 4X strategy game on a hex map, playable in desktop and mobile browsers.
Explore, expand, exploit and exterminate on a small procedurally generated island, against AI rivals,
in under 30 turns.

> **Status: planning.** No code yet. This README describes what v0.1 will be.

**Demo:** https://federicolucca.github.io/hexfolk/ (available from the first deploy)

## What it is

hexfolk is a single-player game: you lead one tribe against 1 to 3 AI opponents. Every game is
short, readable at a glance and playable one-handed on a phone. The art comes from Kay Lousberg's
CC0 [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon),
pre-rendered into 2D sprites and drawn on a canvas. There is no backend and nothing to install.

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
- **Zero runtime dependencies.** TypeScript, Vite and native Canvas 2D. No UI framework and no 3D
  engine: the 3D models are turned into sprites ahead of time.

## Tech stack

- TypeScript (strict), Vite, Canvas 2D
- Vitest for the game logic
- GitHub Actions runs the tests and deploys to GitHub Pages

```
src/core    rules, state, map generation, AI (pure, no DOM)
src/render  canvas drawing, touch and mouse input
src/ui      minimal HTML/CSS HUD
tests/      Vitest tests for src/core
scripts/    dev tooling (asset fetch, sprite pre-rendering)
public/     committed sprites and static files
```

The KayKit glTF sources are not committed. Run `./scripts/fetch-assets.sh` to download them,
pinned to a fixed upstream commit, into `assets-src/` (gitignored). You only need this to
re-render the sprites.

## Running locally

These commands will work once the first milestone lands:

```sh
npm install
npm run dev      # start the dev server
npm test         # run the tests
npm run build    # build for production
```

## Roadmap

v0.1 is built in milestones. Each one is playable, tested and committed:

1. **Plan:** architecture, data model and module list (`docs/PLAN.md`)
2. **Map:** procedural map, rendering, pan and zoom
3. **Units:** the four unit types and movement
4. **Cities and economy:** stars, growth, levels, village capture
5. **Techs and combat:** the tech tree and deterministic combat
6. **AI:** greedy heuristic opponents
7. **Release:** autosave, victory conditions, docs, GitHub Pages deploy

After v0.1, possible additions include more tribes, a minimax AI, larger maps and more techs and
units. None of these are planned yet.

## Contributing

Contributions are welcome once the first milestone is published. Look for issues labelled
`good first issue`. A `CONTRIBUTING.md` will describe the workflow. The short version: keep game
logic in `src/core` with tests, and keep rendering free of rules.

## Credits

Art: [KayKit Medieval Hexagon Pack](https://kaylousberg.itch.io/kaykit-medieval-hexagon) by
[Kay Lousberg](https://www.kaylousberg.com), CC0. See [CREDITS.md](CREDITS.md).

## Licence

Code: MIT. Art: CC0 (KayKit). hexfolk's names and rules are original.
