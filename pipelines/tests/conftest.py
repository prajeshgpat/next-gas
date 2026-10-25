import json
from pathlib import Path

import pytest

from nextgas_pipelines import brands

FIXTURES = Path(__file__).parent / "fixtures"
REPO_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES


@pytest.fixture
def elements() -> list[dict]:
    return json.loads((FIXTURES / "overpass_sample.json").read_text())["elements"]


@pytest.fixture
def nsi_items() -> list[dict]:
    return brands.load_nsi_fuel_items(FIXTURES / "nsi_sample.json")


@pytest.fixture
def name_index(nsi_items):
    return brands.build_name_index(nsi_items)


@pytest.fixture
def toptier() -> dict[str, str]:
    return brands.load_toptier(REPO_ROOT / "data" / "toptier_brands.yaml").brands
