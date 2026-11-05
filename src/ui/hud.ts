// The HTML overlay: title, seed, New map button and the selected tile.
import { PALETTE } from '../render/palette';
import './hud.css';

export interface Hud {
  setSeed(seed: number): void;
  /** A short description of the selected tile, or null to hide the panel. */
  setSelection(text: string | null): void;
  /** A full-screen message, e.g. while loading or on error; null hides it. */
  setMessage(text: string | null): void;
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

export function createHud(container: HTMLElement, onNewMap: () => void): Hud {
  const bar = element('div', 'hf-bar');
  const seed = element('span', 'hf-seed');
  const button = element('button', 'hf-button', 'New map');
  button.type = 'button';
  button.addEventListener('click', onNewMap);
  bar.append(element('span', 'hf-title', 'hexfolk'), seed, button);

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
