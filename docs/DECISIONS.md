# Decisions

Choices made where the brief changed or was ambiguous. Newest first.

## 2026-11-05: Own tile art in four themes; KayKit dropped

- **Change:** KayKit is gone (models, pre-render script, sprites, credits, licence file, three.js and
  Playwright dependencies). The tiles are original art generated for hexfolk with Gemini from the
  author's prompts by `scripts/gen_tiles_gemini.py`. **The art licence is to be decided**; the code
  stays MIT. The entries below about KayKit and sprites are kept as history.
- **Source art:** `assets/raw/tiles/<theme>/<terrain>_<n>.png` plus `manifest.json`, committed.
  Four themes (greenlands, drylands, icelands, deadlands); terrains grass (3 variants), forest (3),
  hill (2), mountain, water, village, capital, ruins. Tiles are top-down pointy-top hexes, about
  256 x 287 px, each with its own dark outline. The uncropped generator output (`*.raw.png`, 48 MB)
  is ignored.
- **Atlas build:** `npm run atlas` (`scripts/build-atlas.ts`, sharp, run by Node's built-in type
  stripping) runs before `dev` and `build`, so CI builds it too; `public/atlas/` is not committed.
  For each tile it measures the hex from the alpha mask: the slanted top and bottom edges are fitted
  as lines, using the longest opaque run per row, so halos and stray marks outside the hex (greenlands
  and drylands water) are ignored. The face centre is the shoulder plus half the median side length,
  so tiles drawn with some thickness below still line up.
- **Resizing only:** each tile is scaled so its hex is 256 px wide (@2x) and 128 px (1x). A tile
  whose hex is drawn more than 3% shorter than its theme's median is also stretched vertically (at
  most 10%) to close the gaps it would leave: greenlands water (3%), drylands forest_1 (3%), drylands
  mountain (8%) and deadlands capital (6%). The build logs these. Regenerating those tiles would
  remove the need. Nothing else about the pixels changes.
- **Two scales:** 1x (128 px tiles) is always loaded; @2x (256 px) loads on demand once a 1x pixel
  would cover more than 1.15 device pixels (HiDPI screens, or zooming in). It is clearly sharper on
  phones and up close, and it lets the maximum zoom go to 2.5x (320 CSS px per tile).
- **Spacing:** measured from the art, as medians per theme: column step = hex width - 1 px, row step
  = top triangle + side - 1.5 px (about 106 px at 1x), so neighbouring outlines overlap slightly and
  leave no seams. The background is a dark ink-slate, so any remaining sliver reads as outline.
- **Mapping:** grass, forest, mountain and water use their terrain's tiles; a village or capital
  uses the village or capital tile. **Hill and ruins stay in the atlas only:** hills read as a
  different terrain (players would expect rules), so they are not used as grass variants.
- **Variants:** picked by `hashHex(seed, q, r) % count`, so a map always looks the same.
- **Ownership:** the capital tiles have no player colour, so the renderer draws a small pennant in
  the owner's palette colour on owned cities. The per-colour KayKit capitals are gone.
- **Theme:** `themeFromSeed(seed)` (its own PRNG stream, so independent of the layout) picks one of
  the four. `?theme=` or the HUD select overrides it; "Auto" follows the seed.
- **Start view:** on a landscape screen the whole map fits; on a portrait screen the zoom is the
  geometric mean of the width and height fits (the map is about square now).

## 2026-11-05: Map rendering and deploy

- **Projection:** a hex's world position is the centre of its top face in sprite pixels:
  `x = 256 * (q + r / 2)`, `y = 142.51 * r`. That is the regular pointy-top layout squashed
  vertically (an affine map), so pixel-to-hex inverts it and cube-rounds. A tap selects the hex
  whose top face is under the finger, even when a tall sprite from the row in front covers it.
- **Draw order:** tiles are row-major, so they are drawn in array order (back to front). The
  selection outline is drawn right after its row, so trees and buildings in front still cover it.
- **Camera:** an orthographic centre point plus zoom, at most 1.25 (sprites are 256 px per tile, so
  further zoom only blurs them). The minimum zoom is 75% of the whole-map fit, and the view centre
  is kept over the map. The canvas uses the device pixel ratio, capped at 2.
- **Starting view:** the geometric mean of the width fit and the height fit. On a desktop this is
  about the whole map; on a portrait phone the whole 11x11 map would be tiny, so it starts zoomed
  in about 2x and you pan to see the rest.
- **Gestures:** a press that moves more than 8 CSS px is a drag and never a tap; a gesture that
  used two fingers is never a tap either. Wheel zoom follows the cursor; pinch zooms around the
  midpoint of the fingers and pans with it.
- **URL:** `?seed=` (0 to 4294967295) picks the map; without it a random seed is chosen and written
  into the URL, so the address bar always holds a shareable link. `?players=2..4` (default 4) sets
  the number of capitals. "New map" picks a random seed and replaces the URL.
- **Deploy:** GitHub Actions on every push to main runs `npm ci`, `npm test` and `npm run build`,
  then publishes `dist/` with `actions/upload-pages-artifact` and `actions/deploy-pages`.

## 2026-11-05: Sprite pre-rendering (camera, lighting, model mapping)

- **Tool:** `npm run sprites` (`scripts/render-sprites.mjs`) serves the glTF sources and three.js to
  headless Chromium through `playwright-core` (pinned to 1.64.1, which matches the Chromium build
  already in `~/.cache/ms-playwright`; set `CHROME_PATH` to use another Chrome). WebGL runs on
  SwiftShader, so no GPU is needed. All 13 sprites render in about 4 seconds.
- **Camera:** one orthographic camera for every sprite, looking north from 40 degrees above the
  horizon. KayKit hexes have their corners on the z axis, so they are pointy-top on screen with no
  rotation. 128 px per world unit: a tile is 256 px wide, rows are 142.51 px apart and the top
  face is 190 px tall (all in `manifest.json` under `tile`).
- **Render:** 2x supersampled, then downscaled. Transparent background. Tile side walls are clipped
  0.4 units below the grass surface, so tiles read as thin slabs. Empty rows are trimmed from the
  top only, so every sprite is 256 px wide and its `anchor` (the centre of the hex's top face)
  stays at x = 128.
- **Lighting:** white hemisphere light (intensity 1.35) plus a white sun (2.0) from the upper left
  and slightly in front, with soft PCF shadows. No tone mapping, sRGB output.
- **Model mapping:**

  | Sprite | KayKit models |
  | --- | --- |
  | `terrain-grass` | `tiles/base/hex_grass` |
  | `terrain-forest` | `hex_grass` + `decoration/nature/trees_A_large` |
  | `terrain-mountain` | `hex_grass` + `decoration/nature/mountain_B` |
  | `terrain-water` | `tiles/base/hex_water` |
  | `capital-{blue,red,yellow,green}` | `hex_grass` + `building_castle_{colour}` at 0.62 scale |
  | `village-{blue,red,yellow,green}` | `hex_grass` + `building_home_A`, `building_home_B` (0.7) and `building_well` (0.6) in that colour |
  | `village-neutral` | the blue village with its team-colour UV cells remapped to neutral swatches |

- **Neutral village:** the pack has no neutral houses (the neutral folder holds walls, ruins and
  construction stages, and the tents read as market stalls). The blue houses are reused with the
  two team-colour cells of the 8x4 colour atlas remapped to neutral swatches, so the neutral village
  looks like the player villages without a team colour.
- **Grass colour:** kept as the pack's own lime swatch; only the light intensity was tuned.

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
