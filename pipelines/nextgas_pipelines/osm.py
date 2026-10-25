"""Overpass fetch and OSM element parsing."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Mapping

import requests

from .brands import Brand, NameIndex, resolve_brand

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT_S = 900
HTTP_TIMEOUT_S = OVERPASS_TIMEOUT_S + 60
USER_AGENT = "NextGas/0.1 (personal project)"
OVERPASS_QUERY = (
    f"[out:json][timeout:{OVERPASS_TIMEOUT_S}];"
    'area["ISO3166-1"="US"][admin_level=2]->.us;'
    'nwr["amenity"="fuel"](area.us);'
    "out center tags;"
)
AMENITY_TAGS = (
    "opening_hours",
    "fuel:diesel",
    "fuel:e85",
    "car_wash",
    "shop",
    "compressed_air",
)


@dataclass(frozen=True)
class StationRow:
    osm_id: str
    name: str | None
    lon: float
    lat: float
    address: str | None
    amenities: Mapping[str, str] = field(default_factory=dict)
    brand: Brand | None = None


def fetch_elements() -> list[dict[str, Any]]:
    """One bulk Overpass call for all US fuel stations."""
    response = requests.post(
        OVERPASS_URL,
        data=OVERPASS_QUERY,
        headers={"User-Agent": USER_AGENT},
        timeout=HTTP_TIMEOUT_S,
    )
    response.raise_for_status()
    return list(response.json()["elements"])


def _coords(element: Mapping[str, Any]) -> tuple[float, float] | None:
    source = element if "lon" in element and "lat" in element else element.get("center") or {}
    if "lon" in source and "lat" in source:
        return float(source["lon"]), float(source["lat"])
    return None


def _address(tags: Mapping[str, str]) -> str | None:
    street = " ".join(p for p in (tags.get("addr:housenumber"), tags.get("addr:street")) if p)
    parts = [p for p in (street, tags.get("addr:city"), tags.get("addr:state")) if p]
    return ", ".join(parts) or None


def parse_elements(
    elements: list[Mapping[str, Any]], name_index: NameIndex, toptier: Mapping[str, str]
) -> tuple[list[StationRow], int]:
    """Convert Overpass elements to rows; returns (rows, missing_geometry_count)."""
    rows: list[StationRow] = []
    missing = 0
    for element in elements:
        coords = _coords(element)
        if coords is None:
            missing += 1
            continue
        tags = element.get("tags") or {}
        rows.append(
            StationRow(
                osm_id=f"{element['type']}/{element['id']}",
                name=tags.get("name") or tags.get("brand"),
                lon=coords[0],
                lat=coords[1],
                address=_address(tags),
                amenities={k: tags[k] for k in AMENITY_TAGS if k in tags},
                brand=resolve_brand(tags, name_index, toptier),
            )
        )
    return rows, missing
