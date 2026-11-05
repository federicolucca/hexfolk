// Wires the engine, the canvas renderer and the HUD together. Game rules live in src/core only.
import { GreedyAgent } from './core/ai';
import { income } from './core/economy';
import { newGame } from './core/engine';
import type { GameState, HexRef } from './core/state';
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
import { describeHex, endSummary, playerName, starsLine, turnLine } from './ui/describe';
import { panelFor, techPanel } from './ui/panels';
import { applyPalette, createHud } from './ui/hud';
import { loadGame, saveGame } from './ui/save';
import { Session } from './ui/session';
import { parseDifficulty, parsePlayers, parseSeed, parseTheme, randomSeed, withParams } from './ui/url';

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
  const store = ((): Storage | undefined => {
    try {
      return localStorage;
    } catch {
      return undefined;
    }
  })();
  const urlSeed = parseSeed(location.search);
  // Resume the autosave unless the URL asks for a different seed.
  const saved = loadGame(store);
  const resume = saved && (urlSeed === undefined || urlSeed === saved.seed) ? saved : null;
  let seed = resume?.seed ?? urlSeed ?? randomSeed();
  let themeOverride = parseTheme(location.search);
  let difficulty = parseDifficulty(location.search);
  let session = createSession(seed, resume);
  let theme: LoadedAtlas | null = null;
  let common: LoadedCommon | null = null;
  let bounds: Bounds | null = null;
  let viewport: Viewport = { width: 1, height: 1 };
  let pixelRatio = 1;
  let camera: Camera = { x: 0, y: 0, zoom: 1 };
  let frame = 0;
  let loadToken = 0;
  let busy = false;
  let showTechs = false;

  function createSession(s: number, from: GameState | null = null): Session {
    const count = from?.players.length ?? players;
    const agents = Object.fromEntries(Array.from({ length: count }, (_, i) => [i, new GreedyAgent(difficulty)]));
    return new Session(from ?? newGame({ seed: s, players }), HUMAN, agents);
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
    hud.setEnd(endSummary(state, HUMAN));
    hud.setTools([
      {
        label: 'Techs',
        active: showTechs,
        onClick: () => {
          showTechs = !showTechs;
          refresh();
        },
      },
    ]);
    const panel = busy || !session.humanToMove ? null : showTechs ? techPanel(state, HUMAN) : session.selectedHex ? panelFor(state, HUMAN, session.selectedHex, session.selectedUnit) : null;
    hud.setPanel(
      panel?.title ?? null,
      panel?.cards.map((c) => ({
        ...(c.icon ? { icon: c.icon } : {}),
        label: c.label,
        detail: c.detail,
        enabled: c.action !== undefined,
        ...(c.owned ? { owned: true } : {}),
        onClick: () => {
          if (!c.action || busy) return;
          session.act(c.action);
          if (c.action.type === 'attack') session.clearSelection();
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
    hud.setDifficulty(difficulty);
    history.replaceState(null, '', withParams(location.search, seed, themeOverride, difficulty));
  };

  const fail = (err: unknown): void => {
    console.error(err);
    hud.setMessage(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
  };

  const hud = createHud(app, {
    onNewGame: (typed, chosen) => {
      seed = typed ?? randomSeed();
      difficulty = chosen;
      session = createSession(seed);
      saveGame(store, session.state);
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
        .endTurn(() => {
          saveGame(store, session.state);
          refresh();
        })
        .catch(fail)
        .finally(() => {
          saveGame(store, session.state);
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
    showTechs = false;
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
