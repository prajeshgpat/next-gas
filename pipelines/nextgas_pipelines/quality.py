"""Quality gates run before anything is written to the database."""
from __future__ import annotations

MIN_GEOMETRY_RATIO = 0.99
MAX_ROW_DRIFT_RATIO = 0.05


class QualityGateError(Exception):
    """Raised when ingested data fails a quality gate."""


def check_geometry(kept: int, missing: int) -> None:
    total = kept + missing
    if total <= 0:
        raise QualityGateError("No stations returned from source")
    ratio = kept / total
    if ratio < MIN_GEOMETRY_RATIO:
        raise QualityGateError(
            f"Only {ratio:.2%} of stations have geometry (need >= {MIN_GEOMETRY_RATIO:.0%}); "
            f"{missing} of {total} missing"
        )


def check_row_drift(new: int, previous: int) -> None:
    if previous == 0:
        return
    drift = abs(new - previous) / previous
    if drift > MAX_ROW_DRIFT_RATIO:
        raise QualityGateError(
            f"Station count changed {drift:.1%} ({previous} -> {new}); max {MAX_ROW_DRIFT_RATIO:.0%}"
        )
