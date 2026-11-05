# Good first issue drafts

Copy each into a GitHub issue labelled `good first issue`.

## 1. Heal units that rest on a city
Units never recover health. At the start of a turn, a unit standing on one of its owner's cities that
did not move or attack last turn should heal 3 HP (up to its maximum).
*Where:* `startTurn` in `src/core/engine.ts`. *Tests:* healing, no healing after moving, no overheal.

## 2. Terrain defence bonus
Units on forests and mountains should defend better (for example ×1.5). Add a constant in
`src/core/rules.ts`, use it in `defenceBonus` in `src/core/combat.ts` and log the choice in `docs/DECISIONS.md`.
*Tests:* the preview changes with the terrain.

## 3. Show the end-of-turn event log
After the AIs play, show a short list of what happened (captures, attacks, research). The events are
already returned by `Session.endTurn`. *Where:* `src/ui/describe.ts` (a pure text function with tests) and a
small HUD element.

## 4. Keyboard shortcuts
Add `Enter` for end turn, `T` for the tech panel and `Escape` to clear the selection. *Where:*
`src/main.ts`. Keep the buttons working and focusable.

## 5. A "pass the seed" share button
Add a button that copies the current URL (it already contains `?seed=`) to the clipboard and shows a
short confirmation. *Where:* `src/ui/hud.ts`. Handle a missing clipboard API gracefully.
