"""Informe de calidad de una instantánea de aforos, en Markdown.

Responde a lo que hay que saber antes de modelar: si el esquema cambia entre años, cuánto histórico
tiene cada estación, cuántas horas faltan y cómo se reparten los vehículos por rango de velocidad.

Uso: ``uv run python -m tf_flow_ml.reports.profile data/raw/traffic/AAAAMMDD``
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow.parquet as pq

from tf_flow_ml.ingestion.snapshot import MANIFEST_NAME
from tf_flow_ml.processing.aggregation import RANGE_COLUMNS

BASE_COLUMNS = [
    "fecha",
    "estacion_id",
    "estacion_nombre",
    "carril_id",
    "carril_descripcion",
    "ligeros",
    "pesados",
]


def schema_section(manifest: dict[str, Any]) -> str:
    parts: list[dict[str, Any]] = manifest["parts"]
    signatures = Counter(tuple(p["columns"]) for p in parts)
    lines = ["## Esquema", "", f"{len(parts)} ficheros, {len(signatures)} esquemas distintos.", ""]
    for columns, count in signatures.most_common():
        files = [p["name"] for p in parts if tuple(p["columns"]) == columns]
        lines.append(f"- **{count} ficheros** ({files[0]} … {files[-1]}): `{', '.join(columns)}`")
    return "\n".join(lines)


def load_profile_frame(snapshot_dir: Path) -> pd.DataFrame:
    """Une los ficheros con las columnas comunes; las que falten en un fichero quedan vacías."""
    wanted = [*BASE_COLUMNS, *RANGE_COLUMNS]
    frames = []
    for file in sorted(snapshot_dir.glob("*.parquet")):
        available = pq.read_schema(file).names
        frames.append(pd.read_parquet(file, columns=[c for c in wanted if c in available]))
    df = pd.concat(frames, ignore_index=True)
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
    return df


def coverage_section(df: pd.DataFrame) -> str:
    df = df.dropna(subset=["fecha"])
    df = df.assign(year=df["fecha"].dt.year)
    hours = df.groupby("year")["fecha"].agg(lambda s: s.dt.floor("h").nunique())
    yearly = df.groupby("year").agg(
        filas=("fecha", "size"),
        estaciones=("estacion_id", "nunique"),
        desde=("fecha", "min"),
        hasta=("fecha", "max"),
    )
    yearly["horas_con_datos"] = hours
    per_station_hours = df.groupby(["year", "estacion_id"])["fecha"].nunique()
    expected = yearly["horas_con_datos"].reindex(per_station_hours.index.get_level_values(0))
    completeness = (per_station_hours / expected.to_numpy()).groupby(level=0).median()
    yearly["completitud_mediana_%"] = (completeness * 100).round(1)
    return "## Cobertura por año\n\n" + yearly.to_markdown()


def station_section(df: pd.DataFrame) -> str:
    stations = (
        df.dropna(subset=["fecha"])
        .groupby(["estacion_id", "estacion_nombre"])
        .agg(
            desde=("fecha", "min"),
            hasta=("fecha", "max"),
            horas=("fecha", "nunique"),
            carriles=("carril_id", "nunique"),
        )
        .sort_values("horas", ascending=False)
    )
    return "## Estaciones\n\n" + stations.to_markdown()


def speed_section(df: pd.DataFrame) -> str:
    present = [c for c in RANGE_COLUMNS if c in df.columns]
    if not present:
        return "## Rangos de velocidad\n\nNingún fichero trae rangos de velocidad."
    df = df[df[present].notna().all(axis=1)]
    totals = df[present].sum()
    vehicles = (df["ligeros"].fillna(0) + df["pesados"].fillna(0)).sum()
    lines = [
        "## Rangos de velocidad",
        "",
        f"{len(df):,} filas con rangos. Suma de rangos frente a ligeros + pesados: "
        f"{totals.sum() / vehicles:.4f} (1 = cuadran exactamente).",
        "",
    ]
    lane = df["carril_descripcion"].fillna("").str.lower()
    groups = {
        "todos": pd.Series(True, index=df.index),
        "carril lento": lane.str.contains("lento"),
        "carril rápido": lane.str.contains("rápido|rapido"),
        "accesos": lane.str.contains("acceso"),
    }
    shares = {
        name: (df.loc[mask, present].sum() / df.loc[mask, present].sum().sum() * 100)
        for name, mask in groups.items()
        if mask.any()
    }
    table = pd.DataFrame(shares).T.round(1)
    table.columns = [c.replace("_vehiculos", "") for c in table.columns]
    lines.append("Reparto en % de los vehículos por rango:\n\n" + table.to_markdown())
    return "\n".join(lines)


def hourly_section(df: pd.DataFrame) -> str:
    df = df.dropna(subset=["fecha"])
    vehicles = df["ligeros"].fillna(0) + df["pesados"].fillna(0)
    weekday = df["fecha"].dt.day_of_week < 5  # noqa: PLR2004
    profile = (
        pd.DataFrame(
            {
                "hora": df["fecha"].dt.hour,
                "laborable": weekday,
                "v": vehicles,
                "dia": df["fecha"].dt.date,
            }
        )
        .groupby(["laborable", "hora", "dia"])["v"]
        .sum()
        .groupby(level=[0, 1])
        .mean()
        .unstack(0)
        .rename(columns={True: "laborable", False: "fin de semana"})
        .round(0)
    )
    return "## Vehículos por hora (media diaria de toda la red)\n\n" + profile.to_markdown()


def build_report(snapshot_dir: Path) -> str:
    manifest = json.loads((snapshot_dir / MANIFEST_NAME).read_text(encoding="utf-8"))
    df = load_profile_frame(snapshot_dir)
    sections = [
        f"# Informe de datos · {snapshot_dir.name}",
        f"{len(df):,} filas descargadas el {manifest['downloaded_at']}.",
        schema_section(manifest),
        coverage_section(df),
        speed_section(df),
        hourly_section(df),
        station_section(df),
    ]
    return "\n\n".join(sections) + "\n"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("--out", type=Path, help="fichero Markdown; por defecto, la consola")
    args = parser.parse_args(argv)
    report = build_report(args.snapshot_dir)
    if args.out:
        args.out.write_text(report, encoding="utf-8")
    else:
        sys.stdout.write(report)


if __name__ == "__main__":
    main()
