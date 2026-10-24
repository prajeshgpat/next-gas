/**
 * GasBuddy client: one station search around a point.
 *
 * Uses the GraphQL endpoint behind gasbuddy.com's own station search (the same one the
 * open-source py-gasbuddy library calls). The page hands out a CSRF token that the
 * GraphQL request must echo back, so one lookup is two requests: GET /home, POST /graphql.
 *
 * Nothing here retries. A block signal (403, 429, a bot challenge) is reported as
 * kind "blocked" so the caller can stop and fall back to estimates.
 */
import { z } from "zod";
import type { Grade, PriceObservation } from "../schema.ts";

export const GASBUDDY_ORIGIN = "https://www.gasbuddy.com";
const HOME_URL = `${GASBUDDY_ORIGIN}/home`;
const GRAPHQL_URL = `${GASBUDDY_ORIGIN}/graphql`;
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 NextGas/0.1";

const STATION_SEARCH_QUERY = `
query LocationBySearchTerm($lat: Float, $lng: Float, $fuel: Int, $maxAge: Int) {
  locationBySearchTerm(lat: $lat, lng: $lng) {
    stations(fuel: $fuel, maxAge: $maxAge) {
      count
      results {
        id
        name
        latitude
        longitude
        address { line1 locality region postalCode }
        brands { brandId name }
        prices {
          fuelProduct
          cash { price postedTime }
          credit { price postedTime }
        }
      }
    }
  }
}`;

export type GasBuddyErrorKind = "blocked" | "changed" | "network";

export class GasBuddyError extends Error {
  constructor(
    readonly kind: GasBuddyErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GasBuddyError";
  }
}

const BLOCK_STATUSES = new Set([401, 403, 429, 503]);
const CHALLENGE_MARKERS = ["cf-chl", "challenge-platform", "Just a moment..."];

const PostedPrice = z
  .object({ price: z.number().nullable().optional(), postedTime: z.string().nullable().optional() })
  .nullable()
  .optional();

const Station = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  address: z
    .object({
      line1: z.string().nullable().optional(),
      locality: z.string().nullable().optional(),
      region: z.string().nullable().optional(),
      postalCode: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  brands: z.array(z.object({ brandId: z.union([z.string(), z.number()]).optional(), name: z.string() })).default([]),
  prices: z.array(z.object({ fuelProduct: z.string(), cash: PostedPrice, credit: PostedPrice })).default([]),
});

const SearchResponse = z.object({
  data: z.object({
    locationBySearchTerm: z
      .object({ stations: z.object({ count: z.number().optional(), results: z.array(z.unknown()) }) })
      .nullable(),
  }),
});

export type GasBuddyStation = z.infer<typeof Station>;

const GRADES: Record<string, Grade> = {
  regular_gas: "regular",
  midgrade_gas: "midgrade",
  premium_gas: "premium",
  diesel: "diesel",
};

export interface SearchResult {
  stations: GasBuddyStation[];
  observations: PriceObservation[];
  /** Station rows that failed validation and were dropped. */
  droppedRows: number;
}

type FetchFn = typeof fetch;

export function readCsrfToken(html: string): string | null {
  return /window\.gbcsrf\s*=\s*"([^"]+)"/.exec(html)?.[1] ?? null;
}

function checkBlocked(res: Response, body: string): void {
  if (BLOCK_STATUSES.has(res.status) || CHALLENGE_MARKERS.some((m) => body.includes(m))) {
    throw new GasBuddyError("blocked", `GasBuddy refused the request (HTTP ${res.status})`, res.status);
  }
}

async function send(fetchFn: FetchFn, url: string, init: RequestInit): Promise<{ res: Response; body: string }> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch (err) {
    throw new GasBuddyError("network", `Could not reach GasBuddy: ${String(err)}`);
  }
  const body = await res.text();
  checkBlocked(res, body);
  return { res, body };
}

export async function fetchCsrfToken(fetchFn: FetchFn = fetch): Promise<string> {
  const { res, body } = await send(fetchFn, HOME_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  const token = res.ok ? readCsrfToken(body) : null;
  if (!token) throw new GasBuddyError("changed", `No CSRF token on GasBuddy home page (HTTP ${res.status})`, res.status);
  return token;
}

/** Parses a GraphQL response body. Exported for fixture tests. */
export function parseSearchResponse(json: unknown, fetchedAt: string): SearchResult {
  const parsed = SearchResponse.safeParse(json);
  if (!parsed.success) {
    throw new GasBuddyError("changed", `Unexpected GasBuddy response shape: ${parsed.error.issues[0]?.message}`);
  }
  const rows = parsed.data.data.locationBySearchTerm?.stations.results ?? [];
  const stations: GasBuddyStation[] = [];
  let droppedRows = 0;
  for (const row of rows) {
    const station = Station.safeParse(row);
    if (station.success) stations.push(station.data);
    else droppedRows++;
  }
  return { stations, observations: stations.flatMap((s) => toObservations(s, fetchedAt)), droppedRows };
}

function toObservations(station: GasBuddyStation, fetchedAt: string): PriceObservation[] {
  const out: PriceObservation[] = [];
  for (const p of station.prices) {
    const grade = GRADES[p.fuelProduct];
    if (!grade) continue;
    for (const payment of ["credit", "cash"] as const) {
      const posted = p[payment];
      // GasBuddy reports 0 for "no price"; a missing price is null, never 0.
      if (!posted?.price || posted.price <= 0) continue;
      out.push({
        source: "gasbuddy",
        gasbuddyId: station.id,
        name: station.name,
        brand: station.brands[0]?.name ?? null,
        lat: station.latitude,
        lon: station.longitude,
        grade,
        payment,
        priceUsd: posted.price,
        postedAt: posted.postedTime ?? null,
        fetchedAt,
      });
    }
  }
  return out;
}

export async function searchStations(
  point: { lat: number; lon: number },
  opts: { fetchFn?: FetchFn; csrfToken?: string } = {},
): Promise<SearchResult & { raw: unknown }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const csrfToken = opts.csrfToken ?? (await fetchCsrfToken(fetchFn));
  const { res, body } = await send(fetchFn, GRAPHQL_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: GASBUDDY_ORIGIN,
      Referer: HOME_URL,
      "apollo-require-preflight": "true",
      gbcsrf: csrfToken,
    },
    body: JSON.stringify({
      operationName: "LocationBySearchTerm",
      query: STATION_SEARCH_QUERY,
      variables: { lat: point.lat, lng: point.lon, fuel: 1, maxAge: 0 },
    }),
  });
  if (!res.ok) throw new GasBuddyError("changed", `GasBuddy GraphQL returned HTTP ${res.status}`, res.status);
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new GasBuddyError("changed", "GasBuddy GraphQL returned non-JSON", res.status);
  }
  return { ...parseSearchResponse(json, new Date().toISOString()), raw: json };
}
