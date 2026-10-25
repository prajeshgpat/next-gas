from nextgas_pipelines.ingest_osm import main


def _args(fixtures_dir, elements="overpass_sample.json"):
    return [
        "--dry-run",
        "--elements-file", str(fixtures_dir / elements),
        "--nsi-file", str(fixtures_dir / "nsi_sample.json"),
    ]


def test_dry_run_prints_summary_counts(fixtures_dir, capsys):
    code = main(_args(fixtures_dir))
    out = capsys.readouterr().out
    assert code == 0
    assert "stations=8" in out
    assert "branded=5" in out
    assert "toptier=4" in out


def test_dry_run_exits_nonzero_when_geometry_gate_fails(fixtures_dir):
    assert main(_args(fixtures_dir, "overpass_no_geometry.json")) == 1


def test_non_dry_run_without_database_url_fails_fast(fixtures_dir, monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    args = _args(fixtures_dir)[1:]
    assert main(args) == 2
