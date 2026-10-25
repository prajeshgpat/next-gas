import { MIN_SAVINGS_TO_WAIT_USD } from "./constants.js";
import { findGaps } from "./gaps.js";
import { isAtLeast } from "./price.js";
import { milesToReach, safeRangeMi, stationsAhead } from "./rank.js";
import { routeLengthMi } from "./route.js";
import type { PlanInput, PlanResult, RankedStation, Recommendation } from "./types.js";

function cheapest(stations: readonly RankedStation[]): RankedStation | undefined {
  return stations.reduce<RankedStation | undefined>(
    (best, s) => (!best || s.effectiveCostUsd < best.effectiveCostUsd ? s : best),
    undefined,
  );
}

function recommend(
  reachable: readonly RankedStation[],
  ahead: readonly RankedStation[],
  rangeMi: number,
): Recommendation {
  const nearest = reachable[0];
  if (!nearest) {
    const nearestInRawRange = ahead.find((s) => milesToReach(s) <= rangeMi);
    return { kind: "no_safe_station", nearestInRawRange };
  }

  const best = cheapest(reachable.filter((s) => isAtLeast(s.confidence, "medium")));
  if (!best || best.id === nearest.id) return { kind: "fill_now", station: nearest };

  const savingsUsd = nearest.effectiveCostUsd - best.effectiveCostUsd;
  if (savingsUsd <= MIN_SAVINGS_TO_WAIT_USD) return { kind: "fill_now", station: nearest };
  return { kind: "wait", station: best, savingsUsd, versus: nearest };
}

/** Pure planner: no I/O, safe to run on the server and in the browser. */
export function plan(input: PlanInput): PlanResult {
  const safe = safeRangeMi(input.vehicle.rangeMi);
  const ahead = stationsAhead(input);
  const reachable = ahead.filter((s) => milesToReach(s) <= safe);

  return {
    recommendation: recommend(reachable, ahead, input.vehicle.rangeMi),
    safeRangeMi: safe,
    reachable,
    gaps: findGaps(ahead, input.positionMi, routeLengthMi(input.route), safe),
  };
}
