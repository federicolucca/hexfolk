# Decisions

Choices made where the brief changed or was ambiguous. Newest first.

## 2026-11-05: Map generation

- **Coordinates:** axial (q, r) for pointy-top hexes. The 11x11 rectangle uses "odd-r" offset rows
  (odd rows shifted half a hex right). `tiles` is row-major, so a tile's index is `row * 11 + col`.
- **Seed:** any number, normalised to an unsigned 32-bit integer. The PRNG is mulberry32.
- **Island:** the top 60% of tiles by "closeness to the centre + smoothed noise" become land.
  Only the largest landmass is kept. Land is then scattered: about 12% mountain, 28% forest, the
  rest grass.
- **Capitals:** on inland grass (not on the map border), placed by farthest-point sampling plus one
  refinement pass, at least 4 hexes apart. They must reach each other over grass and forest only
  (mountains will likely need a tech), otherwise the generator retries with the same PRNG stream.
  Over 500 seeds the closest pair of capitals is 8-11 apart for 2 players, 6-8 for 3 and 4-7 for 4.
- **Villages:** `2 + playerCount` neutral villages on land, at least 2 hexes from every other city.
  Capital and village tiles are set to grass.
- **Data:** plain JSON objects (`seed`, `width`, `height`, `playerCount`, `tiles`, `cities`), with
  no classes, Maps or Sets, so a game state can be saved with `JSON.stringify`.

## 2026-11-05: Art from KayKit, pre-rendered to 2D sprites

- **Change:** the original brief asked for flat vector shapes and no external images. The owner
  chose to use KayKit art instead.
- **Pack:** KayKit Medieval Hexagon Pack 1.0 (CC0) by Kay Lousberg. It was preferred over the
  Medieval Builder Pack: it is that pack's official hexagonal successor, the itch.io page of the
  Builder Pack is no longer updated, and the Hexagon Pack is on GitHub, so it can be fetched and
  pinned reproducibly.
- **Rendering:** the game stays native Canvas 2D with no runtime dependencies. A dev-only script
  renders each glTF model once into a 2D sprite. The sprites are committed and drawn on the canvas.
- **Storage:**
  - `assets-src/kaykit/` holds the glTF sources. They are gitignored and fetched by
    `scripts/fetch-assets.sh`, pinned to an upstream commit.
  - The derived sprites will live under `public/sprites/` and are committed, so a clone runs
    without fetching anything.
  - Licence and attribution are in `CREDITS.md` and `LICENSES/`.
- **Open point:** the pack has terrain, buildings (blue, green, red, yellow, neutral) and props,
  but no characters. Units will be drawn as vector tokens, unless the owner picks a character pack.
