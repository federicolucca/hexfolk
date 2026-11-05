// Draws the map on a 2D canvas from a theme atlas. Reads game data; never changes it.
import type { Hex } from '../core/hex';
import type { City, GameMap } from '../core/map';
import { frameName } from './atlas';
import type { LoadedAtlas } from './atlasLoader';
import { type Camera, canvasTransform, type Viewport } from './camera';
import { hexCorners, hexToPixel, type Point } from './layout';
import { PALETTE } from './palette';

export interface Scene {
  map: GameMap;
  atlas: LoadedAtlas;
  camera: Camera;
  viewport: Viewport;
  pixelRatio: number;
  selected: Hex | null;
}

/** Use the @2x atlas once a 1x atlas pixel would cover more than this many device pixels. */
export const HD_THRESHOLD = 1.15;

export function wantsHd(camera: Camera, pixelRatio: number): boolean {
  return camera.zoom * pixelRatio > HD_THRESHOLD;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { map, atlas, camera, viewport, pixelRatio, selected } = scene;
  const metrics = atlas.atlas.tile;

  // Sea background, in screen space.
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const radius = Math.hypot(viewport.width, viewport.height) / 2;
  const sea = ctx.createRadialGradient(viewport.width / 2, viewport.height / 2, 0, viewport.width / 2, viewport.height / 2, radius);
  sea.addColorStop(0, PALETTE.backgroundCentre);
  sea.addColorStop(1, PALETTE.background);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // Map, in world space (1x atlas pixels). Tiles are row-major, so array order is back to front;
  // the row step is a little shorter than the art so neighbouring outlines overlap.
  ctx.setTransform(...canvasTransform(camera, viewport, pixelRatio));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const hd = wantsHd(camera, pixelRatio) ? atlas.hd : null;
  const cities: Record<string, City> = {};
  for (const city of map.cities) cities[`${city.q},${city.r}`] = city;

  map.tiles.forEach((tile, i) => {
    const city = cities[`${tile.q},${tile.r}`];
    const name = frameName(atlas.atlas, map.seed, tile, city);
    const frame = name ? atlas.atlas.frames[name] : undefined;
    const p = hexToPixel(tile, metrics);
    if (frame) {
      const dx = p.x - frame.anchor.x;
      const dy = p.y - frame.anchor.y;
      if (hd) ctx.drawImage(hd, frame.x * 2, frame.y * 2, frame.w * 2, frame.h * 2, dx, dy, frame.w, frame.h);
      else ctx.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, dx, dy, frame.w, frame.h);
    }
    if (city && city.owner !== null) drawFlag(ctx, p, metrics.width, PALETTE.players[city.owner]?.colour);
    // The selection is drawn once its row is done, so the rows in front still cover it.
    if (selected && (i + 1) % map.width === 0 && selected.r === tile.r) drawSelection(ctx, selected, atlas, camera.zoom);
  });
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

function drawSelection(ctx: CanvasRenderingContext2D, hex: Hex, atlas: LoadedAtlas, zoom: number): void {
  const corners = hexCorners(hex, atlas.atlas.tile);
  ctx.beginPath();
  corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
  ctx.closePath();
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
