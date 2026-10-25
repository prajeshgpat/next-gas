import re
from pathlib import Path

import pytest
import yaml

from nextgas_pipelines.brands import build_name_index, fetch_nsi_fuel_items

YAML_PATH = Path(__file__).resolve().parents[2] / "data" / "toptier_brands.yaml"


def _entries():
    return yaml.safe_load(YAML_PATH.read_text())["brands"]


def test_every_entry_has_well_formed_qid():
    assert all(re.fullmatch(r"Q\d+", str(e["wikidata"])) for e in _entries())


def test_qids_are_unique():
    qids = [e["wikidata"] for e in _entries()]
    assert len(qids) == len(set(qids))


def test_names_are_unique():
    names = [e["name"] for e in _entries()]
    assert len(names) == len(set(names))


@pytest.mark.network
def test_every_toptier_qid_exists_among_us_nsi_fuel_brands():
    index = build_name_index(fetch_nsi_fuel_items())
    nsi_qids = {qid for qid, _ in index.values()}
    missing = {e["name"]: e["wikidata"] for e in _entries() if e["wikidata"] not in nsi_qids}
    assert not missing
