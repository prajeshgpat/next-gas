"""Weekly OSM station ingest: python -m nextgas_pipelines.ingest_osm"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Sequence

import psycopg

from . import brands, load, osm, quality

logger = logging.getLogger("nextgas_pipelines.ingest_osm")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_TOPTIER = REPO_ROOT / "data" / "toptier_brands.yaml"


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Ingest US fuel stations from OSM into Postgres.")
    p.add_argument("--toptier", type=Path, default=DEFAULT_TOPTIER)
    p.add_argument("--elements-file", type=Path, help="Local Overpass JSON instead of fetching")
    p.add_argument("--nsi-file", type=Path, help="Local NSI JSON instead of downloading")
    p.add_argument("--nsi-cache", type=Path, help="On-disk cache for the downloaded NSI JSON")
    p.add_argument("--dry-run", action="store_true", help="Parse and gate only; no database")
    return p


def _load_elements(path: Path | None) -> list[dict]:
    if path is None:
        return osm.fetch_elements()
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data["elements"] if isinstance(data, dict) else data)


def run(args: argparse.Namespace) -> int:
    database_url = os.environ.get("DATABASE_URL")
    if not args.dry_run and not database_url:
        logger.error("DATABASE_URL is not set; export it or use --dry-run")
        return 2

    toptier_list = brands.load_toptier(args.toptier)
    toptier = toptier_list.brands
    items = (
        brands.load_nsi_fuel_items(args.nsi_file)
        if args.nsi_file
        else brands.fetch_nsi_fuel_items(args.nsi_cache)
    )
    name_index = brands.build_name_index(items)
    rows, missing = osm.parse_elements(_load_elements(args.elements_file), name_index, toptier)
    quality.check_geometry(len(rows), missing)

    branded = sum(1 for r in rows if r.brand)
    toptier_count = sum(1 for r in rows if r.brand and r.brand.is_toptier)
    summary = (
        f"stations={len(rows)} branded={branded} toptier={toptier_count} "
        f"missing_geometry={missing}"
    )

    if args.dry_run:
        print(f"dry-run: {summary}")
        return 0

    unique_brands = {r.brand.wikidata_id: r.brand for r in rows if r.brand}
    with psycopg.connect(database_url) as conn:  # one transaction; commits on clean exit
        quality.check_row_drift(len(rows), load.station_count(conn))
        brand_ids = load.upsert_brands(conn, unique_brands.values(), toptier_list.verified_at)
        load.upsert_stations(conn, rows, brand_ids)
    logger.info("Loaded: %s", summary)
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = build_parser().parse_args(argv)
    try:
        return run(args)
    except quality.QualityGateError as exc:
        logger.error("Quality gate failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
