#!/usr/bin/env python3
"""
Generate the hexfolk art with Gemini image generation.

  pip install google-genai pillow
  export GEMINI_API_KEY=...
  python scripts/gen_tiles_gemini.py                 # every hex tile
  python scripts/gen_tiles_gemini.py --themes greenlands --terrains forest --variants 2
  python scripts/gen_tiles_gemini.py --ref assets/style_ref.png   # use one of your tiles as a style reference
  python scripts/gen_tiles_gemini.py --category units --names warrior --colours blue
  python scripts/gen_tiles_gemini.py --category overlays     # resource props and the walls ring
  python scripts/gen_tiles_gemini.py --category icons        # HUD icons

Categories and output (transparent background, cropped):
  tiles     assets/raw/tiles/<theme>/<terrain>_<n>.png plus assets/raw/tiles/manifest.json
  units     assets/raw/units/<type>_<colour>.png
  overlays  assets/raw/overlays/<name>.png
  icons     assets/raw/icons/<name>.png

Units: each blue unit is generated first and then used as the reference for the other colours of
the same type, so the four colours are the same figure. --ref is then only used for blue.
It resumes where it stopped: files that already exist are skipped.
"""
import argparse, json, os, sys, time
from collections import deque
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from google import genai
from google.genai import types

MODEL = "gemini-3.1-flash-image"   # alternatively "gemini-2.5-flash-image"

# --- Hex tiles -------------------------------------------------------------------------------

STYLE = """A single game map tile: a pointy-top hexagon, centered, filling the frame, on a plain pure white background, nothing outside the hexagon.

Style: hand-drawn cartoon illustration for a strategy board game. Thick, slightly irregular dark brown-green ink outlines. Soft painterly shading with a light source from the top-left: rounded highlights on the upper-left of every shape, deeper shadow tones on the lower-right, soft blurred drop shadows on the ground. Saturated but earthy colors. The hexagon ground has a gentle radial gradient, lighter in the center and darker toward the edges, with a thin lighter inner border just inside the dark outline. Slight 3/4 top-down perspective. Small scattered grass ticks on the ground. No text, no watermark, no visible brush texture, clean vector-like edges.

Subject: {terrain}

Biome palette: {palette}
{variation}"""

TERRAINS = {
    "grass":    "an almost empty grassy ground with a few grass ticks, one small pebble and at most one small lollipop-shaped tree, no buildings, no houses",
    "forest":   "a dense cluster of bushy round-topped trees forming a ring with a small sunlit clearing in the middle, bulbous cloud-like canopies in overlapping lobes, a few short dark trunks peeking out underneath",
    "mountain": "a large craggy brown rock formation with angular facets and a dark cave opening at its base, loose boulders around it, two small lollipop-shaped trees beside it",
    "hill":     "two rounded grassy hills with soft shading and a couple of small lollipop trees, no buildings, no houses",
    "water":    "calm water with a few soft curved wave highlights, no land at all",
    "village":  "two small cottages in 3/4 view with pale plaster walls, tiled brown roofs, a stone chimney, a tiny dirt path, a few round lollipop trees",
    # City levels: village (level 1) < city_2 < city_3 < capital (a castle). No town walls: the
    # Fortification walls are a separate overlay drawn on top.
    "city_2":   "a small town, clearly bigger than a hamlet: four or five cottages in 3/4 view with pale plaster walls and tiled roofs clustered around a tiny square with a stone well, dirt paths between them, a couple of round lollipop trees, no town walls, no castle",
    "city_3":   "a large busy town filling most of the hexagon: a dense cluster of many houses in 3/4 view, several of them two storeys tall, tiled roofs, a small stone church with a bell tower, a market square with a fountain, no town walls, no castle",
    "capital":  "a small stone castle with two round towers with conical roofs, crenellated walls, a central keep with a flag",
    "ruins":    "a ruined stone wall with a broken arch and crumbled pillars overgrown by one bushy tree, scattered stone blocks",
}

# Theme-specific subjects that replace TERRAINS[terrain] for one theme.
TERRAIN_OVERRIDES = {
    ("deadlands", "water"): "dark murky swamp water filling the whole hexagon: deep blackish teal-green and dark olive tones with an oily sheen, clearly liquid, with soft curved ripples and wave highlights, a few floating dead leaves, no land at all",
}

PALETTES = {
    "greenlands": "fresh meadow greens, warm brown rock, cream walls, terracotta roofs",
    "drylands":   "ochre and sand ground, olive-green vegetation, red-brown roofs",
    "icelands":   "pale blue-grey ground, dark teal conifers instead of round trees, snow-capped rocks, slate roofs",
    "deadlands":  "dusty mauve-grey ground, dark purple-grey dead vegetation, dark rock, wine-red roofs",
}

