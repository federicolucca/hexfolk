// Projection between hexes and world pixels for the pre-rendered sprites.
// World pixels are sprite pixels at zoom 1. A hex's position is the centre of its top face.
import { type Hex, roundHex } from '../core/hex';

export interface Point {
  x: number;
  y: number;
}

/** How hexes tile on screen, from public/sprites/manifest.json. */
export interface TileMetrics {
  width: number;
  columnStep: number;
  rowStep: number;
  /** Point-to-point height of the (foreshortened) top face. */
  faceHeight: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function hexToPixel(hex: Hex, m: TileMetrics): Point {
  return { x: m.columnStep * (hex.q + hex.r / 2), y: m.rowStep * hex.r };
}

/**
 * The hex whose top face contains the point. The sprite projection is the regular pointy-top
 * layout squashed vertically, an affine map, so inverting it and cube-rounding is exact.
 */
export function pixelToHex(p: Point, m: TileMetrics): Hex {
  const r = p.y / m.rowStep;
  const q = p.x / m.columnStep - r / 2;
  return roundHex(q, r);
}

/** The six corners of a hex's top face, clockwise from the top. */
export function hexCorners(hex: Hex, m: TileMetrics): Point[] {
  const c = hexToPixel(hex, m);
  const hw = m.width / 2;
  const hh = m.faceHeight / 2;
  return [
    { x: c.x, y: c.y - hh },
    { x: c.x + hw, y: c.y - hh / 2 },
    { x: c.x + hw, y: c.y + hh / 2 },
    { x: c.x, y: c.y + hh },
    { x: c.x - hw, y: c.y + hh / 2 },
    { x: c.x - hw, y: c.y - hh / 2 },
  ];
}

/**
 * World-pixel bounds of everything drawn for these hexes. `above` and `below` are how far the
 * tallest sprite reaches above its anchor and below it.
 */
export function mapBounds(hexes: readonly Hex[], m: TileMetrics, above: number, below: number): Bounds {
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const hex of hexes) {
    const p = hexToPixel(hex, m);
    bounds.minX = Math.min(bounds.minX, p.x - m.width / 2);
    bounds.maxX = Math.max(bounds.maxX, p.x + m.width / 2);
    bounds.minY = Math.min(bounds.minY, p.y - above);
    bounds.maxY = Math.max(bounds.maxY, p.y + below);
  }
  return bounds;
}
