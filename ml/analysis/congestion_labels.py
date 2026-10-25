"""Comprueba el índice de congestión del ADR 0006 sobre datos que el etiquetador no ha visto.

Ajusta las referencias con 2019 y 2021-2024 (2020 se excluye por el confinamiento) y etiqueta
2025-2026. Imprime en Markdown la frecuencia de cada nivel y los episodios más fuertes, para
contrastarlos con atascos conocidos.

Uso: ``uv run python ml/analysis/congestion_labels.py data/raw/traffic/AAAAMMDD``
"""

import sys
from pathlib import Path

import pandas as pd

from tf_flow_ml.ingestion.snapshot import load_snapshot
from tf_flow_ml.processing.aggregation import aggregate_hourly
from tf_flow_ml.processing.congestion import CongestionLabeler, Level


def section(title: str, body: str) -> None:
    sys.stdout.write(f"\n## {title}\n\n{body}\n")


def main(snapshot_dir: Path) -> None:
    raw = load_snapshot(snapshot_dir)
    names = raw.drop_duplicates("estacion_id").set_index("estacion_id")["estacion_nombre"]
    hourly = aggregate_hourly(raw, mainline_only=True)
    del raw
    year = hourly["timestamp"].dt.year
    train = hourly[(year <= 2024) & (year != 2020)]
    test = hourly[year >= 2025]

    labeler = CongestionLabeler().fit(train)
    labeled = labeler.transform(test)
    labeled["name"] = labeled["station_id"].map(names)
    sys.stdout.write("# Validación del índice de congestión (2025-2026)\n")

    section(
        "Estaciones sin señal de velocidad útil (se usa el volumen)",
        labeler.stations[~labeler.stations["speed_informative"]]
        .assign(name=lambda d: d.index.get_level_values(0).map(names))
        .to_markdown(),
    )

    levels = labeled["level"].value_counts(normalize=True).mul(100).round(2)
    section("Frecuencia global de cada nivel (%)", levels.to_markdown())

    per_station = (
        pd.crosstab(
            [labeled["station_id"], labeled["name"], labeled["direction"]],
            labeled["level"],
            normalize="index",
        )
        .mul(100)
        .round(2)
    )
    section("Nivel por estación y sentido (% de horas)", per_station.to_markdown())

    workday = labeled[~labeled["is_weekend"]]
    by_hour = pd.crosstab(workday["hour"], workday["level"], normalize="index").mul(100).round(2)
    section("Laborables: nivel por hora (% de horas)", by_hour.to_markdown())

    high = labeled[(labeled["level"] == Level.HIGH) & (labeled["method"] == "speed")]
    top = high.nlargest(30, "slow_excess")[
        ["timestamp", "station_id", "name", "direction", "vehicles", "slow_share", "slow_excess"]
    ]
    rounded = top.round({"slow_share": 3, "slow_excess": 3})
    section("Episodios con mayor exceso de lentos", rounded.to_markdown(index=False))

    daily = (
        high.assign(day=high["timestamp"].dt.date)
        .groupby(["day", "station_id", "name", "direction"])
        .size()
        .rename("horas_alto")
        .sort_values(ascending=False)
        .head(30)
    )
    section("Días con más horas de riesgo alto", daily.to_markdown())


if __name__ == "__main__":
    main(Path(sys.argv[1]))
