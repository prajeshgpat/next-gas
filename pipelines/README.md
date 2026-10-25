# NextGas pipelines

Weekly job that loads every US fuel station from OpenStreetMap into Postgres/PostGIS.

1. One bulk Overpass query (`amenity=fuel`, US) -- never per user request.
2. Brands normalized to Wikidata IDs (`brand:wikidata` tag, else name match against the
   name-suggestion-index) and flagged TopTier from `data/toptier_brands.yaml`.
3. Quality gates: >=99% of elements have geometry; station count within 5% of the previous load
   (skipped on first load).
4. Idempotent upsert of `brands` and `stations` in a single transaction.

## Run

```sh
python3.10 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'

# Parse + geometry gate only, no DB
python -m nextgas_pipelines.ingest_osm --dry-run

# Real load (apply db/migrations first)
DATABASE_URL=postgresql://user:pass@host/db python -m nextgas_pipelines.ingest_osm

# Offline (no Overpass / NSI download), e.g. CI
python -m nextgas_pipelines.ingest_osm --elements-file tests/fixtures/overpass_sample.json \
  --nsi-file tests/fixtures/nsi_sample.json
```

Options: `--toptier PATH`, `--elements-file PATH`, `--nsi-file PATH`, `--nsi-cache PATH`, `--dry-run`.

Exit codes: 0 ok, 1 quality gate failed, 2 missing `DATABASE_URL`.

## Env vars

- `DATABASE_URL` -- Postgres connection string (required unless `--dry-run`).

## Tests

```sh
pytest                # offline
pytest -m network     # also checks TopTier QIDs against live NSI
```
