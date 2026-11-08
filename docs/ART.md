# Art

All the art is generated with Gemini from the author's prompts. Every prompt lives in
[`scripts/gen_tiles_gemini.py`](../scripts/gen_tiles_gemini.py), so any image can be regenerated
with the same words. Change them there and commit.

Licence: the art (`assets/` and the atlas built from it) is CC BY 4.0, © 2026 Federico Lucca, see
[`LICENSE-ART`](../LICENSE-ART). The code is MIT.

| Category | Output | Prompt parts |
| --- | --- | --- |
| Hex tiles | `assets/raw/tiles/<theme>/<terrain>_<n>.png` + `manifest.json` | `STYLE`, `TERRAINS`, `TERRAIN_OVERRIDES`, `PALETTES`, `VARIANTS_DEFAULT` |
| Units | `assets/raw/units/<type>_<colour>.png` | `UNIT_TEMPLATE`, `UNITS`, `COLOURS`, `UNIT_RECOLOUR_REF` |
| Resource overlays | `assets/raw/overlays/{fruit,game,fish,ore}.png` | `OVERLAY_TEMPLATE`, `OVERLAYS` |
| Walls overlay | `assets/raw/overlays/walls.png` | `WALLS_PROMPT` |
| HUD icons | `assets/raw/icons/<name>.png` | `ICON_TEMPLATE`, `ICONS` |

`SPRITE_STYLE` is the style shared by units, overlays and icons: the tiles' ink outlines and
top-left light, on plain white.

- **Tiles:** grass (3 variants), forest (3), hill (2), mountain, water, village, `city_2`,
  `city_3`, capital, ruins, in four themes. The city levels go village (2 cottages) < `city_2` (a
  small town) < `city_3` (a large town with a church) < capital (a castle); none has town walls,
  because the Fortification walls are an overlay. `TERRAIN_OVERRIDES` replaces a terrain's subject
  for one theme (deadlands water is dark murky swamp water).
- **Units:** warrior, archer, rider and defender in the four player colours of
  `src/render/palette.ts` (blue `#3a7bd5`, red `#d64541`, yellow `#f0b429`, green `#3fa34d`).
  Each blue unit is generated first and then used as the reference for the other three colours, so
  the four are the same figure with the team colour on the tunic, shield, hood or saddle blanket.
  Saved with the longest side 256 px; the common atlas draws them in a 96 px box at 1x.
- **Resource overlays:** fruit (berry bush, grass), game (deer, forest), fish (leaping fish,
  water), ore (crystals and ore rocks, mountain). Theme-neutral props drawn on top of a tile.
- **Walls:** a ring of stone walls with six corner towers and a gate, transparent inside, saved
  256 px wide like a tile, to draw over a city hex.
- **Icons:** star (the "stars" currency), hunting, fishing, riding, climbing, archery,
  fortification.

Every image is generated on pure white. The script makes the white reached from the corners
transparent (flood fill), then, for units, overlays and icons, also any enclosed region that is
large and mostly pure white (between legs, inside a bow or the walls ring), and crops to the art.

## Regenerating

Setup, once:

```sh
uv venv .venv && uv pip install --python .venv/bin/python google-genai pillow
export GEMINI_API_KEY=...   # needs a billed Google AI project: the free tier has no image quota
```

The script skips files that already exist. To redo one image, delete it and run the script for
it:

```sh
rm assets/raw/tiles/deadlands/water_1.png
.venv/bin/python scripts/gen_tiles_gemini.py --themes deadlands --terrains water \
  --ref assets/raw/tiles/deadlands/grass_1.png --keep-raw

rm assets/raw/units/archer_red.png        # recoloured from archer_blue.png automatically
.venv/bin/python scripts/gen_tiles_gemini.py --category units --names archer --colours red --keep-raw

.venv/bin/python scripts/gen_tiles_gemini.py --category overlays --names fish \
  --ref assets/raw/tiles/greenlands/village_1.png
.venv/bin/python scripts/gen_tiles_gemini.py --category icons --names star \
  --ref assets/raw/tiles/greenlands/village_1.png
```

`--ref` passes a good image as a reference. For tiles it keeps the hexagon's shape, size and
style (a plain tile of the same theme, such as `grass_1`, works well); the current set used each
theme's `grass_1` for redos and `village_1` for the city levels. For units it is only used for
blue (the set used `greenlands/village_1`); for the walls the set used `greenlands/capital_1`.
Redoing a blue unit does not redo its other colours: delete those too to keep them matching.

`npm run atlas` (also run by `dev` and `build`) rebuilds `public/atlas/`: one atlas per theme
from the tiles, and `common.png` / `common@2x.png` / `common.json` from units, overlays and icons
(frames named `units/warrior_blue`, `overlays/walls`, `icons/star`...). Raw generations
(`*.raw.png`) are gitignored.

## Regeneration to-do

Minor, none of them blocking:

| Image | Problem |
| --- | --- |
| `greenlands/water_1` | A small pale-blue spill just outside the lower-left edge (covered by the neighbouring tiles except on the map border). A redo with `--ref greenlands/village_1` came out washed-out grey; the third try hit the end of the prepaid credits. |
| `greenlands/hill_1` | Two cottages on the hills. Hills are on the map since v0.2. The hill prompt now says "no buildings". |
| `units/archer_red`, `archer_yellow` | Dark blue trousers kept from the blue archer (the hood, tunic and cloak carry the team colour). |
| `overlays/grain`, `overlays/sheep`, `overlays/wood`, `overlays/stone` | Not generated: the Gemini credit was exhausted (HTTP 402). The game draws flat vector placeholders in code (`src/render/resources.ts`, palette entries `resource`, `token`, `road`), also in the legend. To replace them add the prompts to `OVERLAYS` in `scripts/gen_tiles_gemini.py`, run `--category overlays --names grain sheep wood stone`, and draw the frames from the common atlas in `renderer.ts` and `legend.ts`. The old `overlays/fruit`, `game` and `ore` frames are unused. |
| Number tokens, roads | Drawn in code only (a cream disc with the number, a two-tone line between road tiles). Could get proper art, but flat lines are intended. |
