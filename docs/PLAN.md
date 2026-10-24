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

**Not in v1:** accounts, payments, EV charging, crowd price reports (needs a backend), and navigation itself (a "Go" button hands off to Google or Apple Maps).

**Coverage in v1:** a configured region (start with the NY metro and the I-95 corridor), not the whole US. The scraper's request budget sets how far this can grow.

---

## 2. The core algorithm

Runs in the browser on station shards fetched for the route (see section 4).

```
1. route     = directions(origin, dest)              → polyline, cumulative miles and ETA per vertex
2. corridor  = stations within 1.5 mi of the route (turf.js pointToLineDistance on the fetched shards)
3. for each station s:
     s.along_mi   = distance along the route to s's nearest point on the line
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
- **Every price carries its age and source.** Effective cost uses the price's confidence (posted < 4h, stale < 24h, estimate). Waiting is only suggested on reasonably fresh prices.
- **This is a pure function.** It sits in a `core/` package with no I/O, so it can be tested against fixture routes, plus property tests such as "never recommends an unreachable station" and "TopTier filter is never violated".

---

## 3. Data sources

| Need | Source | Free tier / notes |
|---|---|---|
| **Station prices** | **GasBuddy**, scraped on a schedule by GitHub Actions | Free. Uses the GraphQL endpoint behind gasbuddy.com's station search (the one the open-source `py-gasbuddy` library calls): search by lat/lng, get nearby stations with regular/midgrade/premium/diesel prices, cash vs credit, and when each price was posted. Details below. |
| Station locations and brands | **OpenStreetMap** `amenity=fuel`, regional extract from Geofabrik | Free (ODbL, attribution required). Needed even with GasBuddy: gap warnings require *complete* station coverage, including stations GasBuddy lists without a recent price. |
| Brand normalization | OSM `brand:wikidata` tags plus the **name-suggestion-index** | Maps "Shell", "SHELL", "Shell Gas" → one Wikidata ID. GasBuddy brand names map through the same table. |
| TopTier list | Licensed-brand list from toptiergas.com, kept as a versioned `toptier_brands.yaml` in the repo | Shell, Chevron, Texaco, Exxon, Mobil, BP, Amoco, Phillips 66, Conoco, 76, Costco, QuikTrip, Sinclair, Holiday, Kwik Trip, etc. Re-check every quarter and add a CI test that every entry resolves to a Wikidata ID. |
| Fallback baseline | **EIA API** weekly state/region retail averages | Free key. Used for estimated prices on stations with no recent GasBuddy price: regional average + learned brand offset (e.g., Costco −$0.25, Shell +$0.15). Always labelled "est." |
| Routing and geocoding | **Mapbox** Directions + Search, called from the browser | ~100k directions/month free. Uses a public token restricted to the Pages URL. |
| Map tiles | **MapLibre GL** + OpenFreeMap | Free |

### GasBuddy scraper

- **Grid sweep:** the region is covered by search points about 5 mi apart, denser in cities. Each request returns the stations around one point. Results are de-duplicated by GasBuddy station ID.
- **Schedule:** every 3 hours via GitHub Actions cron (free and unlimited for a public repo). A full sweep of the starting region should take a few hundred requests.
- **Polite by default:** one request every 2–3 s with jitter, a descriptive User-Agent, and exponential backoff. The run stops early on HTTP 403 or 429 and keeps the last good data instead of retrying hard.
- **Matching to OSM:** a GasBuddy station is the same as an OSM station when they're within 300 ft and the brands match (or the names fuzzy-match). Unmatched GasBuddy stations are kept as their own stations, so no prices are lost.
- **Isolation:** the scraper is one module (`pipelines/sources/gasbuddy.py`) that outputs a typed `PriceObservation` schema. If it breaks or gets blocked, the rest of the pipeline still runs and the app falls back to EIA estimates. A different price source could later replace it without changing the app.

### Risks to accept up front

- **Terms of service:** GasBuddy's terms prohibit automated scraping, and publishing the data on a public Pages site counts as redistribution. That's acceptable for a personal project, but GasBuddy can block it or send a takedown at any time. It's not a foundation for a commercial product.
- **Blocking:** gasbuddy.com is behind bot protection, and GitHub Actions runs from well-known cloud IP ranges. An early spike (M0) must confirm the endpoint works from Actions. If it doesn't, the fallback is running the scraper from a home machine on a schedule and pushing the output.
- **Brittleness:** GasBuddy can change the endpoint or schema without notice. Contract tests on a saved sample response catch this, and a failed scrape opens a GitHub issue automatically.

---

## 4. Architecture and stack (all free, static hosting on GitHub Pages)

GitHub Pages only serves static files, so there is no server or database at request time. Everything is precomputed by GitHub Actions and served as static JSON. The browser does the routing call and the algorithm.

```
 GitHub Actions (cron, every 3 h)
   ├─ scrape GasBuddy (region grid)             → raw/gasbuddy/<run_ts>.json
   ├─ weekly: Geofabrik OSM extract             → stations (osmium + DuckDB spatial)
   ├─ weekly: EIA averages                      → regional_prices
   ├─ transform (Python + DuckDB):  match GasBuddy ↔ OSM, normalize brands,
   │                                 compute confidence, apply quality gates
   ├─ publish: station shards by geohash-4 cell  → data/shards/<geohash>.json
   │                                              data/manifest.json (version, built_at, freshness)
   └─ build web app + data → deploy to GitHub Pages (actions/deploy-pages)

 Browser: Vite + React + TypeScript PWA (served from GitHub Pages)
   │  MapLibre, TanStack Query, Zod, Tailwind, geolocation + wake lock
   ├─ Mapbox Directions → route polyline
   ├─ fetch only the shards the route corridor touches (~20–30 for NYC → DC)
   └─ packages/core ranks stations, finds gaps, makes the recommendation
