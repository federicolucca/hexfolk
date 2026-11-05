/**
 * Axial coordinates for pointy-top hexagons (see redblobgames.com/grids/hexagons).
 * The third cube coordinate is implicit: s = -q - r.
 */
export interface Hex {
  readonly q: number;
  readonly r: number;
}

/** The six neighbour offsets, clockwise from east: E, SE, SW, W, NW, NE. */
export const DIRECTIONS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export function neighbours(hex: Hex): Hex[] {
  return DIRECTIONS.map((d) => ({ q: hex.q + d.q, r: hex.r + d.r }));
}

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function sameHex(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

/**
 * Rectangular maps use "odd-r" offset rows: odd rows are shoved half a hex to the right.
 * col and row are the position in the rectangle; q and r are axial.
 */
export function offsetToAxial(col: number, row: number): Hex {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function axialToOffset(hex: Hex): { col: number; row: number } {
  return { col: hex.q + (hex.r - (hex.r & 1)) / 2, row: hex.r };
}
