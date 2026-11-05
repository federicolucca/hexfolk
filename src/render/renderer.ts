// Draws the map on a 2D canvas. Reads game data; never changes it.
import type { Hex } from '../core/hex';
import type { GameMap } from '../core/map';
import { type Camera, canvasTransform, type Viewport } from './camera';
import { hexCorners, hexToPixel } from './layout';
import { PALETTE } from './palette';
import type { SpriteSheet } from './sprites';
import { citiesByHex, hexKey, spriteNameFor } from './spriteMap';

export interface Scene {
  map: GameMap;
  sprites: SpriteSheet;
  camera: Camera;
  viewport: Viewport;
  pixelRatio: number;
  selected: Hex | null;
}

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { map, sprites, camera, viewport, pixelRatio, selected } = scene;

  // Sea background, in screen space.
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  const radius = Math.hypot(viewport.width, viewport.height) / 2;
  const sea = ctx.createRadialGradient(viewport.width / 2, viewport.height / 2, 0, viewport.width / 2, viewport.height / 2, radius);
  sea.addColorStop(0, PALETTE.backgroundCentre);
  sea.addColorStop(1, PALETTE.background);
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, viewport.width, viewport.height);

  // Map, in world space. Tiles are row-major, so drawing in order goes back to front.
  ctx.setTransform(...canvasTransform(camera, viewport, pixelRatio));
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // The selection is drawn once its row is done, so the rows in front still cover it.
  const cities = citiesByHex(map);
  map.tiles.forEach((tile, i) => {
    const sprite = sprites.byName.get(spriteNameFor(tile, cities[hexKey(tile.q, tile.r)]));
    if (sprite) {
      const p = hexToPixel(tile, sprites.tile);
      ctx.drawImage(sprite.image, p.x - sprite.anchor.x, p.y - sprite.anchor.y);
    }
    const endOfRow = (i + 1) % map.width === 0;
    if (selected && endOfRow && selected.r === tile.r) drawSelection(ctx, selected, sprites, camera.zoom);
  });
}

function drawSelection(ctx: CanvasRenderingContext2D, hex: Hex, sprites: SpriteSheet, zoom: number): void {
  const corners = hexCorners(hex, sprites.tile);
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
