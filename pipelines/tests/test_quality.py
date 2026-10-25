import pytest

from nextgas_pipelines.quality import QualityGateError, check_geometry, check_row_drift


def test_check_geometry_passes_at_exactly_99_percent():
    check_geometry(99, 1)


def test_check_geometry_fails_below_99_percent():
    with pytest.raises(QualityGateError):
        check_geometry(98, 2)


def test_check_geometry_fails_when_no_stations():
    with pytest.raises(QualityGateError):
        check_geometry(0, 0)


def test_check_row_drift_passes_at_exactly_5_percent():
    check_row_drift(105, 100)
    check_row_drift(95, 100)


@pytest.mark.parametrize("new", [106, 94])
def test_check_row_drift_fails_beyond_5_percent(new):
    with pytest.raises(QualityGateError):
        check_row_drift(new, 100)


def test_check_row_drift_skipped_on_first_load():
    check_row_drift(50_000, 0)
