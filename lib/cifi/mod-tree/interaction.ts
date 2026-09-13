export type NodeClick = { code: string; x: number; y: number; at: number };

/** Native dblclick is retargeted to the canvas by pointer capture. Validate
 * both completed, drag-free node gestures before letting it purchase. */
export function doubleClickedNode(previous: NodeClick | null, current: NodeClick): string | null {
  return previous && previous.code === current.code && current.at >= previous.at
    && current.at - previous.at <= 1000 && Math.hypot(current.x - previous.x, current.y - previous.y) < 5
    ? current.code : null;
}
