export type Point = { x: number; y: number };
export type Viewport = Point & { scale: number };
export type CanvasSize = { width: number; height: number };
export type Bounds = Point & CanvasSize;

export const MIN_TREE_SCALE = 0.5;
export const MAX_TREE_SCALE = 10;

export function clampTreeScale(scale: number): number {
  return Number.isFinite(scale) ? Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, scale)) : 1;
}

/** Anchor is expressed in the root SVG coordinate system, not CSS pixels. */
export function zoomViewport(current: Viewport, nextScale: number, anchor: Point): Viewport {
  const scale = clampTreeScale(nextScale);
  return {
    scale,
    x: anchor.x - ((anchor.x - current.x) / current.scale) * scale,
    y: anchor.y - ((anchor.y - current.y) / current.scale) * scale,
  };
}

export function panViewport(current: Viewport, from: Point, to: Point): Viewport {
  return { ...current, x: current.x + to.x - from.x, y: current.y + to.y - from.y };
}

export function focusViewport(point: Point, scale: number, canvas: CanvasSize): Viewport {
  const clampedScale = clampTreeScale(scale);
  return { scale: clampedScale, x: canvas.width / 2 - point.x * clampedScale, y: canvas.height / 2 - point.y * clampedScale };
}

export function fitViewportToBounds(bounds: Bounds, canvas: CanvasSize, padding = 50): Viewport {
  const scale = Math.min(canvas.width / Math.max(1, bounds.width + padding * 2), canvas.height / Math.max(1, bounds.height + padding * 2));
  return focusViewport({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }, scale, canvas);
}
