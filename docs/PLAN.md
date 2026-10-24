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

**Not in v1:** accounts, payments, EV charging, crowd price reports, and navigation itself (a "Go" button hands off to Google or Apple Maps).

**Coverage:** anywhere in the US. Station locations come from a precomputed OpenStreetMap dataset; prices are fetched live, only for the route you enter.

---

## 2. The core algorithm

Runs in the browser.

```
1. route     = directions(origin, dest)              → polyline, cumulative miles and ETA per vertex
2. corridor  = stations within 1.5 mi of the route (turf.js on the OSM station shards for the route)
3. for each station s:
     s.along_mi   = distance along the route to s's nearest point on the line
     s.detour_mi  ≈ 2 × off-route distance × 1.3 road factor (v1); routing-matrix detours for top 10 (v2)
     s.eta_min    = interpolated from route ETA at s.along_mi
4. safe_range = range_left − max(15 mi, 10% of range)              ← reserve buffer
   reachable  = { s : s.along_mi + s.detour_mi ≤ safe_range }
   if TopTier: filter by brand_id ∈ toptier_brands
5. prices    = live GasBuddy lookup for the reachable part of the route only (section 3)
6. effective_cost(s) = price(s) × gallons_to_fill
                     + price(s) × detour_mi / mpg                     ← fuel spent on the detour
                     + detour_min × value_of_time (default $0, user setting)
7. best = argmin effective_cost over reachable
   recommend "wait" only if savings(best vs nearest) > $1 AND price confidence ≥ medium
8. gaps = gaps > safe_range between consecutive (filtered) stations ahead
   → "last chance" marker = last station before each gap
```

Steps 1–4 and 8 need no prices, so reachability and gap warnings show immediately; prices fill in as they arrive.

Design rules:

- **Safety beats savings.** A station outside the safe range is never suggested, however cheap.
- **Every price carries its age and source.** Effective cost uses the price's confidence (posted < 4h, stale < 24h, estimate). Waiting is only suggested on reasonably fresh prices.
- **This is a pure function.** It sits in a `core/` package with no I/O, so it can be tested against fixture routes, plus property tests such as "never recommends an unreachable station" and "TopTier filter is never violated".

---

## 3. Data sources

| Need | Source | Free tier / notes |
|---|---|---|
| **Station prices** | **GasBuddy, fetched live for the entered ride only** | Free. Uses the GraphQL endpoint behind gasbuddy.com's station search (the one the open-source `py-gasbuddy` library calls): search by lat/lng, get nearby stations with regular/midgrade/premium/diesel prices, cash vs credit, and when each price was posted. Goes through a small proxy (below). |
| Station locations and brands | **OpenStreetMap** `amenity=fuel`, US extract from Geofabrik, rebuilt weekly | Free (ODbL, attribution required). Gives complete station coverage for gap warnings, including stations with no price. |
| Brand normalization | OSM `brand:wikidata` tags plus the **name-suggestion-index** | Maps "Shell", "SHELL", "Shell Gas" → one Wikidata ID. GasBuddy brand names map through the same table. |
| TopTier list | Licensed-brand list from toptiergas.com, kept as a versioned `toptier_brands.yaml` in the repo | Shell, Chevron, Texaco, Exxon, Mobil, BP, Amoco, Phillips 66, Conoco, 76, Costco, QuikTrip, Sinclair, Holiday, Kwik Trip, etc. Re-check every quarter and add a CI test that every entry resolves to a Wikidata ID. |
| Fallback baseline | **EIA API** weekly state/region retail averages | Free key. Used for estimated prices when a live lookup fails or a station has no recent GasBuddy price: regional average + brand offset (e.g., Costco −$0.25, Shell +$0.15). Always labelled "est." |
| Routing and geocoding | **Mapbox** Directions + Search, called from the browser | ~100k directions/month free. Uses a public token restricted to the Pages URL. |
| Map tiles | **MapLibre GL** + OpenFreeMap | Free |

### Live GasBuddy lookup per ride

There is no background or scheduled scraping. GasBuddy is only contacted when someone plans a ride, and only for the part of the route that matters.

