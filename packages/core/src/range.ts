/** Miles held back from the range estimate before a station counts as reachable. */
export const MIN_RESERVE_MI = 15;
/** Fraction of the range held back when that is larger than MIN_RESERVE_MI. */
export const RESERVE_FRACTION = 0.1;

/**
 * Range we are willing to plan with: the car's estimate minus a reserve of
 * max(15 mi, 10% of range). Never negative.
 */
export function safeRangeMi(rangeLeftMi: number): number {
  if (!Number.isFinite(rangeLeftMi) || rangeLeftMi <= 0) return 0;
  const reserve = Math.max(MIN_RESERVE_MI, rangeLeftMi * RESERVE_FRACTION);
  return Math.max(0, rangeLeftMi - reserve);
}

/** A station is reachable when getting there, detour included, fits in the safe range. */
export function isReachable(alongMi: number, detourMi: number, rangeLeftMi: number): boolean {
  return alongMi + detourMi <= safeRangeMi(rangeLeftMi);
}
