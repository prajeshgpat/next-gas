# NextGas plan

NextGas answers one question while you drive: **"Should I fill up now, or is there a cheaper station I can safely reach?"**
It's a personal, non-commercial side project.

## Decisions (2026-10-23)

- **Repo:** standalone `next-gas` monorepo (pnpm + Turborepo). Requires Node ≥ 22.12 (`.nvmrc`).
- **Live prices:** GasBuddy, through a `PriceProvider` adapter (M2). Google Places `fuelOptions` is the backup adapter. EIA regional average plus brand offset is always the last fallback, labelled "est.".
  - GasBuddy has no public API and sits behind bot protection, so the adapter has to be polite and fail soft. It fetches only the ~10 candidate stations per plan, caches each station for 2–4 h, keeps the request rate low, and falls back to estimates on any error. It must never block a plan.
- **TopTier list:** `data/toptier_brands.yaml`, checked against toptiergas.com on 2026-10-23. Kwik Trip is *not* licensed. Marathon, Valero, Citgo, Sunoco, ARCO, Cenex, Diamond Shamrock, Meijer and Rutter's are.
- **Station data:** one weekly bulk Overpass query (`nwr[amenity=fuel]` in the US, `out center`). We don't use the 10 GB Geofabrik PBF.

## Core algorithm: `packages/core` (done)

This is a pure TS function, `plan(input) → { recommendation, safeRangeMi, reachable, gaps }`.

- safe range = range − max(15 mi, 10%)
- reachable = stations ahead with aheadMi + detourMi ≤ safe range, after the TopTier filter
- detour = 2 × off-route distance × 1.3
- effective cost = price × fillGallons + price × detour / mpg + detourMin × value of time
- Suggest **wait** only when savings vs the nearest reachable station are over $1 and the price confidence is at least medium (fresher than 24 h and not an estimate).
- Gaps are stretches over 40 mi with no (filtered) station, each with a last-chance station. `mustFillBefore` is set when the far end of the gap is beyond the safe range.
- If no station is in the safe range, the result is `no_safe_station`, plus the nearest station within raw range.

## Milestones

| Phase | Deliverable |
|---|---|
| **M0** | Scaffold, CI, core algorithm + tests, OSM station ingest, TopTier mapping, PostGIS corridor query |
| **M1** | `/v1/plan` (Mapbox route → corridor → core), EIA estimated prices, map + station strip UI |
| **M2** | GasBuddy price adapter with cache and rate limit, Google fallback, savings card |
| **M3** | Drive mode (GPS refresh, client re-rank, wake lock), PWA, hand-off to Maps |
| **M4** | Crowd reports, brand-offset model, `/status` freshness page |

## Layout

```
apps/web            Next.js 15 app (M1+)
packages/core       planning algorithm (pure TS, Vitest + fast-check)
pipelines/          Python jobs: OSM ingest, EIA (M1), quality gates
db/migrations/      SQL (PostGIS); 0001 = schema + corridor_stations()
data/               toptier_brands.yaml
```