- **Why a proxy is needed:** a browser can't call gasbuddy.com directly (cross-origin requests are blocked), and GitHub Pages can't run server code. A tiny **Cloudflare Worker** (free: 100k requests/day) forwards the lookups. It contains no business logic: it takes a list of lat/lng points and returns normalized prices.
- **Query only the reachable stretch:** the browser picks search points along the route from your location up to `safe_range`, not the whole trip. Points are about 5 mi apart, and only where the OSM corridor actually has stations (no lookups across empty stretches). A typical ride is about **5–15 requests**, with a hard cap of 20.
- **Nearest first:** points are queried in order of distance ahead, so the "fill now?" answer appears within a few seconds and farther stations fill in after.
- **Polite pacing:** at most 2 requests at a time with about 1 s between them, a descriptive User-Agent, and no retries on 403 or 429. On a block signal the Worker stops, and the app falls back to EIA estimates for the rest of the route.
- **Shared cache:** each search point is snapped to a grid cell (about 1 mi) and its result is cached in the Worker for 60 minutes. Repeated rides, drive-mode refreshes and other users on the same road reuse cached results instead of making new requests.
- **Drive mode doesn't re-query:** as you drive, the app re-ranks the prices it already has. It only looks up new points when your safe range extends past what's already been fetched, and never more often than every 10 minutes.
- **Abuse guards:** a per-IP rate limit (e.g., 5 rides per 10 min), a global daily cap with a kill switch in the Worker config, and the Worker only accepts requests from the Pages origin.
- **Matching:** a GasBuddy station is the same as an OSM station when they're within 300 ft and the brands match (or the names fuzzy-match). Unmatched GasBuddy stations are added to the corridor so no prices are lost.
- **Isolation:** the GasBuddy client is one module in the Worker (`worker/src/sources/gasbuddy.ts`) that outputs a typed `PriceObservation` schema. If GasBuddy changes or blocks the Worker, only that module changes, and a different price source could replace it without touching the app.

### Risks to accept up front

- **Terms of service:** GasBuddy's terms prohibit automated access, even at low volume, and showing their prices in another app is redistribution. That's acceptable for a personal project, but GasBuddy can block it at any time. It's not a foundation for a commercial product.
- **Blocking:** gasbuddy.com is behind bot protection, and Cloudflare Worker requests come from Cloudflare's network, which bot protection may challenge. An early spike (M0) must confirm the lookup works from a Worker. If it doesn't, alternatives are a different free serverless host, or running the proxy on your own computer during testing.
- **Brittleness:** GasBuddy can change the endpoint or schema without notice. Contract tests on a saved sample response catch this, and the app degrades to EIA estimates instead of breaking.

---

## 4. Architecture and stack (all free)

```
 Browser: Vite + React + TypeScript PWA (served from GitHub Pages)
   │  MapLibre, TanStack Query, Zod, Tailwind, geolocation + wake lock
   ├─ Mapbox Directions → route polyline
   ├─ fetch the OSM station shards the route corridor touches (static, from Pages)
   ├─ packages/core: corridor, reachability, gaps (no prices needed)
   ├─ POST /prices {points: [...nearest first]} ─────────────┐
   └─ packages/core: re-rank with prices as they arrive       │
                                                               ▼
                                     Cloudflare Worker (price proxy, free tier)
                                       ├─ origin check, per-IP rate limit, daily cap
                                       ├─ Cache API: 60 min per ~1 mi grid cell
                                       └─ GasBuddy GraphQL lookup (paced, stops on 403/429)

 GitHub Actions
   ├─ on PR: lint, typecheck, tests, build
   ├─ on push to main: build web app + data → deploy to GitHub Pages; deploy Worker (wrangler)
   └─ weekly cron: Geofabrik US OSM extract → stations → geohash-4 shards → redeploy Pages
                   EIA weekly averages → regional_prices.json
```

- **Monorepo** (pnpm workspaces): `apps/web`, `worker/` (Cloudflare Worker), `packages/core` (algorithm, pure TS), `packages/schema` (JSON Schema → generated TS types and Zod validators, also used by the Python pipeline via Pydantic), `pipelines/` (Python + DuckDB for OSM and EIA).
- **Why Vite instead of Next.js:** GitHub Pages can't run server code, and a Vite SPA deploys to a subpath (`/next-gas/`) with no extra setup. If NextGas later moves to Cloudflare Pages, the Worker and app can live together without changing `core`.
- **Station shards** keep downloads small: each geohash-4 cell (about 24 × 12 mi) holds its stations and brands. Shards are cached by the service worker until `manifest.json` changes.
- **Branches:** work happens on `dev`. Changes reach `main` by pull request. Pages and the Worker deploy from `main`.

---

## 5. Data model

