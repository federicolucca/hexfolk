// Pure geometry for the tile atlas build: measures the hex inside a tile's alpha mask and packs
// tiles into a grid. No I/O, so it can be unit-tested.

/** One byte of alpha per pixel, row-major. */
export interface AlphaMask {
  width: number;
  height: number;
  alpha: Uint8Array;
}

/**
 * The hex of a pointy-top tile, in the tile's own pixels. The four y values follow the outline:
 * the top vertex, where the vertical sides start (shoulder) and end, and the bottom vertex. Tiles
 * drawn with some thickness at the bottom have longer "sides", so the face centre is derived from
 * the top edges (see faceCentreY), which thickness never touches.
 */
export interface HexMeasure {
  centreX: number;
  width: number;
  top: number;
  shoulder: number;
  sideEnd: number;
  bottom: number;
}

const ALPHA_THRESHOLD = 128;

/** The longest run of opaque pixels in a row, so stray marks outside the hex are ignored. */
export function longestRun(mask: AlphaMask, y: number, threshold = ALPHA_THRESHOLD): { start: number; length: number } | null {
  let best: { start: number; length: number } | null = null;
  let start = -1;
  for (let x = 0; x <= mask.width; x++) {
    const opaque = x < mask.width && (mask.alpha[y * mask.width + x] ?? 0) >= threshold;
    if (opaque && start < 0) start = x;
    if (!opaque && start >= 0) {
      if (!best || x - start > best.length) best = { start, length: x - start };
      start = -1;
    }
  }
  return best;
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error('percentile of an empty list');
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] as number;
}

export function median(values: readonly number[]): number {
  return percentile(values, 0.5);
}

/** Least-squares line through (x, y) points: y = slope * x + intercept. */
export function fitLine(points: readonly { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) throw new Error('fitLine needs at least two points');
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
  }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * Measures the hex outline. The width is the 90th percentile of the row widths (robust to halos
 * and stray marks); the slanted edges are fitted as lines where the hex is 20%-80% of that width.
 */
export function measureHex(mask: AlphaMask): HexMeasure {
  const runs = Array.from({ length: mask.height }, (_, y) => longestRun(mask, y));
  const lengths = runs.flatMap((r) => (r ? [r.length] : []));
  if (lengths.length === 0) throw new Error('tile is fully transparent');
  const width = percentile(lengths, 0.9);
  const slanted = (half: 'top' | 'bottom'): { x: number; y: number; mid: number }[] =>
    runs.flatMap((r, y) => {
      const inHalf = half === 'top' ? y < mask.height / 2 : y >= mask.height / 2;
      return r && inHalf && r.length > 0.2 * width && r.length < 0.8 * width
        ? [{ x: y, y: r.length, mid: r.start + r.length / 2 }]
        : [];
    });
  const topPoints = slanted('top');
  const bottomPoints = slanted('bottom');
  if (topPoints.length < 4 || bottomPoints.length < 4) throw new Error('could not find the hex edges');
  const up = fitLine(topPoints);
  const down = fitLine(bottomPoints);
  return {
    centreX: median(topPoints.map((p) => p.mid)),
    width,
    top: -up.intercept / up.slope,
    shoulder: (width - up.intercept) / up.slope,
    sideEnd: (width - down.intercept) / down.slope,
    bottom: -down.intercept / down.slope,
  };
}

/** Spacing shared by every tile of a theme, measured from the art (median over its tiles). */
export interface ThemeGeometry {
  /** Hex width (flat to flat). */
  width: number;
  /** Height of the top (and bottom) triangle of the hex. */
  cap: number;
  /** Length of the vertical sides. */
  side: number;
}

export function themeGeometry(measures: readonly HexMeasure[]): ThemeGeometry {
  return {
    width: median(measures.map((m) => m.width)),
    cap: median(measures.map((m) => m.shoulder - m.top)),
    side: median(measures.map((m) => m.sideEnd - m.shoulder)),
  };
}

/** The centre of the hex face: halfway down the vertical sides, measured from the top edges. */
export function faceCentreY(m: HexMeasure, g: ThemeGeometry): number {
  return m.shoulder + g.side / 2;
}

/** Row-major grid packing. Cells are as big as the largest tile plus padding on every side. */
export function packGrid(
  sizes: readonly { width: number; height: number }[],
  columns: number,
  padding: number,
): { width: number; height: number; positions: { x: number; y: number }[] } {
  const cellW = Math.max(...sizes.map((s) => s.width)) + 2 * padding;
  const cellH = Math.max(...sizes.map((s) => s.height)) + 2 * padding;
  const cols = Math.min(columns, sizes.length);
  const rows = Math.ceil(sizes.length / cols);
  return {
    width: cols * cellW,
    height: rows * cellH,
    positions: sizes.map((_, i) => ({ x: (i % cols) * cellW + padding, y: Math.floor(i / cols) * cellH + padding })),
  };
}
