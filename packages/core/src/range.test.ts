import { describe, expect, it } from "vitest";
import { isReachable, safeRangeMi } from "./range.ts";

describe("safeRangeMi", () => {
  it("holds back 15 mi on short ranges", () => {
    expect(safeRangeMi(60)).toBe(45);
  });

  it("holds back 10% on long ranges", () => {
    expect(safeRangeMi(300)).toBe(270);
  });

  it("is never negative", () => {
    expect(safeRangeMi(10)).toBe(0);
    expect(safeRangeMi(0)).toBe(0);
    expect(safeRangeMi(-5)).toBe(0);
    expect(safeRangeMi(Number.NaN)).toBe(0);
  });
});

describe("isReachable", () => {
  it("counts the detour against the range", () => {
    expect(isReachable(40, 4, 60)).toBe(true);
    expect(isReachable(40, 6, 60)).toBe(false);
  });
});
