// Packs the tile art into one atlas per theme: public/atlas/<theme>.png (128 px tiles),
// <theme>@2x.png (256 px tiles, for HiDPI and close zoom) and <theme>.json.
// Run with `npm run atlas` (also runs before `npm run build`). Node strips the types itself.
//
// The art is only ever resized and padded with transparent pixels: each tile is scaled so its hex
// is 256 px wide at 2x. Its pixels are not otherwise changed.
//
// Units, resource overlays, the walls ring and HUD icons (assets/raw/{units,overlays,icons}) go
// into one shared atlas, public/atlas/common.png, common@2x.png and common.json, with frames named
// "<folder>/<file>" (e.g. "units/warrior_blue"). They are only cropped and resized too.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { faceCentreY, type HexMeasure, measureHex, median, packGrid, themeGeometry } from './atlas-geometry.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = join(ROOT, 'assets', 'raw', 'tiles');
const OUT = join(ROOT, 'public', 'atlas');

/** Hex width in the @2x atlas; the 1x atlas is exactly half. */
const HD_WIDTH = 256;
const COLUMNS = 4;
const HD_PADDING = 4;
/** Neighbouring tiles overlap by this much (1x px) so their outlines meet with no seam. */
const OVERLAP_X = 1;
const OVERLAP_Y = 1.5;
/** The build warns about a tile whose hex is more than this much shorter than its theme's median. */
const SHORT_TOLERANCE = 0.03;

type SourceManifest = Record<string, Record<string, string[]>>;

interface Tile {
  name: string;
  terrain: string;
  file: string;
  measure: HexMeasure;
  sourceWidth: number;
  sourceHeight: number;
}

const even = (n: number): number => 2 * Math.round(n / 2);
const blank = (width: number, height: number): Sharp =>
  sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
const round2 = (n: number): number => Math.round(n * 100) / 100;

async function readTile(file: string, name: string, terrain: string): Promise<Tile> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = new Uint8Array(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * info.channels + 3] ?? 0;
  const measure = measureHex({ width: info.width, height: info.height, alpha });
  return { name, terrain, file, measure, sourceWidth: info.width, sourceHeight: info.height };
}

