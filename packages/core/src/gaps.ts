import { GAP_WARN_MI } from "./constants.js";
import type { Gap, RankedStation } from "./types.js";

/**
 * Stretches ahead with no station longer than GAP_WARN_MI.
 * `stations` must already be filtered (e.g. TopTier) and sorted by aheadMi.
 */
export function findGaps(
  stations: readonly RankedStation[],
  positionMi: number,
  routeEndMi: number,
  safeRangeMi: number,
): Gap[] {
  const gaps: Gap[] = [];
  let prev: RankedStation | undefined;
  let startMi = positionMi;

  const consider = (endMi: number, endsAtDestination: boolean): void => {
    const lengthMi = endMi - startMi;
    if (lengthMi <= GAP_WARN_MI) return;
    gaps.push({
      lastChance: prev,
      startMi,
      endMi,
      lengthMi,
      endsAtDestination,
      mustFillBefore: endMi - positionMi > safeRangeMi,
    });
  };

  for (const station of stations) {
    consider(station.alongMi, false);
    prev = station;
    startMi = station.alongMi;
  }
  consider(routeEndMi, true);
  return gaps;
}
