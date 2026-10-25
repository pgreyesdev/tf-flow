import json
from pathlib import Path

import pandas as pd
import pytest
import respx

from tf_flow_ml.ingestion import __main__ as cli
from tf_flow_ml.ingestion.ckan import TENERIFE_CKAN_URL, CkanClient
from tf_flow_ml.ingestion.snapshot import download_snapshot

BASE = "https://ckan.test"


def _mock_portal(base: str) -> None:
    respx.get(f"{base}/api/3/action/package_show").respond(
        json={
            "success": True,
            "result": {
                "resources": [
                    {"id": "a", "name": "2025", "format": "TXT", "url": f"{base}/2025.txt"},
                    {"id": "s", "name": "est", "format": "CSV", "url": f"{base}/est.csv"},
                ]
            },
        }
    )
    respx.get(f"{base}/2025.txt").respond(text="fecha,estacion_id\n2025-01-01 08:00,11\n")
    respx.get(f"{base}/est.csv").respond(text="estacion_id,estacion_nombre\n11,AÑAZA\n")


@respx.mock
def test_snapshot_writes_parquet_and_manifest(tmp_path: Path) -> None:
    _mock_portal(BASE)

    manifest = download_snapshot(CkanClient(BASE), "traffic", "TXT", tmp_path / "snap")

    saved = pd.read_parquet(tmp_path / "snap" / "data.parquet")
    written = json.loads((tmp_path / "snap" / "manifest.json").read_text(encoding="utf-8"))
    assert saved["estacion_id"].tolist() == [11]
    assert written["rows"] == manifest.rows == 1
    assert written["columns"] == ["fecha", "estacion_id"]
    assert written["resources"] == [f"{BASE}/2025.txt"]


@respx.mock
def test_cli_downloads_the_requested_dataset(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _mock_portal(TENERIFE_CKAN_URL)

    cli.main(["stations", "--out", str(tmp_path)])

    snapshots = list((tmp_path / "stations").glob("*/data.parquet"))
    assert len(snapshots) == 1
    assert "1 filas" in capsys.readouterr().out