```

- **Monorepo** (pnpm workspaces): `apps/web`, `packages/core` (algorithm, pure TS), `packages/schema` (JSON Schema → generated TS types and Zod validators, also used by the Python pipeline via Pydantic), `pipelines/` (Python + DuckDB).
- **Why Vite instead of Next.js:** GitHub Pages can't run server code, and a Vite SPA deploys to a subpath (`/next-gas/`) with no extra setup. If NextGas later needs a backend (crowd reports, accounts), it can move to Vercel or Cloudflare Pages + Workers without changing `core`.
- **Shards** keep downloads small: each geohash-4 cell (about 24 × 12 mi) holds its stations, current prices and confidence. Each shard is cached by the service worker until `manifest.json` changes.
- **Branches:** work happens on `dev`. Changes reach `main` by pull request. Pages deploys from `main`, and the scheduled data refresh also runs against `main`.

---

## 5. Data model (static files)

The pipeline uses DuckDB tables, written out as Parquet and JSON.

```
stations           (station_id, osm_id?, gasbuddy_id?, name, brand_id, lat, lon, address,
                    first_seen, last_seen, source)
brands             (brand_id, wikidata_id UNIQUE, name, gasbuddy_names[], is_toptier, toptier_verified_at)
price_observations (station_id, grade, price_usd, payment ENUM('credit','cash'), posted_at,
                    source ENUM('gasbuddy','estimate'), scraped_at, run_id)
                    -- append-only; one Parquet file per day
station_price_latest   best current price per (station, grade) with confidence = f(source, age)
regional_prices    (region, grade, week, price_usd, source='eia')
```

Storage:

- **Serving data** (`data/shards/*.json`, `manifest.json`) is built in each Actions run and deployed with the site. It is not committed to git, so the repo doesn't fill up with data churn.
- **History** (`price_observations` as daily Parquet) is committed to an orphan `data` branch. It's small (a few MB a month for one region) and gives the brand-offset model something to train on.
- **Raw scrape responses** are kept as Actions artifacts for 14 days, for debugging and re-processing.

Data-engineering practices:

- **Append-only facts** with a `latest` serving view, so history is never overwritten.
- **Every row carries lineage:** `source`, `run_id`, and `posted_at` vs `scraped_at`.
- **Quality gates before deploy:** price between $1.50 and $10; regular ≤ midgrade ≤ premium; at least 70% of the previous run's stations seen again; at least 99% of stations have coordinates. If a gate fails, the deploy is skipped, the last good data stays live, and an issue is opened.
- **Idempotent runs:** each run is keyed by `run_id`. Re-running a run replaces only its own rows.
- **Freshness** (`built_at`, newest and median price age) is in `manifest.json` and shown in the app footer and on a `/status` view.

---

## 6. Cost control and politeness

- **No paid APIs:** GitHub Pages, Actions (public repo), Mapbox free tier, EIA and OSM are all free.
- **Bounded scraping:** fixed region grid, fixed cadence, rate-limited, stops early on block signals. There is no scraping triggered by users, so app traffic never increases load on GasBuddy.
- **Mapbox:** one directions call per new route, cached in the browser for 15 min. Re-ranking while driving uses the already-fetched shards and makes no new calls.
- **Shards** are immutable per data version, so browsers and the Pages CDN cache them.

---

## 7. Quality, testing, ops

- **Unit tests:** `core` with Vitest, using golden fixture routes such as I-95 NYC→DC, a rural stretch with real gaps, and a TopTier-only case.
- **Property tests:** with fast-check, using the safety invariants from section 2.
- **Scraper contract tests:** a saved GasBuddy response fixture is parsed into `PriceObservation` in pytest. A weekly live smoke test checks that the real response still matches the schema.
- **Pipeline tests:** DuckDB on a small OSM + GasBuddy sample, covering matching, brand normalization and quality gates.
- **E2E:** Playwright against the built site with fixture shards and a simulated GPS track.
- **CI:** GitHub Actions on every PR: ruff + pytest, ESLint + typecheck + Vitest, build, and Playwright.
- **Alerting:** a failed scrape, a quality gate or the smoke test opens or updates a GitHub issue. Errors in the app are reported to Sentry (free tier).
- **Privacy:** there's no backend, so location never leaves the browser except in the Mapbox directions request.

---

## 8. Milestones

| Phase | Deliverable |
|---|---|
| **M0 (1 wk)** | Repo scaffold, CI, Pages deploy of a placeholder app from `main`. **Spike: GasBuddy scrape from GitHub Actions** (go/no-go on the endpoint and blocking). OSM station ingest for the region, TopTier brand mapping. |
| **M1 (2 wk)** | Full pipeline: scrape → match → quality gates → shards → Pages deploy on a 3-hour cron. Map with route and corridor stations, with prices. |
| **M2 (1–2 wk)** | `core` algorithm: reachability, gap warnings, savings recommendation card. EIA estimates for stations without prices. |
| **M3 (1 wk)** | Drive mode (GPS refresh, client re-rank, wake lock), PWA install, hand-off to Maps |
| **M4** | Brand-offset model from price history, `/status` freshness page, wider region. Revisit hosting (Vercel/Cloudflare) if crowd reports or accounts are wanted. |

**Reuse:** RainMan already has route sampling along a polyline, client caching, the PWA shell, and shareable `?from=&to=` URLs. BenriSpace's contract-first setup and DuckDB/Parquet patterns carry over.
