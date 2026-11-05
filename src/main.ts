// Wires the engine, the canvas renderer and the HUD together. Game rules live in src/core only.
import { passAgent } from './core/agent';
import { income } from './core/economy';
import { newGame } from './core/engine';
import type { HexRef } from './core/state';
import { type Theme, themeFromSeed } from './core/theme';
import { frameExtents } from './render/atlas';
import { AtlasLoader, type LoadedAtlas, type LoadedCommon } from './render/atlasLoader';
import {
  type Camera,
  clampCamera,
  fitCamera,
  panBy,
  screenToWorld,
  type Viewport,
  worldToScreen,
  zoomAt,
  zoomLimits,
} from './render/camera';
import { attachInput } from './render/input';
import { type Bounds, hexToPixel, mapBounds, pixelToHex } from './render/layout';
import { drawScene, wantsHd } from './render/renderer';
import { describeHex, playerName, starsLine, turnLine } from './ui/describe';
import { panelFor } from './ui/panels';
import { applyPalette, createHud } from './ui/hud';
import { Session } from './ui/session';
import { parsePlayers, parseSeed, parseTheme, randomSeed, withParams } from './ui/url';

const MAX_PIXEL_RATIO = 2;
const HUMAN = 0;

async function start(app: HTMLElement): Promise<void> {
  applyPalette(document.documentElement);
  const canvas = document.createElement('canvas');
  canvas.className = 'hf-canvas';
  canvas.setAttribute('aria-label', 'Map');
  app.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is not available');

  const atlasBase = `${import.meta.env.BASE_URL}atlas/`;
  const loader = new AtlasLoader(atlasBase);
  const players = parsePlayers(location.search);
  let seed = parseSeed(location.search) ?? randomSeed();
  let themeOverride = parseTheme(location.search);
  let session = createSession(seed);
  let theme: LoadedAtlas | null = null;
  let common: LoadedCommon | null = null;
  let bounds: Bounds | null = null;
  let viewport: Viewport = { width: 1, height: 1 };
  let pixelRatio = 1;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let frame = 0;
  let loadToken = 0;
  let busy = false;

  function createSession(s: number): Session {
    const agents = Object.fromEntries(Array.from({ length: players }, (_, i) => [i, passAgent]));
    return new Session(newGame({ seed: s, players }), HUMAN, agents);
  }

  const themeName = (): Theme => themeOverride ?? themeFromSeed(seed);

  const draw = (): void => {
    if (!theme || !common) return;
    if (wantsHd(camera, pixelRatio)) {
      loader.requestHd(theme, requestDraw);
      loader.requestHd(common, requestDraw);
    }
    drawScene(ctx, { game: session.state, theme, common, camera, viewport, pixelRatio, highlights: session.highlights() });
  };

  function requestDraw(): void {
    if (frame || !theme) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      draw();
    });
  }

  /** Refreshes every HUD element from the session. */
  const refresh = (): void => {
    const state = session.state;
    hud.setStatus(turnLine(state), starsLine(state, HUMAN, income(state, HUMAN)));
    const info = session.selectedHex ? describeHex(state, session.selectedHex) : null;
    const waiting = `${playerName(state.current)} is playing…`;
    hud.setInfo(info?.title ?? (session.humanToMove ? 'Your turn' : waiting), info?.detail ?? (session.humanToMove ? 'Tap a unit or a city' : ''));
    hud.setEndTurn(session.humanToMove && !busy);
    const panel = session.selectedHex && !busy ? panelFor(state, HUMAN, session.selectedHex) : null;
    hud.setPanel(
      panel?.title ?? null,
      panel?.cards.map((c) => ({
        ...(c.icon ? { icon: c.icon } : {}),
        label: c.label,
        detail: c.detail,
        enabled: c.action !== undefined,
        onClick: () => {
          if (!c.action || busy) return;
          session.act(c.action);
          refresh();
        },
      })),
    );
    requestDraw();
  };

  const setCamera = (next: Camera): void => {
    camera = bounds ? clampCamera(next, bounds, zoomLimits(bounds, viewport)) : next;
    requestDraw();
  };

  const updateBounds = (refit: boolean): void => {
    if (!theme) return;
    const { above, below } = frameExtents(theme.atlas);
    bounds = mapBounds(session.state.tiles, theme.atlas.tile, above, below);
    camera = refit ? fitCamera(bounds, viewport) : clampCamera(camera, bounds, zoomLimits(bounds, viewport));
  };

  /** Loads the current theme's atlas (if needed) and redraws. Older requests lose the race. */
  const showTheme = async (refit: boolean): Promise<void> => {
    const token = ++loadToken;
    hud.setTheme(themeOverride, themeName());
    const [loaded, loadedCommon] = await Promise.all([loader.load(themeName()), loader.loadCommon()]);
    if (token !== loadToken) return;
    theme = loaded;
    common = loadedCommon;
    hud.setCommonAtlas(common, atlasBase);
    updateBounds(refit);
    hud.setMessage(null);
    refresh();
  };

  const syncUrl = (): void => {
    hud.setSeed(seed);
    history.replaceState(null, '', withParams(location.search, seed, themeOverride));
  };

  const fail = (err: unknown): void => {
    console.error(err);
    hud.setMessage(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
  };

  const hud = createHud(app, {
    onNewGame: () => {
      seed = randomSeed();
      session = createSession(seed);
      syncUrl();
      showTheme(true).catch(fail);
    },
    onThemeChange: (next) => {
      themeOverride = next;
      syncUrl();
      showTheme(false).catch(fail);
    },
    onEndTurn: () => {
      if (busy || !session.humanToMove) return;
      busy = true;
      refresh();
      session
        .endTurn(() => refresh())
        .catch(fail)
        .finally(() => {
          busy = false;
          refresh();
        });
    },
  });
  hud.setMessage('Loading…');

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

  const onTap = (hex: HexRef): void => {
    if (busy) return;
    session.tap(hex);
    refresh();
  };

  // ?debug exposes read-only helpers for browser tests (where a hex is on screen, the state).
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, {
      hexfolkDebug: {
        state: () => session.state,
        hexToScreen: (hex: HexRef) => (theme ? worldToScreen(camera, viewport, hexToPixel(hex, theme.atlas.tile)) : null),
      },
    });
  }

  attachInput(canvas, {
    onPan: (dx, dy) => setCamera(panBy(camera, dx, dy)),
    onZoom: (factor, at) => {
      if (bounds) setCamera(zoomAt(camera, viewport, at, factor, zoomLimits(bounds, viewport)));
    },
    onTap: (at) => {
      if (!theme) return;
      onTap(pixelToHex(screenToWorld(camera, viewport, at), theme.atlas.tile));
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
