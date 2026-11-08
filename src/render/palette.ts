/** Every colour the canvas and the HUD use. Change the look here and nowhere else. */
export const PALETTE = {
  /** Around the map: dark ink-slate, so any sliver between tiles reads as part of the outlines. */
  background: '#1a2425',
  /** Slightly lighter in the middle of the screen, for a gentle vignette. */
  backgroundCentre: '#26393a',
  selectionFill: 'rgba(255, 255, 255, 0.22)',
  selectionStroke: '#fff8dc',
  selectionGlow: 'rgba(255, 214, 102, 0.9)',
  /** Where the selected unit can move. */
  reachFill: 'rgba(255, 248, 220, 0.55)',
  reachStroke: 'rgba(43, 42, 31, 0.6)',
  /** What the selected unit can attack. */
  targetFill: 'rgba(214, 69, 65, 0.18)',
  targetStroke: '#e0453f',
  unitShadow: 'rgba(20, 18, 10, 0.28)',
  /** Health bars. */
  healthBack: 'rgba(20, 18, 10, 0.75)',
  healthGood: '#5fd068',
  healthLow: '#f0b429',
  healthBad: '#e0453f',
  /** Ink for drawn details (flag poles, outlines), matching the dark outlines of the tile art. */
  ink: '#2b2a1f',
  /** Flat vector placeholders for resources, number tokens and roads (no atlas art yet, see docs/ART.md). */
  resource: {
    grain: '#e3b341',
    grainDark: '#a8791c',
    sheepWool: '#f4f1e8',
    sheepFace: '#4a443a',
    woodTrunk: '#7a4e2b',
    woodLeaf: '#2f7d45',
    stone: '#9aa3a8',
    stoneDark: '#5c666c',
  },
  token: {
    face: '#f6edd2',
    ring: '#2b2a1f',
    text: '#2b2a1f',
    /** The odds-on numbers (6 and 8) are red, as on a dice chart. */
    hot: '#c0392b',
    /** A harvested tile's token: it now pays out when rolled. */
    paying: '#f2c14e',
  },
  road: { edge: '#2b2a1f', fill: '#d9b77e' },
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
