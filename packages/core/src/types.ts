export type PriceSource = "gasbuddy" | "google" | "crowd" | "estimate";

/** How much we trust a price, from its source and age. */
export type PriceConfidence = "high" | "medium" | "low";

export interface PriceQuote {
  usdPerGallon: number;
  observedAt: Date;
  source: PriceSource;
}

/** One vertex of the route polyline with cumulative distance and drive time. */
export interface RoutePoint {
  cumMi: number;
  cumMin: number;
}

/** A station from the corridor query, already projected onto the route. */
export interface CorridorStation {
  id: string;
  name: string;
  isTopTier: boolean;
  /** Distance along the route to the point closest to the station. */
  alongMi: number;
  /** Straight-line distance from the route to the station. */
  offRouteMi: number;
  price: PriceQuote;
}

export interface Vehicle {
  rangeMi: number;
  mpg: number;
  /** Gallons you would buy at a stop; the same for every station so costs compare fairly. */
  fillGallons: number;
}

export interface PlanInput {
  route: readonly RoutePoint[];
  stations: readonly CorridorStation[];
  vehicle: Vehicle;
  topTierOnly: boolean;
  /** Where the car is along the route; drive mode advances this without refetching. */
  positionMi: number;
  /** Dollars per minute of detour. 0 means only fuel cost counts. */
  valueOfTimePerMin: number;
  now: Date;
}

export interface RankedStation extends CorridorStation {
  /** Distance from the car's position along the route. */
  aheadMi: number;
  detourMi: number;
  detourMin: number;
  /** Minutes from the car's position to the station. */
  etaMin: number;
  confidence: PriceConfidence;
  effectiveCostUsd: number;
}

export interface Gap {
  /** Last station before the gap, or undefined if the gap starts at the car. */
  lastChance: RankedStation | undefined;
  startMi: number;
  endMi: number;
  lengthMi: number;
  endsAtDestination: boolean;
  /** True when your current fuel cannot carry you across, so you must fill at lastChance. */
  mustFillBefore: boolean;
}

export type Recommendation =
  | { kind: "wait"; station: RankedStation; savingsUsd: number; versus: RankedStation }
  | { kind: "fill_now"; station: RankedStation }
  | { kind: "no_safe_station"; nearestInRawRange: RankedStation | undefined };

export interface PlanResult {
  recommendation: Recommendation;
  safeRangeMi: number;
  /** Reachable stations, sorted by distance ahead. */
  reachable: RankedStation[];
  gaps: Gap[];
}
