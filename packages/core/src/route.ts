import type { RoutePoint } from "./types.js";

export function routeLengthMi(route: readonly RoutePoint[]): number {
  return route.at(-1)?.cumMi ?? 0;
}

/** Drive minutes from the route start to `alongMi`, linearly interpolated between vertices. */
export function minutesAt(route: readonly RoutePoint[], alongMi: number): number {
  const first = route[0];
  const last = route.at(-1);
  if (!first || !last) return 0;
  if (alongMi <= first.cumMi) return first.cumMin;
  if (alongMi >= last.cumMi) return last.cumMin;

  // Binary search for the segment containing alongMi.
  let lo = 0;
  let hi = route.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route[mid]!.cumMi <= alongMi) lo = mid;
    else hi = mid;
  }
  const a = route[lo]!;
  const b = route[hi]!;
  const span = b.cumMi - a.cumMi;
  const t = span === 0 ? 0 : (alongMi - a.cumMi) / span;
  return a.cumMin + t * (b.cumMin - a.cumMin);
}
