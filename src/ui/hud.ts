// The HTML overlay: title, seed, theme select, New map button and the selected tile.
import { THEMES, type Theme } from '../core/theme';
import { PALETTE } from '../render/palette';
import './hud.css';

export interface Hud {
  setSeed(seed: number): void;
  /** The override in the select (undefined = Auto) and the theme in use. */
  setTheme(override: Theme | undefined, effective: Theme): void;
  /** A short description of the selected tile, or null to hide the panel. */
  setSelection(text: string | null): void;
  /** A full-screen message, e.g. while loading or on error; null hides it. */
  setMessage(text: string | null): void;
}

export interface HudActions {
  onNewMap(): void;
  /** undefined means "Auto": the theme follows the seed. */
  onThemeChange(theme: Theme | undefined): void;
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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
}

const capitalise = (s: string): string => `${s[0]?.toUpperCase() ?? ''}${s.slice(1)}`;

export function createHud(container: HTMLElement, actions: HudActions): Hud {
  const bar = element('div', 'hf-bar');
  const seed = element('span', 'hf-seed');

  const select = element('select', 'hf-select');
  select.setAttribute('aria-label', 'Theme');
  const auto = element('option', '', 'Auto');
  auto.value = '';
  select.append(auto, ...THEMES.map((t) => Object.assign(element('option', '', capitalise(t)), { value: t })));
  select.addEventListener('change', () => {
    const value = select.value;
    actions.onThemeChange(THEMES.find((t) => t === value));
  });

  const button = element('button', 'hf-button', 'New map');
  button.type = 'button';
  button.addEventListener('click', actions.onNewMap);
  bar.append(element('span', 'hf-title', 'hexfolk'), seed, select, button);

  const info = element('div', 'hf-info');
  info.hidden = true;
  info.setAttribute('aria-live', 'polite');

  const message = element('div', 'hf-message');
  message.hidden = true;

  container.append(bar, info, message);
  return {
    setSeed: (value) => {
      seed.textContent = `Seed ${value}`;
    },
    setTheme: (override, effective) => {
      select.value = override ?? '';
      auto.textContent = `Auto (${capitalise(effective)})`;
    },
    setSelection: (text) => {
      info.hidden = text === null;
      info.textContent = text ?? '';
    },
    setMessage: (text) => {
      message.hidden = text === null;
      message.textContent = text ?? '';
    },
  };
}
