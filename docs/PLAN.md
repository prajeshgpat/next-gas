# NextGas plan

NextGas answers one question while you drive: **"Should I fill up now, or is there a cheaper station I can safely reach?"** It only suggests waiting when a station you can reach is cheaper, and it shows you the last safe place to fill before a long stretch with no stations.

---

## 1. Product scope

**Inputs:** your current location (GPS), destination, range left (miles, or a % of the tank plus MPG), and a **TopTier only** checkbox. Tank size and MPG are optional settings saved on the device.

**Outputs:**

1. **A recommendation card:** "Fill at Costco, mile 34 (about 32 min), $3.19. Saves about $4.80 vs filling now" or "Fill now. No cheaper station within your safe range."
2. **A strip of stations along the route**, grouped by time ahead (0–15, 15–30, 30–60 min…). Each shows price, how old the price is, extra detour minutes, and a TopTier badge.
3. **Gap warnings:** "No stations (TopTier) for 68 mi after Exit 12. Fill before mile 41." This covers the "I don't know if there'll be a station in 30 minutes" problem.
4. **Drive mode:** big tap targets, refreshes from GPS every ~2 min or 2 mi, no typing. The UI says it's for passengers or for use when parked.

**Not in v1:** accounts, payments, EV charging, and navigation itself (a "Go" button hands off to Google or Apple Maps).

---

## 2. The core algorithm

```
1. route     = directions(origin, dest)              → polyline, cumulative miles and ETA per vertex
2. corridor  = stations within 1.5 mi of the route (PostGIS ST_DWithin on geography)
3. for each station s:
     s.along_mi   = ST_LineLocatePoint(route, s) × route_length
     s.detour_mi  ≈ 2 × off-route distance × 1.3 road factor (v1); routing-matrix detours for top 10 (v2)
     s.eta_min    = interpolated from route ETA at s.along_mi
4. safe_range = range_left − max(15 mi, 10% of range)              ← reserve buffer
   reachable  = { s : s.along_mi + s.detour_mi ≤ safe_range }
   if TopTier: filter by brand_id ∈ toptier_brands
5. effective_cost(s) = price(s) × gallons_to_fill
                     + price(s) × detour_mi / mpg                     ← fuel spent on the detour
                     + detour_min × value_of_time (default $0, user setting)
6. best = argmin effective_cost over reachable
   recommend "wait" only if savings(best vs nearest) > $1 AND price confidence ≥ medium
7. gaps = gaps > safe_range between consecutive (filtered) stations ahead
   → "last chance" marker = last station before each gap
```

Design rules:

- **Safety beats savings.** A station outside the safe range is never suggested, however cheap.
- **Every price carries its age and source.** Effective cost uses the price's confidence (live < 4h, stale < 24h, estimate). Waiting is only suggested on reasonably fresh prices.
- **This is a pure function.** It sits in a shared `core/` package with no I/O, so it can be tested against fixture routes, plus property tests such as "never recommends an unreachable station" and "TopTier filter is never violated".

---

## 3. Data sources (prices are the hard part)

| Need | Source | Free tier / notes |
|---|---|---|
| Station locations and brands | **OpenStreetMap** `amenity=fuel`, US extract from Geofabrik | Free (ODbL, attribution required). About 100k+ US stations. Bulk extract weekly; don't hit Overpass per request. |
| Brand normalization | OSM `brand:wikidata` tags plus the **name-suggestion-index** | Maps "Shell", "SHELL", "Shell Gas" → one Wikidata ID |
| TopTier list | Licensed-brand list from toptiergas.com, kept as a versioned `toptier_brands.yaml` in the repo | Shell, Chevron, Texaco, Exxon, Mobil, BP, Amoco, Phillips 66, Conoco, 76, Costco, QuikTrip, Sinclair, Holiday, Kwik Trip, etc. Re-check every quarter and add a CI test that every entry resolves to a Wikidata ID. |
| **Live station prices** | **Google Places API (New) `fuelOptions` field** | Gives real per-station prices with update times. It's an Enterprise-tier field with a small monthly free quota (on the order of 1k calls, so check current pricing). Fetch only for the ~10 candidates that matter, cache each station for 2–4 h, and add a hard monthly cap with a kill switch. |
| Crowd prices | In-app "Report price" (two taps from the station card) | Free. Rate-limited, outlier-rejected, weighted by recency. Over time this becomes the moat. |
| Fallback baseline | **EIA API** weekly state/region retail averages | Free key. Used for estimated prices: regional average + learned brand offset (e.g., Costco −$0.25, Shell +$0.15). Always labelled "est." |
| Routing and geocoding | **Mapbox** Directions + Search, or OpenRouteService | Mapbox: ~100k directions/month free. ORS: ~2k/day. |
| Map tiles | **MapLibre GL** + OpenFreeMap or MapTiler free | Free |

**Not used:** scraping GasBuddy or similar sites. It breaks their terms of service and can be shut off without warning.

---

## 4. Architecture and stack (all free tier)

