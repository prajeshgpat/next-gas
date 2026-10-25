import type { RankedStation } from "./types.js";

/** Upper bounds (minutes ahead) of the station-strip groups; the last group is open-ended. */
export const TIME_BUCKETS_MIN = [15, 30, 60, 120] as const;

export interface TimeBucket {
  fromMin: number;
  toMin: number | undefined;
  stations: RankedStation[];
}

/** Groups stations by drive time ahead for the station strip, dropping empty groups. */
export function bucketByEta(stations: readonly RankedStation[]): TimeBucket[] {
  const bounds = [0, ...TIME_BUCKETS_MIN];
  return bounds
    .map((fromMin, i) => {
      const toMin = bounds[i + 1];
      return {
        fromMin,
        toMin,
        stations: stations.filter(
          (s) => s.etaMin >= fromMin && (toMin === undefined || s.etaMin < toMin),
        ),
      };
    })
    .filter((b) => b.stations.length > 0);
}
