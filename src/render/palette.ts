/** Every colour the canvas and the HUD use. Change the look here and nowhere else. */
export const PALETTE = {
  /** Around the map: dark ink-slate, so any sliver between tiles reads as part of the outlines. */
  background: '#1a2425',
  /** Slightly lighter in the middle of the screen, for a gentle vignette. */
  backgroundCentre: '#26393a',
  selectionFill: 'rgba(255, 255, 255, 0.22)',
  selectionStroke: '#fff8dc',
  selectionGlow: 'rgba(255, 214, 102, 0.9)',
  /** Ink for drawn details (flag poles, outlines), matching the dark outlines of the tile art. */
  ink: '#2b2a1f',
  /** Player colours, by player index. */
  players: [
    { name: 'Blue', colour: '#3a7bd5' },
    { name: 'Red', colour: '#d64541' },
    { name: 'Yellow', colour: '#f0b429' },
    { name: 'Green', colour: '#3fa34d' },
  ],
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
