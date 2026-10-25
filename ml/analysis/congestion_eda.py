"""Análisis exploratorio para definir el índice de congestión a partir de los rangos de velocidad.

No forma parte del paquete: sirve para tomar la decisión que luego se documenta en un ADR y se
implementa con tests en ``tf_flow_ml``.

Uso: ``uv run python ml/analysis/congestion_eda.py data/raw/traffic/AAAAMMDD``
"""

import sys
from pathlib import Path

import pandas as pd

from tf_flow_ml.ingestion.snapshot import load_snapshot
from tf_flow_ml.processing.aggregation import RANGE_COLUMNS

RAMP_PATTERN = r"acceso|salida|enlace|incorpora|ramal|rotonda"
SLOW = list(RANGE_COLUMNS[:2])


def section(title: str, body: str) -> None:
    sys.stdout.write(f"\n## {title}\n\n{body}\n")


def main(snapshot_dir: Path) -> None:
    df = load_snapshot(snapshot_dir)
    df["fecha"] = pd.to_datetime(df["fecha"])
    df["vehicles"] = df["ligeros"] + df["pesados"]
    df["direction"] = df["carril_id"].clip(-1, 1)
    df["ramp"] = df["carril_descripcion"].str.lower().str.contains(RAMP_PATTERN, na=False)
    sys.stdout.write("# Análisis de congestión\n")

    lanes = (
        df.groupby(["estacion_id", "estacion_nombre", "carril_id", "carril_descripcion", "ramp"])
        .agg(
            veh_hora=("vehicles", "mean"),
            lentos_pct=("rango1_vehiculos", "sum"),
            total=("vehicles", "sum"),
        )
        .reset_index()
    )
    lanes["lentos_pct"] = (lanes["lentos_pct"] / lanes["total"] * 100).round(1)
    section(
        "Carriles (rango 1 en %)", lanes.drop(columns="total").round(1).to_markdown(index=False)
    )

    main_lanes = df[~df["ramp"]]
    hourly = main_lanes.groupby(["estacion_id", "direction", "fecha"])[
        ["vehicles", *RANGE_COLUMNS]
    ].sum()
    hourly = hourly[hourly["vehicles"] > 0]
    hourly["slow_share"] = hourly[SLOW].sum(axis=1) / hourly["vehicles"]
    hourly = hourly.reset_index()
    hourly["hour"] = hourly["fecha"].dt.hour
    hourly["weekday"] = hourly["fecha"].dt.day_of_week < 5

    by_hour = (
        hourly.groupby(["weekday", "hour"])["slow_share"]
        .quantile([0.5, 0.9, 0.99])
        .unstack()
        .mul(100)
        .round(1)
    )
    section(
        "Proporción de vehículos lentos (rangos 1-2) por hora, troncal, en %", by_hour.to_markdown()
    )

    hourly["vol_rel"] = hourly["vehicles"] / hourly.groupby(["estacion_id", "direction"])[
        "vehicles"
    ].transform(lambda s: s.quantile(0.99))
    hourly["vol_bin"] = pd.cut(
        hourly["vol_rel"], [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 10]
    )
    fundamental = hourly.groupby("vol_bin", observed=True)["slow_share"].describe(
        percentiles=[0.5, 0.9]
    )
    section(
        "Diagrama fundamental: lentos según volumen relativo al p99 de la estación",
        (fundamental[["count", "mean", "50%", "90%"]]).round(3).to_markdown(),
    )

    baseline = hourly.groupby(["estacion_id", "direction", "weekday", "hour"])["slow_share"]
    hourly["slow_p50"] = baseline.transform("median")
    hourly["slow_excess"] = hourly["slow_share"] - hourly["slow_p50"]
    per_station = hourly.groupby(["estacion_id", "direction"]).agg(
        horas=("slow_share", "size"),
        lentos_p50=("slow_share", "median"),
        lentos_p95=("slow_share", lambda s: s.quantile(0.95)),
        exceso_p99=("slow_excess", lambda s: s.quantile(0.99)),
    )
    section("Por estación y sentido", per_station.round(3).to_markdown())

    names = df.drop_duplicates("estacion_id").set_index("estacion_id")["estacion_nombre"]
    top = hourly[(hourly["vol_rel"] > 0.3) & (hourly["fecha"].dt.year >= 2023)]
    top = top.nlargest(40, "slow_excess")[
        ["fecha", "estacion_id", "direction", "vehicles", "slow_share", "slow_p50", "slow_excess"]
    ]
    top.insert(2, "nombre", top["estacion_id"].map(names))
    section(
        "Horas con mayor exceso de lentos (desde 2023, con volumen relevante)",
        top.round(3).to_markdown(index=False),
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
