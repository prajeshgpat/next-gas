from datetime import date

import pytest

from nextgas_pipelines.brands import (
    Brand,
    build_name_index,
    load_toptier,
    normalize_name,
    resolve_brand,
)


@pytest.mark.parametrize("raw", ["SHELL", "Shell ", "s-h.e l_l"])
def test_normalize_name_collapses_case_and_punctuation(raw):
    assert normalize_name(raw) == "shell"


def test_load_toptier_raises_when_empty(tmp_path):
    path = tmp_path / "t.yaml"
    path.write_text("verified_at: 2026-10-23\nbrands: []\n")
    with pytest.raises(ValueError):
        load_toptier(path)


def test_load_toptier_raises_when_verified_at_missing(tmp_path):
    path = tmp_path / "t.yaml"
    path.write_text("brands:\n  - { name: Shell, wikidata: Q110716465 }\n")
    with pytest.raises(ValueError, match="verified_at"):
        load_toptier(path)


def test_load_toptier_returns_brands_and_verified_date(tmp_path):
    path = tmp_path / "t.yaml"
    path.write_text(
        "verified_at: 2026-10-23\nbrands:\n  - { name: Shell, wikidata: Q110716465 }\n"
    )
    result = load_toptier(path)
    assert result.brands == {"Q110716465": "Shell"}
    assert result.verified_at == date(2026, 10, 23)


def test_toptier_fixture_maps_qid_to_name(toptier):
    assert toptier["Q110716465"] == "Shell"


def test_build_name_index_includes_us_and_global_items(name_index):
    assert name_index["shell"] == ("Q110716465", "Shell")
    assert name_index["shelloil"][0] == "Q110716465"  # matchNames alias
    assert name_index["kwiktrip"][0] == "Q6450420"  # us-* subdivision


def test_build_name_index_ignores_non_us_and_us_excluded_items(name_index):
    assert "petrocanada" not in name_index
    assert "circlek" not in name_index


def test_resolve_brand_prefers_wikidata_tag_over_name(name_index, toptier):
    tags = {"brand:wikidata": "Q110716465", "brand": "Chevron"}
    brand = resolve_brand(tags, name_index, toptier)
    assert brand == Brand("Q110716465", "Shell", True)


def test_resolve_brand_falls_back_to_brand_then_name_text(name_index, toptier):
    by_brand = resolve_brand({"brand": "CHEVRON"}, name_index, toptier)
    by_name = resolve_brand({"name": "Kwik Trip"}, name_index, toptier)
    assert by_brand == Brand("Q319642", "Chevron", True)
    assert by_name == Brand("Q6450420", "Kwik Trip", False)


def test_resolve_brand_returns_none_for_unbranded(name_index, toptier):
    assert resolve_brand({"name": "Joe's Gas & Go"}, name_index, toptier) is None


def test_resolve_brand_ignores_malformed_wikidata_tag(name_index, toptier):
    brand = resolve_brand({"brand:wikidata": "bogus", "brand": "Shell"}, name_index, toptier)
    assert brand is not None and brand.wikidata_id == "Q110716465"
