"""Idempotent Postgres upserts (psycopg 3)."""
from __future__ import annotations

from datetime import date
from typing import Iterable, Mapping

import psycopg
from psycopg.types.json import Jsonb

from .brands import Brand
from .osm import StationRow

UPSERT_BRAND_SQL = """
insert into brands (wikidata_id, name, is_toptier, toptier_verified_at)
values (%s, %s, %s, %s)
on conflict (wikidata_id) do update
  set name = excluded.name,
      is_toptier = excluded.is_toptier,
      toptier_verified_at = excluded.toptier_verified_at
returning id
"""

UPSERT_STATION_SQL = """
insert into stations (osm_id, name, brand_id, geog, address, amenities)
values (%s, %s, %s, st_setsrid(st_makepoint(%s, %s), 4326)::geography, %s, %s)
on conflict (osm_id) do update
  set name = excluded.name,
      brand_id = excluded.brand_id,
      geog = excluded.geog,
      address = excluded.address,
      amenities = excluded.amenities,
      last_seen = now()
"""


def station_count(conn: psycopg.Connection) -> int:
    row = conn.execute("select count(*) from stations").fetchone()
    return int(row[0]) if row else 0


def upsert_brands(
    conn: psycopg.Connection, rows: Iterable[Brand], verified_at: date
) -> dict[str, int]:
    """Upsert brands; returns {wikidata_id: brands.id}."""
    ids: dict[str, int] = {}
    for brand in rows:
        verified = verified_at if brand.is_toptier else None
        row = conn.execute(
            UPSERT_BRAND_SQL, (brand.wikidata_id, brand.name, brand.is_toptier, verified)
        ).fetchone()
        ids[brand.wikidata_id] = int(row[0])
    return ids


def upsert_stations(
    conn: psycopg.Connection, rows: Iterable[StationRow], brand_ids: Mapping[str, int]
) -> None:
    params = [
        (
            r.osm_id,
            r.name,
            brand_ids.get(r.brand.wikidata_id) if r.brand else None,
            r.lon,
            r.lat,
            r.address,
            Jsonb(dict(r.amenities)),
        )
        for r in rows
    ]
    with conn.cursor() as cur:
        cur.executemany(UPSERT_STATION_SQL, params)
