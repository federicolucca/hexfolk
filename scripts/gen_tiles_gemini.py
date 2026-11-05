#!/usr/bin/env python3
"""
Generate the hexfolk tile set with Gemini image generation.

  pip install google-genai pillow
  export GEMINI_API_KEY=...
  python scripts/gen_tiles_gemini.py                 # everything
  python scripts/gen_tiles_gemini.py --themes greenlands --terrains forest --variants 2
  python scripts/gen_tiles_gemini.py --ref assets/style_ref.png   # use one of your tiles as a style reference

Output: assets/raw/tiles/<theme>/<terrain>_<n>.png (transparent background, cropped)
plus assets/raw/tiles/manifest.json.
It resumes where it stopped: files that already exist are skipped.
"""
import argparse, json, os, sys, time
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from google import genai
from google.genai import types

MODEL = "gemini-3.1-flash-image"   # alternatively "gemini-2.5-flash-image"

STYLE = """A single game map tile: a pointy-top hexagon, centered, filling the frame, on a plain pure white background, nothing outside the hexagon.

Style: hand-drawn cartoon illustration for a strategy board game. Thick, slightly irregular dark brown-green ink outlines. Soft painterly shading with a light source from the top-left: rounded highlights on the upper-left of every shape, deeper shadow tones on the lower-right, soft blurred drop shadows on the ground. Saturated but earthy colors. The hexagon ground has a gentle radial gradient, lighter in the center and darker toward the edges, with a thin lighter inner border just inside the dark outline. Slight 3/4 top-down perspective. Small scattered grass ticks on the ground. No text, no watermark, no visible brush texture, clean vector-like edges.

Subject: {terrain}

Biome palette: {palette}
{variation}"""

TERRAINS = {
    "grass":    "an almost empty grassy ground with a few grass ticks, one small pebble and at most one small lollipop-shaped tree",
    "forest":   "a dense cluster of bushy round-topped trees forming a ring with a small sunlit clearing in the middle, bulbous cloud-like canopies in overlapping lobes, a few short dark trunks peeking out underneath",
    "mountain": "a large craggy brown rock formation with angular facets and a dark cave opening at its base, loose boulders around it, two small lollipop-shaped trees beside it",
    "hill":     "two rounded grassy hills with soft shading and a couple of small lollipop trees",
    "water":    "calm water with a few soft curved wave highlights, no land at all",
    "village":  "two small cottages in 3/4 view with pale plaster walls, tiled brown roofs, a stone chimney, a tiny dirt path, a few round lollipop trees",
    "capital":  "a small stone castle with two round towers with conical roofs, crenellated walls, a central keep with a flag",
    "ruins":    "a ruined stone wall with a broken arch and crumbled pillars overgrown by one bushy tree, scattered stone blocks",
}

PALETTES = {
    "greenlands": "fresh meadow greens, warm brown rock, cream walls, terracotta roofs",
    "drylands":   "ochre and sand ground, olive-green vegetation, red-brown roofs",
    "icelands":   "pale blue-grey ground, dark teal conifers instead of round trees, snow-capped rocks, slate roofs",
    "deadlands":  "dusty mauve-grey ground, dark purple-grey dead vegetation, dark rock, wine-red roofs",
}

VARIANTS_DEFAULT = {"grass": 3, "forest": 3, "hill": 2}   # all others: 1


def build_prompt(terrain, theme, variant):
    var = f"Variation {variant} of a set: same style, same palette, different arrangement." if variant > 1 else ""
    return STYLE.format(terrain=TERRAINS[terrain], palette=PALETTES[theme], variation=var)


def call_gemini(client, prompt, ref_img=None, retries=4):
    contents = [prompt]
    if ref_img is not None:
        contents = [ref_img, "Match the drawing style of this reference tile exactly. " + prompt]
    for attempt in range(retries):
        try:
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


def crop_and_resize(img, width):
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    ratio = width / img.width
    return img.resize((width, round(img.height * ratio)), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="assets/raw/tiles")
    ap.add_argument("--themes", nargs="*", default=list(PALETTES))
    ap.add_argument("--terrains", nargs="*", default=list(TERRAINS))
    ap.add_argument("--variants", type=int, help="force the same number of variants for every terrain")
    ap.add_argument("--ref", help="style reference PNG (one of your tiles)")
    ap.add_argument("--width", type=int, default=256, help="final tile width in px")
    ap.add_argument("--sleep", type=float, default=1.0, help="pause between calls")
    ap.add_argument("--keep-raw", action="store_true", help="also save the raw PNG")
    args = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("set GEMINI_API_KEY")
    client = genai.Client(api_key=key)
    ref_img = Image.open(args.ref).convert("RGB") if args.ref else None

    out = Path(args.out)
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


if __name__ == "__main__":
    main()
