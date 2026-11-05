// Pointer and wheel input on the canvas: one finger or the mouse drags, two fingers pinch,
// the wheel zooms, and a press that never became a drag is a tap.
import type { Point } from './layout';
import { exceedsDragThreshold, pinchStep, wheelZoomFactor } from './gesture';

export interface InputHandlers {
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, at: Point): void;
  onTap(at: Point): void;
}

export function attachInput(canvas: HTMLCanvasElement, handlers: InputHandlers): () => void {
  const pointers = new Map<number, Point>();
  let start: Point | null = null;
  // Set once a gesture moves past the drag threshold or uses a second finger; cleared when all
  // fingers lift. While set, lifting a finger is never a tap.
  let gestureMoved = false;

  const local = (e: PointerEvent | WheelEvent): Point => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      start = p;
      gestureMoved = false;
    } else {
      gestureMoved = true;
    }
  };

  const onMove = (e: PointerEvent): void => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    if (pointers.size === 1) {
      if (!gestureMoved && start && exceedsDragThreshold(start, p)) gestureMoved = true;
      if (gestureMoved) handlers.onPan(p.x - prev.x, p.y - prev.y);
    } else {
      const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const step = pinchStep(prev, other, p, other);
        handlers.onPan(step.pan.x, step.pan.y);
        handlers.onZoom(step.factor, step.centre);
      }
    }
    pointers.set(e.pointerId, p);
  };

  const onEnd = (e: PointerEvent): void => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size > 0) return;
    if (e.type === 'pointerup' && !gestureMoved) handlers.onTap(local(e));
    start = null;
    gestureMoved = false;
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    handlers.onZoom(wheelZoomFactor(e.deltaY, e.deltaMode), local(e));
  };

  const onContextMenu = (e: Event): void => e.preventDefault();

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onEnd);
  canvas.addEventListener('pointercancel', onEnd);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onEnd);
    canvas.removeEventListener('pointercancel', onEnd);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
