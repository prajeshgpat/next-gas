import type { CorridorStation, PlanInput, PriceSource, RoutePoint } from "../../src/index.js";

export const NOW = new Date("2026-10-23T12:00:00Z");

/** A straight route at constant speed, one vertex every `stepMi`. */
export function straightRoute(lengthMi: number, mph = 60, stepMi = 5): RoutePoint[] {
  const points: RoutePoint[] = [];
  for (let mi = 0; mi < lengthMi; mi += stepMi) points.push({ cumMi: mi, cumMin: (mi / mph) * 60 });
  points.push({ cumMi: lengthMi, cumMin: (lengthMi / mph) * 60 });
  return points;
}

interface StationOpts {
  offRouteMi?: number;
  isTopTier?: boolean;
  source?: PriceSource;
  ageH?: number;
}

export function station(
  id: string,
  alongMi: number,
  usdPerGallon: number,
  opts: StationOpts = {},
): CorridorStation {
  const { offRouteMi = 0.2, isTopTier = false, source = "gasbuddy", ageH = 1 } = opts;
  return {
    id,
    name: id,
    isTopTier,
    alongMi,
    offRouteMi,
    price: { usdPerGallon, source, observedAt: new Date(NOW.getTime() - ageH * 3_600_000) },
  };
}

export function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    route: straightRoute(300),
    stations: [],
    vehicle: { rangeMi: 120, mpg: 30, fillGallons: 12 },
    topTierOnly: false,
    positionMi: 0,
    valueOfTimePerMin: 0,
    now: NOW,
    ...overrides,
  };
}
