// Wires the pure map generator, the canvas renderer and the HUD together.
import type { Hex } from './core/hex';
import { type GameMap, generateMap, tileAt } from './core/map';
import {
  type Camera,
  clampCamera,
  fitCamera,
  panBy,
  screenToWorld,
  type Viewport,
  zoomAt,
  zoomLimits,
} from './render/camera';
import { attachInput } from './render/input';
import { type Bounds, mapBounds, pixelToHex } from './render/layout';
import { drawScene } from './render/renderer';
import { loadSprites, type SpriteSheet } from './render/sprites';
import { citiesByHex, hexKey } from './render/spriteMap';
import { describeTile } from './ui/describe';
import { applyPalette, createHud } from './ui/hud';
import { parsePlayers, parseSeed, randomSeed, withSeed } from './ui/url';

const MAX_PIXEL_RATIO = 2;

async function start(app: HTMLElement): Promise<void> {
  applyPalette(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.className = 'hf-canvas';
  canvas.setAttribute('aria-label', 'Map');
  app.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const hud = createHud(app, () => newMap(randomSeed()));
  hud.setMessage('Loading…');

  const players = parsePlayers(location.search);
  let seed = parseSeed(location.search) ?? randomSeed();
  let map: GameMap = generateMap(seed, players);
  let sprites: SpriteSheet | null = null;
  let bounds: Bounds | null = null;
  let viewport: Viewport = { width: 1, height: 1 };
  let pixelRatio = 1;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let selected: Hex | null = null;
  let frame = 0;

  const requestDraw = (): void => {
    if (frame || !sprites) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (sprites) drawScene(ctx, { map, sprites, camera, viewport, pixelRatio, selected });
    });
  };

  const setCamera = (next: Camera): void => {
    camera = bounds ? clampCamera(next, bounds, zoomLimits(bounds, viewport)) : next;
    requestDraw();
  };

  const showSeed = (): void => {
    hud.setSeed(seed);
    history.replaceState(null, '', withSeed(location.search, seed));
  };

  function newMap(next: number): void {
    seed = next;
    map = generateMap(seed, players);
    selected = null;
    hud.setSelection(null);
    showSeed();
    if (sprites) {
      bounds = mapBounds(map.tiles, sprites.tile, sprites.above, sprites.below);
      camera = fitCamera(bounds, viewport);
    }
    requestDraw();
  }

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    viewport = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(viewport.width * pixelRatio);
    canvas.height = Math.round(viewport.height * pixelRatio);
    setCamera(camera);
    // Resizing clears the canvas, so draw now rather than on the next frame.
    if (sprites) drawScene(ctx, { map, sprites, camera, viewport, pixelRatio, selected });
  };

  showSeed();
  resize();
  new ResizeObserver(resize).observe(canvas);

  sprites = await loadSprites(`${import.meta.env.BASE_URL}sprites/`);
  bounds = mapBounds(map.tiles, sprites.tile, sprites.above, sprites.below);
  camera = fitCamera(bounds, viewport);
  hud.setMessage(null);
  requestDraw();

  attachInput(canvas, {
    onPan: (dx, dy) => setCamera(panBy(camera, dx, dy)),
    onZoom: (factor, at) => {
      if (bounds) setCamera(zoomAt(camera, viewport, at, factor, zoomLimits(bounds, viewport)));
    },
    onTap: (at) => {
      if (!sprites) return;
      const hex = pixelToHex(screenToWorld(camera, viewport, at), sprites.tile);
      const tile = tileAt(map, hex);
      const same = selected && tile && selected.q === tile.q && selected.r === tile.r;
      selected = tile && !same ? { q: tile.q, r: tile.r } : null;
      hud.setSelection(tile && !same ? describeTile(tile, citiesByHex(map)[hexKey(tile.q, tile.r)]) : null);
      requestDraw();
    },
  });
}

const app = document.querySelector<HTMLElement>('#app');
if (app) {
  start(app).catch((err: unknown) => {
    console.error(err);
    app.textContent = `hexfolk could not start: ${err instanceof Error ? err.message : String(err)}`;
  });
}
