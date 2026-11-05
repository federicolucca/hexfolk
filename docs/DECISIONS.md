# Decisions

Choices made where the brief changed or was ambiguous. Newest first.

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
