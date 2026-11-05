// Wires the pure map generator, the canvas renderer and the HUD together.
import type { Hex } from './core/hex';
import { type GameMap, generateMap, tileAt } from './core/map';
import { type Theme, themeFromSeed } from './core/theme';
import { frameExtents } from './render/atlas';
import { AtlasLoader, type LoadedAtlas } from './render/atlasLoader';
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
import { drawScene, wantsHd } from './render/renderer';
import { describeTile } from './ui/describe';
import { applyPalette, createHud } from './ui/hud';
import { createLegend } from './ui/legend';
import { parsePlayers, parseSeed, parseTheme, randomSeed, withParams } from './ui/url';

const MAX_PIXEL_RATIO = 2;

async function start(app: HTMLElement): Promise<void> {
  applyPalette(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.className = 'hf-canvas';
  canvas.setAttribute('aria-label', 'Map');
  app.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const loader = new AtlasLoader(`${import.meta.env.BASE_URL}atlas/`);
  const players = parsePlayers(location.search);
  let seed = parseSeed(location.search) ?? randomSeed();
  let themeOverride = parseTheme(location.search);
  let map: GameMap = generateMap(seed, players);
  let atlas: LoadedAtlas | null = null;
  let bounds: Bounds | null = null;
  let viewport: Viewport = { width: 1, height: 1 };
  let pixelRatio = 1;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let selected: Hex | null = null;
  let frame = 0;
  let loadToken = 0;

  const theme = (): Theme => themeOverride ?? themeFromSeed(seed);

  const draw = (): void => {
    if (!atlas) return;
    if (wantsHd(camera, pixelRatio)) loader.requestHd(atlas.atlas.theme as Theme, atlas, requestDraw);
    drawScene(ctx, { map, atlas, camera, viewport, pixelRatio, selected });
  };

  function requestDraw(): void {
    if (frame || !atlas) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  const setCamera = (next: Camera): void => {
    camera = bounds ? clampCamera(next, bounds, zoomLimits(bounds, viewport)) : next;
    requestDraw();
  };

  const updateBounds = (refit: boolean): void => {
    if (!atlas) return;
    const { above, below } = frameExtents(atlas.atlas);
    bounds = mapBounds(map.tiles, atlas.atlas.tile, above, below);
    camera = refit ? fitCamera(bounds, viewport) : clampCamera(camera, bounds, zoomLimits(bounds, viewport));
  };

  /** Loads the current theme's atlas (if needed) and redraws. Older requests lose the race. */
  const showTheme = async (refit: boolean): Promise<void> => {
    const token = ++loadToken;
    hud.setTheme(themeOverride, theme());
    legend.setTheme(theme());
    const loaded = await loader.load(theme());
    if (token !== loadToken) return;
    atlas = loaded;
    updateBounds(refit);
    hud.setMessage(null);
    requestDraw();
  };

  const syncUrl = (): void => {
    hud.setSeed(seed);
    history.replaceState(null, '', withParams(location.search, seed, themeOverride));
  };

  const fail = (err: unknown): void => {
    console.error(err);
    hud.setMessage(`Could not load the tiles: ${err instanceof Error ? err.message : String(err)}`);
  };

  const hud = createHud(app, {
    onNewMap: () => {
      seed = randomSeed();
      map = generateMap(seed, players);
      selected = null;
      hud.setSelection(null);
      syncUrl();
      showTheme(true).catch(fail);
    },
    onThemeChange: (next) => {
      themeOverride = next;
      syncUrl();
      showTheme(false).catch(fail);
    },
  });
  hud.setMessage('Loading…');
  const legend = createLegend(app, `${import.meta.env.BASE_URL}atlas/`);

  const resize = (): void => {
    const rect = canvas.getBoundingClientRect();
    viewport = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    canvas.width = Math.round(viewport.width * pixelRatio);
    canvas.height = Math.round(viewport.height * pixelRatio);
    setCamera(camera);
    // Resizing clears the canvas, so draw now rather than on the next frame.
    draw();
  };

  syncUrl();
  resize();
  new ResizeObserver(resize).observe(canvas);
  await showTheme(true);

  attachInput(canvas, {
    onPan: (dx, dy) => setCamera(panBy(camera, dx, dy)),
    onZoom: (factor, at) => {
      if (bounds) setCamera(zoomAt(camera, viewport, at, factor, zoomLimits(bounds, viewport)));
    },
    onTap: (at) => {
      if (!atlas) return;
      const hex = pixelToHex(screenToWorld(camera, viewport, at), atlas.atlas.tile);
      const tile = tileAt(map, hex);
      const same = selected && tile && selected.q === tile.q && selected.r === tile.r;
      selected = tile && !same ? { q: tile.q, r: tile.r } : null;
      const city = tile && map.cities.find((c) => c.q === tile.q && c.r === tile.r);
      hud.setSelection(tile && !same ? describeTile(tile, city) : null);
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
