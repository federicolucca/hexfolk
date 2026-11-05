// Draws the game on a 2D canvas from the theme and common atlases. Reads game data and the UI's
// highlights; never decides anything.
import type { City, GameState, HexRef, Unit } from '../core/state';
import { type AtlasFrame, frameName, unitFrameName } from './atlas';
import type { Loaded, LoadedAtlas, LoadedCommon } from './atlasLoader';
import { type Camera, canvasTransform, type Viewport } from './camera';
import { hexCorners, hexToPixel, type Point, type TileMetrics } from './layout';
import { PALETTE } from './palette';

export interface Highlights {
  /** The tapped hex (outlined). */
  selected: HexRef | null;
  /** Hexes the selected unit can move to (dotted). */
  reach: HexRef[];
  /** Hexes the selected unit can attack (red ring). */
  targets: HexRef[];
  /** Units drawn faded: the human's units that have nothing left to do this turn. */
  done: number[];
}

export interface Scene {
  game: GameState;
  theme: LoadedAtlas;
  common: LoadedCommon;
  camera: Camera;
  viewport: Viewport;
  pixelRatio: number;
  highlights: Highlights;
}

/** Use the @2x atlas once a 1x atlas pixel would cover more than this many device pixels. */
export const HD_THRESHOLD = 1.15;
/** Units are drawn at this scale of their 96 px atlas box, standing a little below the hex centre. */
const UNIT_SCALE = 0.8;
const UNIT_FOOT_OFFSET = 26;

export function wantsHd(camera: Camera, pixelRatio: number): boolean {
  return camera.zoom * pixelRatio > HD_THRESHOLD;
}

const key = (h: HexRef): string => `${h.q},${h.r}`;

function drawFrame(
  ctx: CanvasRenderingContext2D,
  loaded: Loaded<{ images: { '1': string; '2': string } }>,
  hd: boolean,
  frame: AtlasFrame,
  at: Point,
  scale = 1,
): void {
  const dx = at.x - frame.anchor.x * scale;
  const dy = at.y - frame.anchor.y * scale;
  const w = frame.w * scale;
  const h = frame.h * scale;
  if (hd && loaded.hd) ctx.drawImage(loaded.hd, frame.x * 2, frame.y * 2, frame.w * 2, frame.h * 2, dx, dy, w, h);
  else ctx.drawImage(loaded.image, frame.x, frame.y, frame.w, frame.h, dx, dy, w, h);
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { game, theme, common, camera, viewport, pixelRatio, highlights } = scene;
  const metrics = theme.atlas.tile;

  // Background, in screen space.
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const radius = Math.hypot(viewport.width, viewport.height) / 2;
  const bg = ctx.createRadialGradient(viewport.width / 2, viewport.height / 2, 0, viewport.width / 2, viewport.height / 2, radius);
  bg.addColorStop(0, PALETTE.backgroundCentre);
  bg.addColorStop(1, PALETTE.background);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // World space (1x atlas pixels). Row by row, back to front: tiles, then what stands on them.
  ctx.setTransform(...canvasTransform(camera, viewport, pixelRatio));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const hd = wantsHd(camera, pixelRatio);
  const cities = new Map<string, City>(game.cities.map((c) => [key(c), c]));
  const units = new Map<string, Unit>(game.units.map((u) => [key(u), u]));
  const reach = new Set(highlights.reach.map(key));
  const targets = new Set(highlights.targets.map(key));
  const done = new Set(highlights.done);

  for (let row = 0; row < game.height; row++) {
    const tiles = game.tiles.slice(row * game.width, (row + 1) * game.width);
    for (const tile of tiles) {
      const city = cities.get(key(tile));
      const name = frameName(theme.atlas, game.seed, tile, city);
      const frame = name ? theme.atlas.frames[name] : undefined;
      if (frame) drawFrame(ctx, theme, hd, frame, hexToPixel(tile, metrics));
    }
    for (const tile of tiles) {
      const city = cities.get(key(tile));
      if (city && city.owner !== null) drawFlag(ctx, hexToPixel(tile, metrics), metrics.width, PALETTE.players[city.owner]?.colour);
    }
    for (const tile of tiles) {
      if (reach.has(key(tile))) drawReach(ctx, hexToPixel(tile, metrics), metrics);
      if (targets.has(key(tile))) drawTarget(ctx, tile, metrics, camera.zoom);
    }
    if (highlights.selected?.r === row) drawSelection(ctx, highlights.selected, metrics, camera.zoom);
    for (const tile of tiles) {
      const unit = units.get(key(tile));
      if (!unit) continue;
      const frame = common.atlas.frames[unitFrameName(unit)];
      if (!frame) continue;
      const centre = hexToPixel(tile, metrics);
      const feet = { x: centre.x, y: centre.y + UNIT_FOOT_OFFSET };
      ctx.globalAlpha = done.has(unit.id) ? 0.55 : 1;
      drawShadow(ctx, feet);
      drawFrame(ctx, common, hd, frame, feet, UNIT_SCALE);
      ctx.globalAlpha = 1;
    }
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, feet: Point): void {
  ctx.fillStyle = PALETTE.unitShadow;
  ctx.beginPath();
  ctx.ellipse(feet.x, feet.y - 2, 22, 7, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** A small pennant in the owner's colour, on the upper right of the hex. */
function drawFlag(ctx: CanvasRenderingContext2D, centre: Point, tileWidth: number, colour: string | undefined): void {
  if (!colour) return;
  const u = tileWidth / 128;
  const x = centre.x + 30 * u;
  const base = centre.y - 6 * u;
  const top = base - 40 * u;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 3 * u;
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x, top);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x + 22 * u, top + 7 * u);
  ctx.lineTo(x, top + 15 * u);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.lineWidth = 2 * u;
  ctx.stroke();
}

function hexPath(ctx: CanvasRenderingContext2D, hex: HexRef, m: TileMetrics, shrink = 1): void {
  const c = hexToPixel(hex, m);
  const corners = hexCorners(hex, m);
  ctx.beginPath();
  corners.forEach((p, i) => {
    const x = c.x + (p.x - c.x) * shrink;
    const y = c.y + (p.y - c.y) * shrink;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawReach(ctx: CanvasRenderingContext2D, centre: Point, m: TileMetrics): void {
  const r = m.width * 0.11;
  ctx.fillStyle = PALETTE.reachFill;
  ctx.strokeStyle = PALETTE.reachStroke;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawTarget(ctx: CanvasRenderingContext2D, hex: HexRef, m: TileMetrics, zoom: number): void {
  hexPath(ctx, hex, m, 0.86);
  ctx.fillStyle = PALETTE.targetFill;
  ctx.fill();
  ctx.lineWidth = Math.max(3, 4 / zoom);
  ctx.strokeStyle = PALETTE.targetStroke;
  ctx.stroke();
}

function drawSelection(ctx: CanvasRenderingContext2D, hex: HexRef, m: TileMetrics, zoom: number): void {
  hexPath(ctx, hex, m);
  ctx.fillStyle = PALETTE.selectionFill;
  ctx.fill();
  // Keep the outline about 3 screen pixels wide at any zoom.
  ctx.lineJoin = 'round';
  ctx.shadowColor = PALETTE.selectionGlow;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3 / zoom;
  ctx.strokeStyle = PALETTE.selectionStroke;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}
