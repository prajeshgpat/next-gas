import { describe, expect, test } from "vitest";
import { bucketByEta, plan } from "../src/index.js";
import { planInput, station, straightRoute } from "./fixtures/builders.js";

describe("gap warnings", () => {
  // Rural I-80-style stretch: stations bunched in towns with a long empty run between.
  const ruralStations = [station("a", 10, 3.4), station("b", 41, 3.5), station("c", 109, 3.3)];

  test("flags a 68 mi stretch and names the last station before it", () => {
    const { gaps } = plan(planInput({ stations: ruralStations, route: straightRoute(130) }));

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ startMi: 41, endMi: 109, lengthMi: 68, lastChance: { id: "b" } });
  });

  test("marks must-fill when the far side of the gap is beyond safe range", () => {
    const input = planInput({
      stations: ruralStations,
      route: straightRoute(130),
      vehicle: { rangeMi: 100, mpg: 30, fillGallons: 12 },
    });

    expect(plan(input).gaps[0]?.mustFillBefore).toBe(true);
  });

  test("does not mark must-fill when current fuel crosses the gap", () => {
    const input = planInput({
      stations: ruralStations,
      route: straightRoute(130),
      vehicle: { rangeMi: 300, mpg: 30, fillGallons: 12 },
    });

    expect(plan(input).gaps[0]?.mustFillBefore).toBe(false);
  });

  test("warns about an empty run to the destination", () => {
    const { gaps } = plan(planInput({ stations: [station("a", 10, 3.4)], route: straightRoute(80) }));

    expect(gaps).toEqual([expect.objectContaining({ startMi: 10, endMi: 80, endsAtDestination: true })]);
  });

  test("measures gaps on TopTier stations only when the filter is on", () => {
    const stations = [
      station("shell", 5, 3.5, { isTopTier: true }),
      station("indie", 30, 3.1),
      station("chevron", 60, 3.6, { isTopTier: true }),
    ];

    const off = plan(planInput({ stations, route: straightRoute(70) }));
    const on = plan(planInput({ stations, route: straightRoute(70), topTierOnly: true }));

    expect(off.gaps).toHaveLength(0);
    expect(on.gaps).toEqual([expect.objectContaining({ startMi: 5, endMi: 60 })]);
  });
});

describe("bucketByEta", () => {
  test("groups stations into time-ahead buckets and drops empty ones", () => {
    const { reachable } = plan(
      planInput({ stations: [station("a", 5, 3), station("b", 20, 3), station("c", 70, 3)] }),
    );

    const buckets = bucketByEta(reachable);

    expect(buckets.map((b) => [b.fromMin, b.toMin, b.stations.map((s) => s.id)])).toEqual([
      [0, 15, ["a"]],
      [15, 30, ["b"]],
      [60, 120, ["c"]],
    ]);
  });
});
