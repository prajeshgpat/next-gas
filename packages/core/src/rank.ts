import {
  DETOUR_ROAD_FACTOR,
  DETOUR_SPEED_MPH,
  MIN_RESERVE_MI,
  RESERVE_FRACTION,
} from "./constants.js";
import { priceConfidence } from "./price.js";
import { minutesAt } from "./route.js";
import type { CorridorStation, PlanInput, RankedStation } from "./types.js";

const MIN_PER_HOUR = 60;

/** Range you can plan with after holding back the reserve buffer. */
export function safeRangeMi(rangeMi: number): number {
  const reserve = Math.max(MIN_RESERVE_MI, rangeMi * RESERVE_FRACTION);
  return Math.max(0, rangeMi - reserve);
}

export function rankStation(station: CorridorStation, input: PlanInput): RankedStation {
  const { route, vehicle, positionMi, valueOfTimePerMin, now } = input;
  const price = station.price.usdPerGallon;
  const detourMi = 2 * station.offRouteMi * DETOUR_ROAD_FACTOR;
  const detourMin = (detourMi / DETOUR_SPEED_MPH) * MIN_PER_HOUR;
  const etaMin = minutesAt(route, station.alongMi) - minutesAt(route, positionMi);
  const effectiveCostUsd =
    price * vehicle.fillGallons + (price * detourMi) / vehicle.mpg + detourMin * valueOfTimePerMin;

  return {
    ...station,
    aheadMi: station.alongMi - positionMi,
    detourMi,
    detourMin,
    etaMin,
    confidence: priceConfidence(station.price, now),
    effectiveCostUsd,
  };
}

/** Miles you must drive to reach the station; the whole detour counts, to stay conservative. */
export function milesToReach(station: RankedStation): number {
  return station.aheadMi + station.detourMi;
}

/** Stations ahead of the car that pass the TopTier filter, ranked and sorted by distance ahead. */
export function stationsAhead(input: PlanInput): RankedStation[] {
  return input.stations
    .filter((s) => s.alongMi >= input.positionMi)
    .filter((s) => !input.topTierOnly || s.isTopTier)
    .map((s) => rankStation(s, input))
    .sort((a, b) => a.aheadMi - b.aheadMi);
}
