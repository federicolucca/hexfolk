// The HTML overlay: a top bar (seed, theme, new game, tools), a bottom dock (turn, stars, what is
// selected, end turn) and a panel above the dock for choices (techs, city production).
import { THEMES, type Theme } from '../core/theme';
import type { LoadedCommon } from '../render/atlasLoader';
import { PALETTE } from '../render/palette';
import './hud.css';

export interface Card {
  /** A frame of the common atlas, e.g. "icons/archery" or "units/warrior_blue". */
  icon?: string;
  label: string;
  detail?: string;
  enabled: boolean;
  /** Highlighted as already owned or active. */
  owned?: boolean;
  onClick?: () => void;
}

export interface Hud {
  setSeed(seed: number): void;
  /** The override in the select (undefined = Auto) and the theme in use. */
  setTheme(override: Theme | undefined, effective: Theme): void;
  /** Turn line and the line below it (e.g. stars). */
  setStatus(title: string, detail: string): void;
  /** What is selected, as a title and an optional detail line; null clears it. */
  setInfo(title: string | null, detail?: string): void;
  setEndTurn(enabled: boolean, label?: string): void;
  /** A panel of cards above the dock; null hides it. */
  setPanel(title: string | null, cards?: Card[]): void;
  /** Buttons in the top bar after New game (e.g. Techs); replaces the previous ones. */
  setTools(buttons: { label: string; onClick: () => void; active?: boolean }[]): void;
  setCommonAtlas(common: LoadedCommon, baseUrl: string): void;
  /** A full-screen message, e.g. while loading or on error; null hides it. */
  setMessage(text: string | null): void;
}

export interface HudActions {
  onNewGame(): void;
  /** undefined means "Auto": the theme follows the seed. */
  onThemeChange(theme: Theme | undefined): void;
  onEndTurn(): void;
}

/** Copies the HUD colours from the palette into CSS custom properties. */
export function applyPalette(root: HTMLElement): void {
  const vars: Record<string, string> = {
    '--hf-bg': PALETTE.background,
    '--hf-panel': PALETTE.hud.panel,
    '--hf-border': PALETTE.hud.panelBorder,
    '--hf-text': PALETTE.hud.text,
    '--hf-muted': PALETTE.hud.muted,
    '--hf-accent': PALETTE.hud.accent,
    '--hf-accent-text': PALETTE.hud.accentText,
    '--hf-accent-hover': PALETTE.hud.accentHover,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

export function createHud(container: HTMLElement, actions: HudActions): Hud {
  let common: { loaded: LoadedCommon; url: string } | null = null;

  /** An icon cut from the common atlas (@2x image, scaled to fit a square box). */
  const icon = (frameName: string, size: number): HTMLElement => {
    const el = element('span', 'hf-icon');
    el.style.width = el.style.height = `${size}px`;
    const frame = common?.loaded.atlas.frames[frameName];
    if (!common || !frame) return el;
    const scale = size / Math.max(frame.w, frame.h);
    const image = common.loaded.image;
    el.style.backgroundImage = `url("${common.url}")`;
    el.style.backgroundSize = `${image.naturalWidth * scale}px ${image.naturalHeight * scale}px`;
    const ox = (size - frame.w * scale) / 2;
    const oy = (size - frame.h * scale) / 2;
    el.style.backgroundPosition = `${ox - frame.x * scale}px ${oy - frame.y * scale}px`;
    return el;
  };

  const bar = element('div', 'hf-bar');
  const seed = element('span', 'hf-seed');
  const select = element('select', 'hf-select');
  select.setAttribute('aria-label', 'Theme');
  const auto = element('option', '', 'Auto');
  auto.value = '';
  select.append(auto, ...THEMES.map((t) => Object.assign(element('option', '', capitalise(t)), { value: t })));
  select.addEventListener('change', () => actions.onThemeChange(THEMES.find((t) => t === select.value)));
  const newGame = element('button', 'hf-button hf-secondary', 'New game');
  newGame.type = 'button';
  newGame.addEventListener('click', actions.onNewGame);
  const tools = element('span');
  tools.style.display = 'contents';
  bar.append(element('span', 'hf-title', 'hexfolk'), seed, select, newGame, tools);

  const dock = element('div', 'hf-dock');
  const status = element('div', 'hf-status');
  const statusTitle = element('strong');
  const statusDetail = element('span', 'hf-stars');
  status.append(statusTitle, statusDetail);
  const info = element('div', 'hf-info');
  info.setAttribute('aria-live', 'polite');
  const endTurn = element('button', 'hf-button', 'End turn');
  endTurn.type = 'button';
  endTurn.addEventListener('click', actions.onEndTurn);
  dock.append(status, info, endTurn);

  const panel = element('div', 'hf-panel');
  panel.hidden = true;

  const message = element('div', 'hf-message');
  message.hidden = true;

  container.append(bar, panel, dock, message);
  return {
    setSeed: (value) => {
      seed.textContent = `Seed ${value}`;
    },
    setTheme: (override, effective) => {
      select.value = override ?? '';
      auto.textContent = `Auto (${capitalise(effective)})`;
    },
    setStatus: (title, detail) => {
      statusTitle.textContent = title;
      statusDetail.replaceChildren();
      if (detail.includes('★')) {
        const [before, after] = detail.split('★');
        statusDetail.append(icon('icons/star', 16), `${before ?? ''}${after ?? ''}`.trim());
      } else {
        statusDetail.textContent = detail;
      }
    },
    setInfo: (title, detail) => {
      info.replaceChildren();
      if (title === null) return;
      info.append(title);
      if (detail) info.append(element('small', '', detail));
    },
    setEndTurn: (enabled, label = 'End turn') => {
      endTurn.disabled = !enabled;
      endTurn.textContent = label;
    },
    setPanel: (title, cards = []) => {
      panel.hidden = title === null;
      panel.replaceChildren();
      if (title === null) return;
      panel.append(element('div', 'hf-panel-title', title));
      for (const card of cards) {
        const button = element('button', card.owned ? 'hf-card hf-owned' : 'hf-card');
        button.type = 'button';
        button.disabled = !card.enabled;
        if (card.icon) button.append(icon(card.icon, 36));
        button.append(element('span', '', card.label));
        if (card.detail) button.append(element('small', '', card.detail));
        if (card.onClick) button.addEventListener('click', card.onClick);
        panel.append(button);
      }
    },
    setTools: (buttons) => {
      tools.replaceChildren(
        ...buttons.map((b) => {
          const el = element('button', b.active ? 'hf-button' : 'hf-button hf-secondary', b.label);
          el.type = 'button';
          el.addEventListener('click', b.onClick);
          return el;
        }),
      );
    },
    setCommonAtlas: (loaded, baseUrl) => {
      common = { loaded, url: `${baseUrl}${loaded.atlas.images['2']}` };
    },
    setMessage: (text) => {
      message.hidden = text === null;
      message.textContent = text ?? '';
    },
  };
}
