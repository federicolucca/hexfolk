import { describe, expect, it } from 'vitest';
import {
  type Camera,
  canvasTransform,
  clampCamera,
  fitCamera,
  fitZoom,
  MAX_ZOOM,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
  zoomLimits,
} from '../src/render/camera';

const V = { width: 400, height: 300 };
const B = { minX: -100, minY: -50, maxX: 1900, maxY: 1450 };

describe('camera transforms', () => {
  it('shows the camera point at the viewport centre', () => {
    const c: Camera = { x: 500, y: 200, zoom: 0.5 };
    expect(worldToScreen(c, V, { x: 500, y: 200 })).toEqual({ x: 200, y: 150 });
    expect(worldToScreen(c, V, { x: 600, y: 200 })).toEqual({ x: 250, y: 150 });
  });

  it('round-trips world and screen points', () => {
    const c: Camera = { x: -37, y: 812, zoom: 0.73 };
    const p = { x: 123.4, y: -56.7 };
    const back = screenToWorld(c, V, worldToScreen(c, V, p));
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('builds a canvas transform that matches worldToScreen, times the pixel ratio', () => {
    const c: Camera = { x: 10, y: 20, zoom: 0.5 };
    const [a, , , d, e, f] = canvasTransform(c, V, 2);
    const p = { x: 300, y: -40 };
    const s = worldToScreen(c, V, p);
    expect(a * p.x + e).toBeCloseTo(s.x * 2);
    expect(d * p.y + f).toBeCloseTo(s.y * 2);
  });
});

describe('pan and zoom', () => {
  it('moves the map with the finger', () => {
    const c: Camera = { x: 0, y: 0, zoom: 0.5 };
    const before = worldToScreen(c, V, { x: 100, y: 100 });
    const after = worldToScreen(panBy(c, 30, -10), V, { x: 100, y: 100 });
    expect(after.x - before.x).toBeCloseTo(30);
    expect(after.y - before.y).toBeCloseTo(-10);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const c: Camera = { x: 300, y: 200, zoom: 0.4 };
    const at = { x: 50, y: 260 };
    const world = screenToWorld(c, V, at);
    const zoomed = zoomAt(c, V, at, 1.5, { min: 0.1, max: 2 });
    expect(zoomed.zoom).toBeCloseTo(0.6);
    const again = worldToScreen(zoomed, V, world);
    expect(again.x).toBeCloseTo(at.x);
    expect(again.y).toBeCloseTo(at.y);
  });

  it('clamps the zoom and still keeps the cursor point fixed', () => {
    const c: Camera = { x: 0, y: 0, zoom: 1 };
    const at = { x: 10, y: 10 };
    const zoomed = zoomAt(c, V, at, 10, { min: 0.1, max: 1.25 });
    expect(zoomed.zoom).toBe(1.25);
    const world = screenToWorld(c, V, at);
    expect(worldToScreen(zoomed, V, world).x).toBeCloseTo(at.x);
  });
});

describe('fitting and clamping', () => {
  it('fits the whole map on a landscape or square screen', () => {
    const square = { width: 532, height: 532 }; // B is 2000 x 1500 plus margins
    const v = { width: 2032, height: 1532 };
    const c = fitCamera(B, v);
    expect(c.x).toBe(900);
    expect(c.y).toBe(700);
    expect(c.zoom).toBeCloseTo(fitZoom(B, v));
    const topLeft = worldToScreen(c, v, { x: B.minX, y: B.minY });
    const bottomRight = worldToScreen(c, v, { x: B.maxX, y: B.maxY });
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(v.width);
    expect(bottomRight.y).toBeLessThanOrEqual(v.height);
    expect(fitCamera(B, square).zoom).toBeCloseTo(fitZoom(B, square));
  });

  it('zooms in further than the whole-map fit on a tall phone screen', () => {
    const phone = { width: 390, height: 844 };
    const c = fitCamera(B, phone);
    expect(c.zoom).toBeGreaterThan(fitZoom(B, phone));
    expect(c.zoom).toBeLessThanOrEqual(zoomLimits(B, phone).max);
  });

  it('allows zooming out a little past the fit and in up to MAX_ZOOM', () => {
    const limits = zoomLimits(B, V);
    expect(limits.min).toBeLessThan(fitZoom(B, V));
    expect(limits.max).toBe(MAX_ZOOM);
    // A huge viewport never gets a minimum above the maximum.
    const huge = zoomLimits(B, { width: 10000, height: 10000 });
    expect(huge.min).toBeLessThanOrEqual(huge.max);
  });

  it('keeps the view centre over the map and the zoom in range', () => {
    const limits = { min: 0.2, max: 1.25 };
    expect(clampCamera({ x: -5000, y: 99999, zoom: 9 }, B, limits)).toEqual({ x: -100, y: 1450, zoom: 1.25 });
    expect(clampCamera({ x: 10, y: 20, zoom: 0.01 }, B, limits)).toEqual({ x: 10, y: 20, zoom: 0.2 });
  });
});
