from nextgas_pipelines.osm import parse_elements


def _by_id(rows):
    return {r.osm_id: r for r in rows}


def test_parse_elements_builds_osm_id_and_uses_center_for_ways(elements, name_index, toptier):
    rows, missing = parse_elements(elements, name_index, toptier)
    by_id = _by_id(rows)
    assert missing == 0
    assert len(rows) == len(elements)
    assert by_id["way/2002"].lat == 41.8781 and by_id["way/2002"].lon == -87.6298


def test_parse_elements_counts_missing_geometry(name_index, toptier):
    elements = [
        {"type": "node", "id": 1, "lat": 1.0, "lon": 2.0, "tags": {}},
        {"type": "relation", "id": 2, "tags": {"amenity": "fuel"}},
    ]
    rows, missing = parse_elements(elements, name_index, toptier)
    assert [r.osm_id for r in rows] == ["node/1"]
    assert missing == 1


def test_parse_elements_formats_address_and_amenities(elements, name_index, toptier):
    shell = _by_id(parse_elements(elements, name_index, toptier)[0])["node/1001"]
    assert shell.address == "100 Market St, San Francisco, CA"
    assert shell.amenities == {"opening_hours": "24/7", "fuel:diesel": "yes", "car_wash": "yes"}


def test_parse_elements_falls_back_to_brand_tag_for_name(elements, name_index, toptier):
    sunoco = _by_id(parse_elements(elements, name_index, toptier)[0])["way/6006"]
    assert sunoco.name == "Sunoco"
    assert sunoco.address is None


def test_parse_elements_flags_toptier_and_unbranded(elements, name_index, toptier):
    by_id = _by_id(parse_elements(elements, name_index, toptier)[0])
    assert by_id["node/1001"].brand.is_toptier is True
    assert by_id["way/2002"].brand.wikidata_id == "Q319642"
    assert by_id["node/4004"].brand.is_toptier is False
    assert by_id["node/3003"].brand is None