VARIANTS_DEFAULT = {"grass": 3, "forest": 3, "hill": 2}   # all others: 1

TILE_REF = "Match the drawing style and the exact hexagon shape, size and proportions of this reference tile, but draw the subject below instead of the reference's content. "

# --- Sprites: units, overlays, icons -----------------------------------------------------------

SPRITE_STYLE = """Style: hand-drawn cartoon illustration for a strategy board game, matching a set of painted hex map tiles. Thick, slightly irregular dark brown-green ink outlines around every shape. Soft painterly shading with a light source from the top-left: rounded highlights on the upper-left of every shape, deeper shadow tones on the lower-right. Saturated but earthy colors. Clean vector-like edges, no visible brush texture.

Background: plain flat pure white (#FFFFFF) all around the subject and in every gap, no ground, no floor, no cast shadow, no scenery, no frame, no border, no vignette. No text, no letters, no numbers, no watermark, no signature."""

UNIT_TEMPLATE = """A single game piece for a hex strategy board game: {subject}. One character only, full body, standing, centred, seen from a slight 3/4 top-down view, turned slightly to the right. Chunky board-game-miniature proportions (large head, short sturdy body) and a bold simple silhouette, so it reads at 64 px.

Team colour: {colour}. Use it for large, clearly visible areas ({parts}); keep everything else in neutral earthy tones (brown leather, grey steel, skin, wood) so the team colour stands out.

{style}"""

UNITS = {
    "warrior":  ("a warrior with a short sword and a round wooden shield, a simple iron helmet",
                 "the tunic and the face of the round shield"),
    "archer":   ("an archer holding a wooden longbow, a quiver of arrows on the back, a hood",
                 "the hood, the tunic and the cloak"),
    "rider":    ("a rider on a small sturdy brown horse, the horse standing side-on facing right, the rider holding a short spear",
                 "the rider's tunic, the horse's saddle blanket and a small pennant on the spear"),
    "defender": ("a heavily armoured defender with a steel helmet, a spear and a large tall rectangular tower shield held in front",
                 "the tower shield, with one simple pale stripe, and the tunic"),
}

# Hex values from src/render/palette.ts.
COLOURS = {
    "blue":   "bright medium blue (#3a7bd5)",
    "red":    "bright red (#d64541)",
    "yellow": "golden yellow (#f0b429)",
    "green":  "bright green (#3fa34d)",
}

UNIT_RECOLOUR_REF = "The reference image is this same unit with blue as its team colour. Draw exactly the same figure: same pose, proportions, outlines, equipment, framing and size, on the same plain pure white background. Only recolour every blue team-colour part to {colour}; nothing else changes.\n\n"

OVERLAY_TEMPLATE = """A small icon-like prop for a hex strategy board game, drawn on top of a map tile to mark a resource: {subject}. One compact object, centred, seen from a slight 3/4 top-down view, a bold simple silhouette that reads at 48 px. Neutral natural colours that work on any terrain.

{style}"""

OVERLAYS = {
    "fruit": "a round berry bush with glossy dark green leaves and clusters of bright red berries",
    "game":  "a brown deer stag with small antlers, standing side-on, facing left",
    "fish":  "a single silvery-blue fish leaping in an arc out of a small splash of blue water, with a few droplets",
    "ore":   "a small heap of grey rocks with glittering violet crystals and gold-orange ore nuggets",
}

WALLS_PROMPT = """A ring of low grey-brown stone city walls for a hex strategy board game, drawn on top of a city map tile. The walls run along the six edges of a pointy-top hexagon that fills the frame, seen at the slight 3/4 top-down view of a hex map tile, with small crenellations, a short round tower at each of the six corners and a wooden gate in the bottom edge. The walls are a thin closed ring: the whole inside of the ring is empty plain pure white, nothing inside it.

{style}"""

ICON_TEMPLATE = """A small square game interface icon for a strategy board game: {subject}. Centred, a bold simple shape that fills most of the square and reads at 32 px. No badge, no circle or tile behind it.

{style}"""

ICONS = {
    "star":          "a plump golden five-pointed star with a bright highlight, the game's currency",
    "hunting":       "a hunting spear crossed with a pair of brown deer antlers",
    "fishing":       "a wooden fishing rod with a silvery-blue fish hooked on the line",
    "riding":        "a brown horse head in profile with a leather bridle",
    "climbing":      "a grey rocky mountain peak with a coil of rope and a pickaxe in front of it",
    "archery":       "a drawn wooden bow with an arrow nocked, pointing up and to the right",
    "fortification": "a short section of grey stone wall with crenellations and a small round tower",
}

STYLE_REF = "Match the drawing style of the reference image exactly (ink outlines, shading, colours), but draw only the subject described below, not the reference's subject.\n\n"