```
 Next.js 15 PWA (Vercel or Cloudflare Pages)
   │  MapLibre, TanStack Query, Zod, Tailwind, geolocation + wake lock
   ▼
 API: Next.js route handlers / Hono on Cloudflare Workers
   │  POST /v1/plan   GET /v1/stations/:id   POST /v1/prices (crowd report)
   │  Upstash Redis free: route cache, price cache, rate limits, quota counter
   ▼
 Supabase Postgres + PostGIS (free, 500 MB)
   ▲
 GitHub Actions cron (free)
   ├─ weekly: OSM extract → stations (idempotent upsert)
   ├─ weekly: EIA averages → regional_prices
   └─ nightly: brand-offset model refit + data-quality checks
```

- **Monorepo** (pnpm + Turborepo): `apps/web`, `packages/core` (algorithm, pure TS), `packages/contracts` (OpenAPI → generated types), `pipelines/` (Python + DuckDB for the OSM/EIA jobs), `db/migrations/`.
- **Why TypeScript for the core:** the same code runs on the server and in the browser, so drive-mode refreshes can re-rank cached corridor stations offline as the car moves. Only a new route needs the network.
- **Contract-first:** `contracts/openapi.yaml` is the source of truth, with Zod validation at the edges (the same approach as BenriSpace).

---

## 5. Data model (Postgres)

```sql
stations          (id, osm_id UNIQUE, name, brand_id → brands, geog geography(Point),
                   address, amenities jsonb, source, first_seen, last_seen)    -- GIST index on geog
brands            (id, wikidata_id UNIQUE, name, is_toptier, toptier_verified_at)
price_observations(id, station_id, grade, price_usd numeric(5,3), observed_at,
                   source ENUM('google','crowd','estimate'), reporter_hash, ingested_at)
                   -- append-only; partitioned by month
station_price_latest  MATERIALIZED VIEW / table: best current price per (station, grade)
                      with confidence = f(source, age)
regional_prices   (region, grade, week, price_usd, source='eia')
```

Data-engineering practices:

- **Append-only facts** with a `latest` serving view, so history is never overwritten and the brand-offset model has data to train on.
- **Every row carries lineage:** `source`, `observed_at` vs `ingested_at`.
- **Quality gates in CI and the pipelines:** price between $1.50 and $10, no crowd report > 3σ from the station median, at least 99% of stations have a geometry, row-count drift < 5% week over week. If a gate fails, the publish step is blocked.
- **Idempotent jobs:** each run is keyed by `osm_id` or `(station, observed_at, source)` and can safely run again.
- **Freshness SLAs** show on a tiny `/status` page.

---

## 6. Cost control on free tiers

- **Route cache:** origin and destination rounded to about 300 ft, cached for 15 min in Redis.
- **Price fetches limited by need:** call Google only for the top-N reachable stations whose cached price is older than its TTL. Keep a monthly counter in Redis. At 80% of quota, fall back to crowd and estimated prices and show that in the UI.
- **Rate limits:** per IP via Upstash, plus a Cloudflare Turnstile check on price reports.
- **Client re-ranking:** the corridor is fetched once per route, then the browser re-ranks locally as GPS updates. This avoids extra API calls while driving.

---

## 7. Quality, testing, ops

- **Unit tests:** `core` with Vitest, using golden fixture routes such as I-95 NYC→DC, a rural I-80 stretch with real gaps, and a TopTier-only case.
- **Property tests:** with fast-check, using the safety invariants from section 2.
- **Contract tests:** API responses checked against OpenAPI. Pipeline tests run DuckDB on a small OSM sample.
- **E2E:** Playwright with a mocked API and a simulated GPS track.
- **CI:** GitHub Actions running lint, typecheck, tests, build, and migration dry-run. Preview deploy per PR.
- **Observability:** Sentry (free) for errors, PostHog (free) for product events such as "recommendation accepted" and "price reported". No location history is stored server-side.
- **Privacy:** location is used per request and never persisted. Crowd reporters are an anonymous salted hash.

---

## 8. Milestones

| Phase | Deliverable |
|---|---|
| **M0 (1 wk)** | Repo scaffold, CI, OSM station ingest, TopTier brand mapping, PostGIS corridor query |
| **M1 (2 wk)** | `/v1/plan` with route, corridor, reachability and gap warnings, using EIA estimated prices only; map + station strip UI |
| **M2 (1–2 wk)** | Live prices via Google `fuelOptions` with caching and quota cap; savings recommendation card |
| **M3 (1 wk)** | Drive mode (GPS refresh, client re-rank, wake lock), PWA install, hand-off to Maps |
| **M4** | Crowd price reports, brand-offset model, `/status` freshness page |

**Reuse:** RainMan already has route sampling along a polyline, client caching, the PWA shell, and shareable `?from=&to=` URLs. BenriSpace's contract-first OpenAPI setup and Supabase/PostGIS patterns carry over directly.

---

## Open decisions

1. **Repo:** NextGas as a new repo (recommended, since it's a separate product).
2. **Price-data budget:** stay strictly free (Google's small free quota plus crowd and estimated prices), or allow a few dollars a month of Google Places calls so more stations show live prices.
