"""Brand normalization: OSM tags -> Wikidata brand IDs, with TopTier flagging."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Mapping

import requests
import yaml

logger = logging.getLogger(__name__)

NSI_URL = "https://cdn.jsdelivr.net/npm/name-suggestion-index@6.0/dist/nsi.min.json"
NSI_FUEL_KEY = "brands/amenity/fuel"
NSI_TIMEOUT_S = 60
QID_PATTERN = re.compile(r"^Q\d+$")
_NON_ALNUM = re.compile(r"[^a-z0-9]")


@dataclass(frozen=True)
class Brand:
    wikidata_id: str
    name: str
    is_toptier: bool


NameIndex = Mapping[str, "tuple[str, str]"]


def normalize_name(value: str) -> str:
    """Lowercase and strip everything except a-z and 0-9."""
    return _NON_ALNUM.sub("", value.lower())


@dataclass(frozen=True)
class TopTierList:
    brands: dict[str, str]  # wikidata qid -> brand name
    verified_at: date


def load_toptier(path: Path) -> TopTierList:
    """Load the TopTier yaml: brands plus the date the list was last verified."""
    data = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    entries = data.get("brands") or []
    if not entries:
        raise ValueError(f"No TopTier brands found in {path}")
    raw_verified = data.get("verified_at")
    if raw_verified is None:
        raise ValueError(f"Missing verified_at in {path}")
    try:
        verified_at = (
            raw_verified
            if isinstance(raw_verified, date)
            else date.fromisoformat(str(raw_verified))
        )
    except ValueError as exc:
        raise ValueError(f"Invalid verified_at {raw_verified!r} in {path}") from exc
    return TopTierList(
        brands={str(e["wikidata"]): str(e["name"]) for e in entries},
        verified_at=verified_at,
    )


def fetch_nsi_fuel_items(cache_path: Path | None = None) -> list[dict[str, Any]]:
    """Fetch NSI fuel-brand items, optionally reading/writing an on-disk cache."""
    if cache_path is not None and Path(cache_path).exists():
        logger.info("Using cached NSI at %s", cache_path)
        return load_nsi_fuel_items(Path(cache_path))
    response = requests.get(NSI_URL, timeout=NSI_TIMEOUT_S)
    response.raise_for_status()
    data = response.json()
    if cache_path is not None:
        Path(cache_path).write_text(json.dumps(data), encoding="utf-8")
    return _extract_fuel_items(data)


def load_nsi_fuel_items(path: Path) -> list[dict[str, Any]]:
    """Read fuel items from a local NSI json file."""
    return _extract_fuel_items(json.loads(Path(path).read_text(encoding="utf-8")))


def _extract_fuel_items(data: Mapping[str, Any]) -> list[dict[str, Any]]:
    try:
        return list(data["nsi"][NSI_FUEL_KEY]["items"])
    except KeyError as exc:
        raise ValueError(f"NSI data has no '{NSI_FUEL_KEY}' items (missing {exc})") from exc


def is_us_item(item: Mapping[str, Any]) -> bool:
    """True if the NSI item's locationSet covers the US and doesn't exclude it."""
    location = item.get("locationSet") or {}
    include = [x.lower() for x in location.get("include", []) if isinstance(x, str)]
    exclude = [x.lower() for x in location.get("exclude", []) if isinstance(x, str)]
    if "us" in exclude:
        return False
    return any(x in ("001", "us") or x.startswith("us-") for x in include)


def build_name_index(items: list[Mapping[str, Any]]) -> dict[str, tuple[str, str]]:
    """Map normalized alias -> (qid, brand name) for US-applicable NSI items."""
    index: dict[str, tuple[str, str]] = {}
    for item in items:
        tags = item.get("tags") or {}
        qid = tags.get("brand:wikidata")
        if not qid or not is_us_item(item):
            continue
        brand_name = tags.get("brand") or tags.get("name") or item.get("displayName") or qid
        aliases = [tags.get("brand"), tags.get("name"), *item.get("matchNames", [])]
        for alias in aliases:
            key = normalize_name(alias) if alias else ""
            if key:
                index.setdefault(key, (qid, brand_name))
    return index


def resolve_brand(
    tags: Mapping[str, str], name_index: NameIndex, toptier: Mapping[str, str]
) -> Brand | None:
    """Resolve OSM tags to a Brand: brand:wikidata first, then brand/name text match."""
    qid = tags.get("brand:wikidata", "").strip()
    fallback_name = tags.get("brand") or tags.get("name")
    if QID_PATTERN.match(qid):
        name = fallback_name or qid
        for key in (tags.get("brand"), tags.get("name")):
            hit = name_index.get(normalize_name(key)) if key else None
            if hit and hit[0] == qid:
                name = hit[1]
                break
    else:
        hit = None
        for key in (tags.get("brand"), tags.get("name")):
            hit = name_index.get(normalize_name(key)) if key else None
            if hit:
                break
        if hit is None:
            return None
        qid, name = hit
    if qid in toptier:
        return Brand(qid, toptier[qid], True)
    return Brand(qid, name, False)