SPRITE_SIZE = 256    # longest side of a saved unit, overlay prop or icon, in px
WALLS_WIDTH = 256    # the walls ring is saved as wide as a tile


def build_prompt(terrain, theme, variant):
    var = f"Variation {variant} of a set: same style, same palette, different arrangement." if variant > 1 else ""
    subject = TERRAIN_OVERRIDES.get((theme, terrain), TERRAINS[terrain])
    return STYLE.format(terrain=subject, palette=PALETTES[theme], variation=var)


CALLS = 0


def call_gemini(client, prompt, ref_img=None, ref_text=TILE_REF, retries=4):
    global CALLS
    contents = [prompt]
    if ref_img is not None:
        contents = [ref_img, ref_text + prompt]
    for attempt in range(retries):
        try:
            CALLS += 1
            resp = client.models.generate_content(
                model=MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE"],
                    image_config=types.ImageConfig(aspect_ratio="1:1"),
                ),
            )
            for part in resp.candidates[0].content.parts:
                if part.inline_data and part.inline_data.mime_type.startswith("image/"):
                    return Image.open(BytesIO(part.inline_data.data)).convert("RGBA")
            raise RuntimeError("no image in the response")
        except Exception as e:  # rate limits, transient errors
            if getattr(e, "code", None) in (400, 401, 402, 403):   # bad request, key or billing: retrying won't help
                raise
            wait = 5 * (attempt + 1)
            print(f"   error ({e}); retrying in {wait}s", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("generation failed")


def remove_white_bg(img, tol=28):
    """Flood fill from the four corners: makes only the outer white transparent."""
    img = img.convert("RGBA")
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    rgb = img.convert("RGB")
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(rgb, seed, (255, 0, 255), thresh=tol)
    px = rgb.load(); mp = mask.load()
    for y in range(h):
        for x in range(w):
            if px[x, y] == (255, 0, 255):
                mp[x, y] = 255
    out = img.copy()
    alpha = out.getchannel("A")
    alpha.paste(0, mask=mask)
    out.putalpha(alpha)
    return out


def remove_white_holes(img, tol=28, min_area=0.0008, min_pure=0.6):
    """Also clears enclosed background (between legs, inside a bow or the walls ring): opaque
    near-white regions not reached from the corners. A region goes only if it is large and mostly
    pure white, so tinted highlights on the art stay."""
    w, h = img.size
    px = img.load()
    lo = 255 - tol
    cand = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and min(r, g, b) >= lo:
                cand[y * w + x] = 1
    seen = bytearray(w * h)
    for start in range(w * h):
        if not cand[start] or seen[start]:
            continue
        region, pure, queue = [], 0, deque([start])
        seen[start] = 1
        while queue:
            i = queue.popleft()
            region.append(i)
            r, g, b, _ = px[i % w, i // w]
            if min(r, g, b) >= 250:
                pure += 1
            x, y = i % w, i // w
            for j in ((i - 1) if x > 0 else -1, (i + 1) if x < w - 1 else -1, i - w, i + w):
                if 0 <= j < w * h and cand[j] and not seen[j]:
                    seen[j] = 1
                    queue.append(j)
        if len(region) >= min_area * w * h and pure >= min_pure * len(region):
            for i in region:
                r, g, b, _ = px[i % w, i // w]
                px[i % w, i // w] = (r, g, b, 0)
    return img


def crop_and_resize(img, width):
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    ratio = width / img.width
    return img.resize((width, round(img.height * ratio)), Image.LANCZOS)


def crop_and_fit(img, size):
    """Crops to the opaque pixels and scales so the longest side is `size`."""
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    ratio = size / max(img.size)
    return img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)


def run_tiles(client, args, ref_img):
    out = Path(args.out or "assets/raw/tiles")
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}

    jobs = []
    for theme in args.themes:
        for terrain in args.terrains:
            n = args.variants or VARIANTS_DEFAULT.get(terrain, 1)
            for v in range(1, n + 1):
                jobs.append((theme, terrain, v))
    print(f"{len(jobs)} tiles to generate with {MODEL}")

    for i, (theme, terrain, v) in enumerate(jobs, 1):
        dest = out / theme / f"{terrain}_{v}.png"
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            print(f"[{i}/{len(jobs)}] {dest} exists, skipping")
            continue
        print(f"[{i}/{len(jobs)}] {theme}/{terrain} v{v} ...")
        img = call_gemini(client, build_prompt(terrain, theme, v), ref_img)
        if args.keep_raw:
            img.save(dest.with_suffix(".raw.png"))
        img = crop_and_resize(remove_white_bg(img), args.width)
        img.save(dest)
        manifest.setdefault(theme, {}).setdefault(terrain, [])
        if dest.name not in manifest[theme][terrain]:
            manifest[theme][terrain].append(dest.name)
        manifest_path.write_text(json.dumps(manifest, indent=1))
        time.sleep(args.sleep)
    print("done:", manifest_path)


def sprite_jobs(args, ref_img):
    """(name, prompt, reference image or a path to load later, reference text, fit) per sprite."""
    style = SPRITE_STYLE
    if args.category == "units":
        jobs = []
        colours = args.colours or list(COLOURS)
        for unit in args.names or list(UNITS):
            subject, parts = UNITS[unit]
            # Blue first: the other colours use it as their reference.
            for colour in sorted(colours, key=lambda c: c != "blue"):
                prompt = UNIT_TEMPLATE.format(subject=subject, colour=COLOURS[colour], parts=parts, style=style)
                if colour == "blue":
                    jobs.append((f"{unit}_{colour}", prompt, ref_img, STYLE_REF, ("fit", SPRITE_SIZE)))
                else:
                    ref_path = Path(args.out or "assets/raw/units") / f"{unit}_blue.png"
                    jobs.append((f"{unit}_{colour}", prompt, ref_path,
                                 UNIT_RECOLOUR_REF.format(colour=COLOURS[colour]), ("fit", SPRITE_SIZE)))
        return jobs
    if args.category == "overlays":
        jobs = []
        for name in args.names or [*OVERLAYS, "walls"]:
            if name == "walls":
                jobs.append((name, WALLS_PROMPT.format(style=style), ref_img, STYLE_REF, ("width", WALLS_WIDTH)))
            else:
                jobs.append((name, OVERLAY_TEMPLATE.format(subject=OVERLAYS[name], style=style), ref_img, STYLE_REF,
                             ("fit", SPRITE_SIZE)))
        return jobs
    return [(name, ICON_TEMPLATE.format(subject=ICONS[name], style=style), ref_img, STYLE_REF, ("fit", SPRITE_SIZE))
            for name in args.names or list(ICONS)]


def run_sprites(client, args, ref_img):
    out = Path(args.out or f"assets/raw/{args.category}")
    out.mkdir(parents=True, exist_ok=True)
    jobs = sprite_jobs(args, ref_img)
    print(f"{len(jobs)} {args.category} to generate with {MODEL}")
    for i, (name, prompt, ref, ref_text, (mode, size)) in enumerate(jobs, 1):
        dest = out / f"{name}.png"
        if dest.exists():
            print(f"[{i}/{len(jobs)}] {dest} exists, skipping")
            continue
        if isinstance(ref, Path):
            if not ref.exists():
                print(f"[{i}/{len(jobs)}] {name}: reference {ref} missing, skipping", file=sys.stderr)
                continue
            ref = Image.open(ref).convert("RGBA")
            flat = Image.new("RGB", ref.size, (255, 255, 255))
            flat.paste(ref, mask=ref.getchannel("A"))
            ref = flat
        print(f"[{i}/{len(jobs)}] {args.category}/{name} ...")
        img = call_gemini(client, prompt, ref, ref_text)
        if args.keep_raw:
            img.save(dest.with_suffix(".raw.png"))
        img = remove_white_holes(remove_white_bg(img))
        img = crop_and_fit(img, size) if mode == "fit" else crop_and_resize(img, size)
        img.save(dest)
        time.sleep(args.sleep)
    print("done:", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", choices=["tiles", "units", "overlays", "icons"], default="tiles")
    ap.add_argument("--out", help="output folder (default assets/raw/<category>)")
    ap.add_argument("--themes", nargs="*", default=list(PALETTES), help="tiles only")
    ap.add_argument("--terrains", nargs="*", default=list(TERRAINS), help="tiles only")
    ap.add_argument("--variants", type=int, help="tiles only: force the same number of variants for every terrain")
    ap.add_argument("--names", nargs="*", help="units, overlays, icons: which ones (unit types for units)")
    ap.add_argument("--colours", nargs="*", choices=list(COLOURS), help="units only")
    ap.add_argument("--ref", help="style reference PNG (one of your tiles); for units, used for blue only")
    ap.add_argument("--width", type=int, default=256, help="tiles only: final tile width in px")
    ap.add_argument("--sleep", type=float, default=1.0, help="pause between calls")
    ap.add_argument("--keep-raw", action="store_true", help="also save the raw PNG")
    args = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("set GEMINI_API_KEY")
    client = genai.Client(api_key=key)
    ref_img = None
    if args.ref:
        ref = Image.open(args.ref).convert("RGBA")
        ref_img = Image.new("RGB", ref.size, (255, 255, 255))
        ref_img.paste(ref, mask=ref.getchannel("A"))

    if args.category == "tiles":
        run_tiles(client, args, ref_img)
    else:
        run_sprites(client, args, ref_img)
    print(f"Gemini calls this run: {CALLS}")


if __name__ == "__main__":
    main()