async function buildTheme(theme: string, terrains: Record<string, string[]>): Promise<void> {
  const tiles: Tile[] = [];
  for (const [terrain, files] of Object.entries(terrains)) {
    for (const file of files) {
      tiles.push(await readTile(join(SOURCE, theme, file), file.replace(/\.png$/, ''), terrain));
    }
  }
  const geometry = themeGeometry(tiles.map((t) => t.measure));

  // Scale every tile so its hex is HD_WIDTH wide; sizes are even so the 1x atlas is exactly half.
  // A hex drawn noticeably shorter than the theme's median would leave gaps around it: the build
  // only warns, and the fix is to regenerate that tile (docs/ART.md).
  const span = (t: Tile): number => (t.measure.bottom - t.measure.top) * (HD_WIDTH / t.measure.width);
  const medianSpan = median(tiles.map(span));
  const scaled = tiles.map((t) => {
    const s = HD_WIDTH / t.measure.width;
    if (span(t) < medianSpan * (1 - SHORT_TOLERANCE)) {
      console.warn(`  warning: ${theme}/${t.name}: hex is ${Math.round(span(t))} px tall, median ${Math.round(medianSpan)}: regenerate it`);
    }
    const centreY = faceCentreY(t.measure, geometry) * s;
    return { tile: t, scale: s, centreY, width: even(t.sourceWidth * s), height: even(t.sourceHeight * s) };
  });
  const grid = packGrid(scaled, COLUMNS, HD_PADDING);

  const hdLayers: OverlayOptions[] = [];
  const sdLayers: OverlayOptions[] = [];
  const frames: Record<string, unknown> = {};
  for (const [i, entry] of scaled.entries()) {
    const pos = grid.positions[i];
    if (!pos) throw new Error('packing failed');
    const hd = await sharp(entry.tile.file).resize(entry.width, entry.height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    const sd = await sharp(entry.tile.file)
      .resize(entry.width / 2, entry.height / 2, { fit: 'fill', kernel: 'lanczos3' })
      .png()
      .toBuffer();
    hdLayers.push({ input: hd, left: pos.x, top: pos.y });
    sdLayers.push({ input: sd, left: pos.x / 2, top: pos.y / 2 });
    const m = entry.tile.measure;
    frames[entry.tile.name] = {
      x: pos.x / 2,
      y: pos.y / 2,
      w: entry.width / 2,
      h: entry.height / 2,
      anchor: { x: round2((m.centreX * entry.scale) / 2), y: round2(entry.centreY / 2) },
    };
  }

  await blank(grid.width, grid.height).composite(hdLayers).png({ compressionLevel: 9 }).toFile(join(OUT, `${theme}@2x.png`));
  await blank(grid.width / 2, grid.height / 2).composite(sdLayers).png({ compressionLevel: 9 }).toFile(join(OUT, `${theme}.png`));

  // Spacing in 1x px. Hexes tile with a column step of one width and a row step of cap + side.
  const k = HD_WIDTH / geometry.width / 2;
  const variants: Record<string, string[]> = {};
  for (const t of tiles) (variants[t.terrain] ??= []).push(t.name);
  const atlas = {
    theme,
    images: { '1': `${theme}.png`, '2': `${theme}@2x.png` },
    tile: {
      width: HD_WIDTH / 2,
      columnStep: HD_WIDTH / 2 - OVERLAP_X,
      rowStep: round2((geometry.cap + geometry.side) * k - OVERLAP_Y),
      faceHeight: round2((2 * geometry.cap + geometry.side) * k),
    },
    frames,
    variants,
  };
  await writeFile(join(OUT, `${theme}.json`), `${JSON.stringify(atlas, null, 2)}\n`);
  console.log(
    `${theme.padEnd(11)} ${tiles.length} tiles, atlas ${grid.width / 2}x${grid.height / 2} (+@2x), row step ${atlas.tile.rowStep}`,
  );
}

/**
 * Sprites shared by every theme, by source folder: each is scaled to fit a square box of this many
 * 1x px (its longest side), or, with `width`, to that width. Units stand on their feet (anchor at
 * the bottom centre); everything else is anchored at its centre.
 */
const COMMON: Record<string, { box?: number; width?: number; anchor: 'feet' | 'centre' }> = {
  units: { box: 96, anchor: 'feet' },
  overlays: { box: 56, anchor: 'centre' },
  icons: { box: 48, anchor: 'centre' },
};
/** Per-sprite overrides: the walls ring is as wide as a hex. */
const COMMON_OVERRIDES: Record<string, { box?: number; width?: number }> ={ 'overlays/walls': { width: HD_WIDTH / 2 } };
/** Shelf packing: rows of sprites up to this wide in the @2x atlas. */
const COMMON_HD_MAX_WIDTH = 2048;

async function buildCommon(): Promise<void> {
  const sprites: { name: string; file: string; width: number; height: number; anchor: 'feet' | 'centre' }[] = [];
  for (const [folder, spec] of Object.entries(COMMON)) {
    const dir = join(ROOT, 'assets', 'raw', folder);
    const files = (await readdir(dir).catch(() => [] as string[]))
      .filter((f) => f.endsWith('.png') && !f.endsWith('.raw.png'))
      .sort();
    for (const f of files) {
      const name = `${folder}/${f.replace(/\.png$/, '')}`;
      const file = join(dir, f);
      const meta = await sharp(file).metadata();
      const sw = meta.width ?? 1;
      const sh = meta.height ?? 1;
      const fit = COMMON_OVERRIDES[name] ?? spec;
      const s = fit.width ? (2 * fit.width) / sw : (2 * (fit.box ?? 64)) / Math.max(sw, sh);
      sprites.push({ name, file, width: even(sw * s), height: even(sh * s), anchor: spec.anchor });
    }
  }
  if (sprites.length === 0) return;

  // Tallest first, left to right in rows; every size and offset is even so 1x is exactly half.
  const order = [...sprites.keys()].sort((a, b) => (sprites[b]?.height ?? 0) - (sprites[a]?.height ?? 0));
  const positions: { x: number; y: number }[] = [];
  let x = HD_PADDING;
  let y = HD_PADDING;
  let rowHeight = 0;
  let width = 0;
  for (const i of order) {
    const sprite = sprites[i];
    if (!sprite) continue;
    if (x + sprite.width + HD_PADDING > COMMON_HD_MAX_WIDTH && x > HD_PADDING) {
      x = HD_PADDING;
      y += rowHeight + 2 * HD_PADDING;
      rowHeight = 0;
    }
    positions[i] = { x, y };
    x += sprite.width + 2 * HD_PADDING;
    width = Math.max(width, x - HD_PADDING);
    rowHeight = Math.max(rowHeight, sprite.height);
  }
  const height = even(y + rowHeight + HD_PADDING);

  const hdLayers: OverlayOptions[] = [];
  const sdLayers: OverlayOptions[] = [];
  const frames: Record<string, unknown> = {};
  for (const [i, sprite] of sprites.entries()) {
    const pos = positions[i];
    if (!pos) throw new Error('packing failed');
    const resized = (w: number, h: number): Promise<Buffer> =>
      sharp(sprite.file).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
    hdLayers.push({ input: await resized(sprite.width, sprite.height), left: pos.x, top: pos.y });
    sdLayers.push({ input: await resized(sprite.width / 2, sprite.height / 2), left: pos.x / 2, top: pos.y / 2 });
    const w = sprite.width / 2;
    const h = sprite.height / 2;
    frames[sprite.name] = {
      x: pos.x / 2,
      y: pos.y / 2,
      w,
      h,
      anchor: sprite.anchor === 'feet' ? { x: w / 2, y: h } : { x: w / 2, y: h / 2 },
    };
  }
  await blank(width, height).composite(hdLayers).png({ compressionLevel: 9 }).toFile(join(OUT, 'common@2x.png'));
  await blank(width / 2, height / 2).composite(sdLayers).png({ compressionLevel: 9 }).toFile(join(OUT, 'common.png'));
  const atlas = { images: { '1': 'common.png', '2': 'common@2x.png' }, frames };
  await writeFile(join(OUT, 'common.json'), `${JSON.stringify(atlas, null, 2)}\n`);
  console.log(`common      ${sprites.length} sprites, atlas ${width / 2}x${height / 2} (+@2x)`);
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(join(SOURCE, 'manifest.json'), 'utf8')) as SourceManifest;
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  for (const [theme, terrains] of Object.entries(manifest)) await buildTheme(theme, terrains);
  await buildCommon();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
