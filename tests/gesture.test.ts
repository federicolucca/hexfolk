import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, exceedsDragThreshold, pinchStep, wheelZoomFactor } from '../src/render/gesture';

describe('tap or drag', () => {
  it('treats small movements as a tap', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: DRAG_THRESHOLD, y: 0 })).toBe(false);
  });

  it('treats larger movements as a drag', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: DRAG_THRESHOLD + 1, y: 0 })).toBe(true);
    expect(exceedsDragThreshold({ x: 10, y: 10 }, { x: 4, y: 18 })).toBe(true);
  });
});

describe('pinchStep', () => {
  it('zooms by the change in finger distance, around the new midpoint', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: -50, y: 0 }, { x: 150, y: 0 });
    expect(step.factor).toBeCloseTo(2);
    expect(step.centre).toEqual({ x: 50, y: 0 });
    expect(step.pan).toEqual({ x: 0, y: 0 });
  });

  it('pans when both fingers move together', () => {
    const step = pinchStep({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 20, y: 30 }, { x: 120, y: 30 });
    expect(step.factor).toBeCloseTo(1);
    expect(step.pan).toEqual({ x: 20, y: 30 });
  });

  it('never divides by zero when the fingers touch', () => {
    expect(pinchStep({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 9, y: 5 }).factor).toBe(1);
  });
});

describe('wheelZoomFactor', () => {
  it('zooms in on scroll up and out on scroll down', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('is symmetric and bounded', () => {
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
    expect(wheelZoomFactor(1e6)).toBeCloseTo(wheelZoomFactor(200));
    expect(wheelZoomFactor(3, 1)).toBeCloseTo(wheelZoomFactor(48));
  });
});
