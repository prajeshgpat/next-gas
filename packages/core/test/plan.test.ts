import { describe, expect, test } from "vitest";
import { plan, safeRangeMi } from "../src/index.js";
import { planInput, station } from "./fixtures/builders.js";

describe("safeRangeMi", () => {
  test("holds back 15 mi when 10% of range is smaller", () => {
    expect(safeRangeMi(100)).toBe(85);
  });

  test("holds back 10% when that exceeds 15 mi", () => {
    expect(safeRangeMi(300)).toBe(270);
  });

  test("never goes negative", () => {
    expect(safeRangeMi(10)).toBe(0);
  });
});

describe("plan recommendation", () => {
  test("suggests waiting for a cheaper reachable station when savings exceed $1", () => {
    const input = planInput({
      stations: [station("near", 2, 3.6), station("costco", 34, 3.19)],
    });

    const { recommendation } = plan(input);

    expect(recommendation.kind).toBe("wait");
    if (recommendation.kind !== "wait") return;
    expect(recommendation.station.id).toBe("costco");
    expect(recommendation.versus.id).toBe("near");
    expect(recommendation.savingsUsd).toBeCloseTo(12 * (3.6 - 3.19), 0);
  });

  test("fills now when the cheaper station saves $1 or less", () => {
    const input = planInput({ stations: [station("near", 2, 3.3), station("far", 40, 3.25)] });

    expect(plan(input).recommendation).toMatchObject({ kind: "fill_now", station: { id: "near" } });
  });

  test("never suggests a cheaper station beyond the safe range", () => {
    // range 120 → safe range 105
    const input = planInput({ stations: [station("near", 2, 3.9), station("far", 110, 2.5)] });

    const result = plan(input);

    expect(result.recommendation).toMatchObject({ kind: "fill_now", station: { id: "near" } });
    expect(result.reachable.map((s) => s.id)).toEqual(["near"]);
  });

  test("does not suggest waiting on an estimated or day-old price", () => {
    const input = planInput({
      stations: [
        station("near", 2, 3.9),
        station("est", 30, 3.0, { source: "estimate" }),
        station("old", 40, 3.0, { ageH: 30 }),
      ],
    });

    expect(plan(input).recommendation).toMatchObject({ kind: "fill_now", station: { id: "near" } });
  });

  test("counts detour fuel against a far-off-route station", () => {
    const input = planInput({
      stations: [station("near", 2, 3.3), station("detour", 20, 3.22, { offRouteMi: 1.5 })],
    });

    const result = plan(input);
    const detour = result.reachable.find((s) => s.id === "detour");

    expect(detour?.detourMi).toBeCloseTo(3.9);
    expect(result.recommendation.kind).toBe("fill_now");
  });

  test("applies the TopTier filter", () => {
    const input = planInput({
      topTierOnly: true,
      stations: [station("cheap", 5, 2.9), station("shell", 10, 3.5, { isTopTier: true })],
    });

    const result = plan(input);

    expect(result.reachable.map((s) => s.id)).toEqual(["shell"]);
    expect(result.recommendation).toMatchObject({ kind: "fill_now", station: { id: "shell" } });
  });

  test("ignores stations behind the car", () => {
    const input = planInput({
      positionMi: 50,
      stations: [station("behind", 40, 2.5), station("ahead", 60, 3.5)],
    });

    const result = plan(input);

    expect(result.reachable.map((s) => s.id)).toEqual(["ahead"]);
    expect(result.reachable[0]?.aheadMi).toBe(10);
    expect(result.reachable[0]?.etaMin).toBeCloseTo(10);
  });

  test("reports the nearest station inside raw range when none is in the safe range", () => {
    const input = planInput({
      vehicle: { rangeMi: 20, mpg: 30, fillGallons: 12 },
      stations: [station("close-call", 12, 3.5)],
    });

    expect(plan(input).recommendation).toMatchObject({
      kind: "no_safe_station",
      nearestInRawRange: { id: "close-call" },
    });
  });
});
