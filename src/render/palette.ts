/** Every colour the canvas and the HUD use. Change the look here and nowhere else. */
export const PALETTE = {
  /** Open sea around the island. */
  background: '#1c5a80',
  /** Lighter sea in the middle of the screen, for a gentle vignette. */
  backgroundCentre: '#2a7aa6',
  selectionFill: 'rgba(255, 255, 255, 0.22)',
  selectionStroke: '#fff8dc',
  selectionGlow: 'rgba(255, 214, 102, 0.9)',
  hud: {
    panel: 'rgba(14, 30, 44, 0.82)',
    panelBorder: 'rgba(255, 255, 255, 0.14)',
    text: '#f5f1e6',
    muted: '#a8bccb',
    accent: '#f2c14e',
    accentText: '#1b2633',
    accentHover: '#f7d27a',
  },
} as const;
