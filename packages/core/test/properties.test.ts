import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { milesToReach, plan, type CorridorStation, type PlanInput, type PriceSource } from "../src/index.js";
import { NOW, planInput, straightRoute } from "./fixtures/builders.js";

const ROUTE_MI = 400;

const stationArb: fc.Arbitrary<CorridorStation> = fc.record({
  id: fc.uuid(),
  name: fc.constant("s"),
  isTopTier: fc.boolean(),
  alongMi: fc.double({ min: 0, max: ROUTE_MI, noNaN: true }),
  offRouteMi: fc.double({ min: 0, max: 1.5, noNaN: true }),
  price: fc.record({
    usdPerGallon: fc.double({ min: 1.5, max: 10, noNaN: true }),
    source: fc.constantFrom<PriceSource>("gasbuddy", "google", "crowd", "estimate"),
    observedAt: fc.integer({ min: 0, max: 48 }).map((h) => new Date(NOW.getTime() - h * 3_600_000)),
  }),
});

const inputArb: fc.Arbitrary<PlanInput> = fc
  .record({
    stations: fc.uniqueArray(stationArb, { selector: (s) => s.id, maxLength: 40 }),
    rangeMi: fc.double({ min: 0, max: 500, noNaN: true }),
    topTierOnly: fc.boolean(),
    positionMi: fc.double({ min: 0, max: ROUTE_MI, noNaN: true }),
    valueOfTimePerMin: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ rangeMi, ...rest }) =>
    planInput({ ...rest, route: straightRoute(ROUTE_MI), vehicle: { rangeMi, mpg: 30, fillGallons: 12 } }),
  );

function recommendedStation(result: ReturnType<typeof plan>) {
  const r = result.recommendation;
  return r.kind === "no_safe_station" ? undefined : r.station;
}

describe("safety invariants", () => {
  test("never recommends a station outside the safe range", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = plan(input);
        const s = recommendedStation(result);
        return s === undefined || milesToReach(s) <= result.safeRangeMi;
      }),
    );
  });

  test("never violates the TopTier filter", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const result = plan({ ...input, topTierOnly: true });
        const s = recommendedStation(result);
        return result.reachable.every((r) => r.isTopTier) && (s === undefined || s.isTopTier);
      }),
    );
  });

  test("only suggests waiting on medium-or-better prices that save more than $1", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const r = plan(input).recommendation;
        if (r.kind !== "wait") return true;
        return r.station.confidence !== "low" && r.savingsUsd > 1;
      }),
    );
  });

  test("never recommends a station behind the car", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const s = recommendedStation(plan(input));
        expect(s === undefined || s.alongMi >= input.positionMi).toBe(true);
      }),
    );
  });
});
