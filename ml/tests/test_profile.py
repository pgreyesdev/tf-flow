import json
import re
from pathlib import Path

import pandas as pd
import pytest

from tf_flow_ml.reports import profile


def _part(dates: list[str], lane: int, description: str, with_ranges: bool) -> pd.DataFrame:
    n = len(dates)
    df = pd.DataFrame(
        {
            "estacion_id": [11] * n,
            "estacion_nombre": ["AÑAZA"] * n,
            "carril_id": [lane] * n,
            "carril_descripcion": [description] * n,
            "fecha": dates,
            "ligeros": [9] * n,
            "pesados": [1] * n,
        }
    )
    if with_ranges:
        for i in range(1, 7):
            df[f"rango{i}_vehiculos"] = [10 if i == (1 if "Lento" in description else 6) else 0] * n
    return df


@pytest.fixture
def snapshot(tmp_path: Path) -> Path:
    old = _part(["2019-01-07 08:00", "2019-01-07 09:00"], 1, "Carril Lento", with_ranges=False)
    new = _part(["2026-01-05 08:00", "2026-01-10 08:00"], -1, "Carril Rápido", with_ranges=True)
    slow = _part(["2026-01-05 08:00"], 1, "Carril Lento", with_ranges=True)
    parts = []
    for name, df in {"a": old, "b": new, "c": slow}.items():
        df.to_parquet(tmp_path / f"{name}.parquet", index=False)
        parts.append({"name": name, "columns": list(df.columns), "rows": len(df)})
    manifest = {"file_format": "TXT", "downloaded_at": "2026-10-25T00:00:00+00:00", "parts": parts}
    (tmp_path / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return tmp_path


def test_report_flags_schema_changes(snapshot: Path) -> None:
    report = profile.build_report(snapshot)

    assert "3 ficheros, 2 esquemas distintos" in report


def test_report_covers_each_year(snapshot: Path) -> None:
    report = profile.build_report(snapshot)

    assert re.search(r"\|\s+2019\s+\|\s+2\s+\|", report)
    assert re.search(r"\|\s+2026\s+\|\s+3\s+\|", report)


def test_speed_ranges_are_split_by_lane_type(snapshot: Path) -> None:
    report = profile.build_report(snapshot)

    assert "3 filas con rangos. Suma de rangos frente a ligeros + pesados: 1.0000" in report
    assert re.search(r"\| carril lento\s+\|\s+100\s", report)
    assert re.search(r"\| carril rápido\s+\|\s+0\s", report)


def test_speed_section_without_ranges() -> None:
    df = _part(["2019-01-07 08:00"], 1, "Carril Lento", with_ranges=False)

    assert "Ningún fichero" in profile.speed_section(df)


def test_cli_writes_markdown(
    snapshot: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    out = tmp_path / "informe.md"

    profile.main([str(snapshot), "--out", str(out)])
    profile.main([str(snapshot)])

    assert out.read_text(encoding="utf-8").startswith("# Informe de datos")
    assert "## Estaciones" in capsys.readouterr().out
