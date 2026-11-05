// Gesture maths for pointer input: pure functions, no DOM.
import type { Point } from './layout';

/** A press that moves further than this (CSS px) is a drag, not a tap. */
export const DRAG_THRESHOLD = 8;

export function exceedsDragThreshold(start: Point, current: Point, threshold = DRAG_THRESHOLD): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > threshold;
}

export interface PinchStep {
  /** Multiply the zoom by this. */
  factor: number;
  /** Zoom around this screen point (the new midpoint of the two fingers). */
  centre: Point;
  /** Pan by this screen delta first (how far the midpoint moved). */
  pan: Point;
}

/** One step of a two-finger gesture, from the previous and the current finger positions. */
export function pinchStep(a0: Point, b0: Point, a1: Point, b1: Point): PinchStep {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  return {
    factor: d0 > 0 && d1 > 0 ? d1 / d0 : 1,
    centre: mid1,
    pan: { x: mid1.x - mid0.x, y: mid1.y - mid0.y },
  };
}

/** Zoom factor for one wheel event. deltaMode 1 is lines, 2 is pages; 0 (pixels) is the usual. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  // Clamp so one notch of a coarse mouse wheel never jumps too far.
  return Math.exp(-Math.max(-200, Math.min(200, pixels)) * 0.0015);
}
