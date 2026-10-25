import { describe, expect, test } from "vitest";
import { minutesAt, priceConfidence, type RoutePoint } from "../src/index.js";
import { NOW } from "./fixtures/builders.js";

describe("minutesAt", () => {
  // 10 mi of highway at 60 mph, then 10 mi of town at 30 mph.
  const route: RoutePoint[] = [
    { cumMi: 0, cumMin: 0 },
    { cumMi: 10, cumMin: 10 },
    { cumMi: 20, cumMin: 30 },
  ];

  test("interpolates within a segment", () => {
    expect(minutesAt(route, 5)).toBe(5);
    expect(minutesAt(route, 15)).toBe(20);
  });

  test("clamps outside the route", () => {
    expect(minutesAt(route, -1)).toBe(0);
    expect(minutesAt(route, 99)).toBe(30);
  });

  test("returns 0 for an empty route", () => {
    expect(minutesAt([], 5)).toBe(0);
  });
});

describe("priceConfidence", () => {
  const at = (ageH: number) => new Date(NOW.getTime() - ageH * 3_600_000);

  test.each([
    [1, "gasbuddy", "high"],
    [5, "crowd", "medium"],
    [30, "google", "low"],
    [0, "estimate", "low"],
  ] as const)("%dh old %s price is %s confidence", (ageH, source, expected) => {
    expect(priceConfidence({ usdPerGallon: 3, source, observedAt: at(ageH) }, NOW)).toBe(expected);
  });
});
