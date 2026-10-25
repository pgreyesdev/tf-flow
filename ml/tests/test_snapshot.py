import json
from pathlib import Path

import pytest
import respx

from tf_flow_ml.ingestion import __main__ as cli
from tf_flow_ml.ingestion.ckan import TENERIFE_CKAN_URL, TRAFFIC_PACKAGE_IDS, CkanClient
from tf_flow_ml.ingestion.snapshot import download_snapshot, load_snapshot

BASE = "https://ckan.test"


def _mock_portal(base: str) -> respx.Route:
    respx.get(f"{base}/api/3/action/package_show", params={"id": "y2025"}).respond(
        json={
            "success": True,
            "result": {
                "resources": [
                    {"id": "dic", "name": "dic", "format": "TXT", "url": f"{base}/2025-12.txt"},
                ]
            },
        }
    )
    respx.get(f"{base}/api/3/action/package_show").respond(
        json={
            "success": True,
            "result": {
                "resources": [
                    {"id": "ene", "name": "ene", "format": "TXT", "url": f"{base}/2026-01.txt"},
                    {"id": "est", "name": "est", "format": "CSV", "url": f"{base}/est.csv"},
                ]
            },
        }
    )
    respx.get(f"{base}/2025-12.txt").respond(text="fecha,estacion_id\n2025-12-31 23:00,11\n")
    respx.get(f"{base}/est.csv").respond(text="estacion_id,estacion_nombre\n11,AÑAZA\n")
    return respx.get(f"{base}/2026-01.txt").respond(
        text="fecha,estacion_id\n2026-01-01 00:00,11\n2026-01-01 01:00,12\n"
    )


@respx.mock
def test_snapshot_keeps_one_file_per_resource_across_packages(tmp_path: Path) -> None:
    _mock_portal(BASE)

    manifest = download_snapshot(CkanClient(BASE), ["y2025", "y2026"], "TXT", tmp_path)

    written = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest.rows == 3
    assert [p["file"] for p in written["parts"]] == ["dic.parquet", "ene.parquet"]
    assert written["parts"][1]["columns"] == ["fecha", "estacion_id"]
    assert load_snapshot(tmp_path)["estacion_id"].tolist() == [11, 11, 12]
    assert load_snapshot(tmp_path, columns=["fecha"]).columns.tolist() == ["fecha"]


@respx.mock
def test_snapshot_resumes_without_downloading_again(tmp_path: Path) -> None:
    january = _mock_portal(BASE)
    download_snapshot(CkanClient(BASE), ["y2026"], "TXT", tmp_path)

    manifest = download_snapshot(CkanClient(BASE), ["y2026"], "TXT", tmp_path)

    assert january.call_count == 1
    assert manifest.rows == 2


def test_load_snapshot_fails_on_empty_directory(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        load_snapshot(tmp_path)


@respx.mock
def test_cli_downloads_stations(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    _mock_portal(TENERIFE_CKAN_URL)

    cli.main(["stations", "--out", str(tmp_path)])

    assert len(list((tmp_path / "stations").glob("*/est.parquet"))) == 1
    assert "1 ficheros, 1 filas" in capsys.readouterr().out


@respx.mock
def test_cli_downloads_the_requested_traffic_years(tmp_path: Path) -> None:
    _mock_portal(TENERIFE_CKAN_URL)

    cli.main(["traffic", "--years", "2025-2026", "--out", str(tmp_path)])

    calls = [
        c.request.url.params["id"] for c in respx.calls if "package_show" in str(c.request.url)
    ]
    assert calls == [TRAFFIC_PACKAGE_IDS[2025], TRAFFIC_PACKAGE_IDS[2026]]


def test_parse_years() -> None:
    assert cli.parse_years("2024") == [2024]
    assert cli.parse_years("2019-2021") == [2019, 2020, 2021]
    with pytest.raises(Exception, match="2018"):
        cli.parse_years("2018-2019")
