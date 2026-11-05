# Art

The tile art is generated with Gemini from the author's prompts. All prompts live in
[`scripts/gen_tiles_gemini.py`](../scripts/gen_tiles_gemini.py):

- `STYLE`: the shared style prompt.
- `TERRAINS`: one subject per terrain.
- `PALETTES`: one palette per theme.
- `VARIANTS_DEFAULT`: how many variants each terrain gets.

Change them there and commit, so every tile can be regenerated with the same words.

## Regenerating tiles

Setup, once:

```sh
uv venv .venv && uv pip install --python .venv/bin/python google-genai pillow
export GEMINI_API_KEY=...   # needs a billed Google AI project: the free tier has no image quota
```

The script skips files that already exist. To redo one tile, delete it and run the script for its
theme and terrain:

```sh
rm assets/raw/tiles/deadlands/water_1.png
.venv/bin/python scripts/gen_tiles_gemini.py --themes deadlands --terrains water --keep-raw
```

`--ref assets/raw/tiles/greenlands/forest_1.png` passes a good tile as a style reference, which
keeps a redo consistent with the rest of the set. `npm run atlas` (also run by `dev` and `build`)
rebuilds `public/atlas/` from the tiles. Raw generations (`*.raw.png`) are gitignored.

## Regeneration to-do

| Tile | Problem |
| --- | --- |
| `deadlands/water_1` | Mauve, hard to tell from land |
| `greenlands/water_1` | White halo; hex drawn about 3% short (stretched by the atlas build) |
| `drylands/water_1` | Stray marks outside the hex |
| `drylands/forest_1` | Hex about 3% short (stretched) |
| `drylands/mountain_1` | Hex about 8% short (stretched) |
| `deadlands/capital_1` | Hex about 6% short (stretched) |
| `greenlands/grass_3`, `greenlands/hill_2` | Houses on what should be bare ground |
