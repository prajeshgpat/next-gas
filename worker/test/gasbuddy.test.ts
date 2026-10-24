import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/search-response.handwritten.json";
import { GasBuddyError, parseSearchResponse, readCsrfToken, searchStations } from "../src/sources/gasbuddy.ts";

const FETCHED_AT = "2026-10-24T15:00:00.000Z";

describe("parseSearchResponse", () => {
  const result = parseSearchResponse(fixture, FETCHED_AT);

  it("keeps valid stations and counts dropped rows", () => {
    expect(result.stations.map((s) => s.id)).toEqual(["1001", "1002"]);
    expect(result.droppedRows).toBe(1);
  });

  it("flattens prices per grade and payment", () => {
    expect(result.observations).toEqual([
      expect.objectContaining({ gasbuddyId: "1001", grade: "regular", payment: "credit", priceUsd: 3.19 }),
      expect.objectContaining({ gasbuddyId: "1001", grade: "regular", payment: "cash", priceUsd: 3.09 }),
      expect.objectContaining({ gasbuddyId: "1002", grade: "diesel", payment: "credit", brand: null, postedAt: null }),
    ]);
  });

  it("treats a 0 price as missing, not as $0", () => {
    expect(result.observations.some((o) => o.priceUsd === 0)).toBe(false);
  });

  it("reports a changed response shape", () => {
    expect(() => parseSearchResponse({ errors: [{ message: "nope" }] }, FETCHED_AT)).toThrow(GasBuddyError);
  });
});

describe("readCsrfToken", () => {
  it("reads the token from the home page", () => {
    expect(readCsrfToken('<script>window.gbcsrf = "1.abc+def";</script>')).toBe("1.abc+def");
    expect(readCsrfToken("<html></html>")).toBeNull();
  });
});

describe("searchStations", () => {
  it("makes exactly two requests: home page, then GraphQL with the token", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('window.gbcsrf = "tok";'))
      .mockResolvedValueOnce(new Response(JSON.stringify(fixture)));
    const result = await searchStations({ lat: 40.79, lon: -74.06 }, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const init = fetchFn.mock.calls[1]?.[1];
    expect(new Headers(init?.headers).get("gbcsrf")).toBe("tok");
    expect(JSON.parse(String(init?.body)).variables).toMatchObject({ lat: 40.79, lng: -74.06 });
    expect(result.observations).toHaveLength(3);
  });

  it.each([403, 429])("stops on HTTP %i without retrying", async (status) => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status }));
    await expect(searchStations({ lat: 0, lon: 0 }, { fetchFn })).rejects.toMatchObject({ kind: "blocked", status });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("treats a bot challenge page as blocked", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("<title>Just a moment...</title>"));
    await expect(searchStations({ lat: 0, lon: 0 }, { fetchFn })).rejects.toMatchObject({ kind: "blocked" });
  });
});
