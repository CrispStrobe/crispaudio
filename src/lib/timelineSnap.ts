/** Magnetic edge snapping uses a screen-space tolerance, independent of zoom. */
export function snapClipStart(start: number, duration: number, edges: number[], pixelsPerSecond: number, enabled: boolean): number {
  if (!enabled) return Math.max(0, start);
  const tolerance = 8 / pixelsPerSecond;
  let best = Math.max(0, start), distance = tolerance;
  for (const edge of edges) {
    for (const candidate of [edge, edge - duration]) {
      const delta = Math.abs(candidate - start);
      if (candidate >= 0 && delta <= distance) { best = candidate; distance = delta; }
    }
  }
  return best;
}
