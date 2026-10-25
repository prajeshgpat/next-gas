# NextGas

NextGas is a personal gas-price route planner that answers one question while you drive: "Should I fill up now, or is there a cheaper station I can safely reach?" It takes your route and remaining range, finds stations along the corridor, filters to TopTier brands, and recommends filling now or waiting, flagging long stretches with no station. See [docs/m0-decisions.md](docs/m0-decisions.md) for decisions and milestones.

## Layout

```
apps/web            Next.js 15 app (placeholder until M1)
packages/core       planning algorithm (pure TS, Vitest + fast-check)
pipelines/          Python jobs: OSM ingest, quality gates
db/migrations/      PostGIS schema + corridor_stations()
data/               toptier_brands.yaml
```

## Prerequisites

- Node 22.12+ (see `.nvmrc`)
- pnpm via corepack: `corepack enable`
- Python 3.10+ (pipelines)
- Postgres with PostGIS (e.g. Supabase) for the database

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev              # web app

cd pipelines
pip install -e '.[dev]'
pytest
python -m nextgas_pipelines.ingest_osm --dry-run --elements-file tests/fixtures/overpass_sample.json \
  --nsi-file tests/fixtures/nsi_sample.json   # no DB needed
python -m nextgas_pipelines.ingest_osm --elements-file tests/fixtures/overpass_sample.json \
  --nsi-file tests/fixtures/nsi_sample.json   # needs DATABASE_URL
```

## Configuration

Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

## Data attribution

Station locations come from OpenStreetMap, (c) OpenStreetMap contributors, licensed under the [ODbL](https://www.openstreetmap.org/copyright). Attribution is required wherever the data is displayed.