Static data built weekly by the pipeline (DuckDB, written out as JSON):

```
stations       (station_id, osm_id, name, brand_id, lat, lon, address, last_seen)
brands         (brand_id, wikidata_id UNIQUE, name, gasbuddy_names[], is_toptier, toptier_verified_at)
regional_prices(region, grade, week, price_usd, source='eia')
```

Live data returned by the Worker per lookup (validated by Zod on both sides):

```
PriceObservation (gasbuddy_id, name, brand, lat, lon, grade, price_usd,
                  payment ENUM('credit','cash'), posted_at, fetched_at, cache_hit)
```

Merged in the browser into `station + latest price + confidence = f(source, age)`.

- **No price database in v1.** Prices only live in the Worker's 60-minute cache and the browser, so there's no stored GasBuddy data to republish.
- **Brand offsets** for EIA estimates start as a hand-tuned table in the repo. Learning them from observed prices would need storage (e.g., Cloudflare D1 free tier) and is deferred to M4.

Data-engineering practices:

- **Weekly pipeline quality gates:** at least 99% of stations have coordinates; station count drift under 5% week over week; every TopTier brand resolves. If a gate fails, the last good shards stay live and a GitHub issue is opened.
- **Idempotent builds:** shards are a pure function of the OSM extract and the brand table, versioned in `manifest.json`.
- **Validation at every boundary:** GasBuddy responses are parsed into `PriceObservation` in the Worker (bad rows dropped and counted), and the browser validates the Worker response again.
- **Lineage on every price:** `source`, `posted_at` vs `fetched_at`, and `cache_hit`, shown in the UI as the price's age.

---

## 6. Request budget and cost

- **No paid services:** GitHub Pages, Actions, Cloudflare Workers free tier, Mapbox free tier, EIA and OSM are all free.
- **GasBuddy requests scale with real use, not a schedule:** about 5–15 per new ride, near zero for repeat rides on the same roads thanks to the shared cache, and a global daily cap (start at 300) as a hard limit.
- **Mapbox:** one directions call per new route, cached in the browser for 15 min.
- **Shards** are immutable per data version, so browsers and the Pages CDN cache them.

---

## 7. Quality, testing, ops

- **Unit tests:** `core` with Vitest, using golden fixture routes such as I-95 NYC→DC, a rural stretch with real gaps, and a TopTier-only case. Includes the search-point picker (only reachable stretch, only where stations exist, nearest first, at most 20).
- **Property tests:** with fast-check, using the safety invariants from section 2.
- **Worker tests:** Vitest with Miniflare. A saved GasBuddy response fixture is parsed into `PriceObservation`, and tests cover the cache, rate limit, daily cap and stop-on-403 behaviour. The real GasBuddy site is never hit in CI.
- **Pipeline tests:** pytest + DuckDB on a small OSM sample, covering brand normalization and quality gates.
- **E2E:** Playwright against the built site with fixture shards, a mocked Worker and a simulated GPS track.
- **CI:** GitHub Actions on every PR: ruff + pytest, ESLint + typecheck + Vitest, build, and Playwright.
- **Monitoring:** the Worker logs request counts, cache hit rate and GasBuddy error codes (Cloudflare's free analytics). Repeated 403s flip the app to "estimates only" and open a GitHub issue. App errors go to Sentry (free tier).
- **Privacy:** the Worker receives route points for price lookups but doesn't store them or log full coordinates.

---

## 8. Milestones

| Phase | Deliverable |
|---|---|
| **M0 (1 wk)** | Repo scaffold, CI, Pages deploy of a placeholder app from `main`. **Spike: one GasBuddy lookup from a Cloudflare Worker** (go/no-go on the endpoint and blocking). |
| **M1 (2 wk)** | OSM station pipeline and shards, TopTier brand mapping, map with route and corridor stations, reachability and gap warnings (no prices yet). |
| **M2 (1–2 wk)** | Worker price proxy with cache, pacing and caps; search-point picker; live prices on the map; savings recommendation card; EIA estimates as fallback. |
| **M3 (1 wk)** | Drive mode (GPS refresh, client re-rank, incremental lookups, wake lock), PWA install, hand-off to Maps |
| **M4** | Learned brand offsets (needs a small price store), `/status` page with Worker health, routing-matrix detours. |

**Reuse:** RainMan already has route sampling along a polyline, client caching, the PWA shell, and shareable `?from=&to=` URLs. BenriSpace's contract-first setup and DuckDB patterns carry over.
