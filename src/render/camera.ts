// Camera maths: pure functions, no DOM. Screen points are CSS pixels relative to the canvas.
import type { Bounds, Point } from './layout';

/** The world point shown at the centre of the viewport, and the scale (screen px per world px). */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface ZoomLimits {
  min: number;
  max: number;
}

/** Sprites are 256 px per tile; zooming in past this only blurs them. */
export const MAX_ZOOM = 1.25;

export function worldToScreen(c: Camera, v: Viewport, p: Point): Point {
  return { x: (p.x - c.x) * c.zoom + v.width / 2, y: (p.y - c.y) * c.zoom + v.height / 2 };
}

export function screenToWorld(c: Camera, v: Viewport, p: Point): Point {
  return { x: (p.x - v.width / 2) / c.zoom + c.x, y: (p.y - v.height / 2) / c.zoom + c.y };
}

/** Canvas transform [a, b, c, d, e, f] that draws world pixels on a canvas with this pixel ratio. */
export function canvasTransform(c: Camera, v: Viewport, pixelRatio: number): [number, number, number, number, number, number] {
  const s = c.zoom * pixelRatio;
  return [s, 0, 0, s, (v.width / 2 - c.x * c.zoom) * pixelRatio, (v.height / 2 - c.y * c.zoom) * pixelRatio];
}

function fitZooms(b: Bounds, v: Viewport, margin: number): { width: number; height: number } {
  return {
    width: Math.max(1, v.width - 2 * margin) / (b.maxX - b.minX),
    height: Math.max(1, v.height - 2 * margin) / (b.maxY - b.minY),
  };
}

/** The zoom that fits the bounds in the viewport, with a margin in screen pixels on every side. */
export function fitZoom(b: Bounds, v: Viewport, margin = 16): number {
  const z = fitZooms(b, v, margin);
  return Math.min(z.width, z.height);
}

/** You can zoom out a little past "whole map" and in up to MAX_ZOOM. */
export function zoomLimits(b: Bounds, v: Viewport): ZoomLimits {
  const max = MAX_ZOOM;
  return { min: Math.min(fitZoom(b, v) * 0.75, max), max };
}

/**
 * The starting view, centred on the bounds. When the viewport and the map have similar shapes this
 * is the whole map. On a tall phone screen the whole (wide) map would be tiny, so the zoom is the
 * geometric mean of the width fit and the height fit: bigger tiles, and a short pan to see the rest.
 */
export function fitCamera(b: Bounds, v: Viewport, margin = 16): Camera {
  const limits = zoomLimits(b, v);
  const z = fitZooms(b, v, margin);
  return {
    x: (b.minX + b.maxX) / 2,
    y: (b.minY + b.maxY) / 2,
    zoom: clamp(Math.sqrt(z.width * z.height), limits.min, limits.max),
  };
}

/** Moves the view by a screen-pixel delta (the map follows the finger). */
export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { x: c.x - dx / c.zoom, y: c.y - dy / c.zoom, zoom: c.zoom };
}

/** Zooms by a factor while keeping the world point under `at` (screen) fixed. */
export function zoomAt(c: Camera, v: Viewport, at: Point, factor: number, limits: ZoomLimits): Camera {
  const zoom = clamp(c.zoom * factor, limits.min, limits.max);
  const before = screenToWorld(c, v, at);
  const after = screenToWorld({ ...c, zoom }, v, at);
  return { x: c.x + before.x - after.x, y: c.y + before.y - after.y, zoom };
}

/** Keeps the zoom within limits and the centre of the view over the map. */
export function clampCamera(c: Camera, b: Bounds, limits: ZoomLimits): Camera {
  return {
    x: clamp(c.x, b.minX, b.maxX),
    y: clamp(c.y, b.minY, b.maxY),
    zoom: clamp(c.zoom, limits.min, limits.max),
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
