# Contributing to hexfolk

Thanks for helping. The project is small on purpose: TypeScript (strict), Vite, Canvas 2D, Vitest and
no runtime dependencies.

## Setup

```sh
npm install
npm run dev        # builds the atlas, then serves the game
npm test           # Vitest
npm run build      # type-check and production build
```

## Where things go

- `src/core`: pure game logic (state, rules, engine, combat, economy, AI). No DOM, no canvas, no
  `Math.random` (use the seeded `rng`). The engine is `newGame`, `observe`, `legalActions` and `step`.
- `src/render`: canvas drawing, camera and input. No rules.
- `src/ui`: the HTML HUD. It asks the engine what is legal (`legalActions`, `checkAction`) and never decides itself.
- `tests/`: one test file per area. **Every rule needs a test**, including the unhappy path.

## Rules and decisions

The rules are in `README.md` and `docs/PLAN.md`. When a rule is ambiguous, pick the simplest reading
and add a line to `docs/DECISIONS.md`.

## Pull requests

1. Branch from `main`, keep the change small and focused.
2. Add or update tests; `npm test` and `npm run build` must pass.
3. Commit messages are short, in English, in the imperative ("Add walls to the city panel").
4. Describe what changed and why. Screenshots help for UI changes.

New AIs implement `Agent` (`src/core/agent.ts`); see `src/core/ai/greedy.ts` for an example.
