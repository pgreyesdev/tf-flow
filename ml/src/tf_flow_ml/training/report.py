"""Informe en Markdown de una ejecución de entrenamiento."""

from dataclasses import asdict

import pandas as pd

from tf_flow_ml.evaluation.metrics import regression_report
from tf_flow_ml.training.features import FEATURES
from tf_flow_ml.training.pipeline import ModelResult, TrainingResult


def _table(results: list[ModelResult]) -> str:
    rows = [{"modelo": r.name, **asdict(r.report), "segundos": r.seconds} for r in results]
    return pd.DataFrame(rows).set_index("modelo").round(4).to_markdown()


def render_report(result: TrainingResult, names: pd.Series | None = None) -> str:
    test = result.test
    period = f"{test['timestamp'].min():%Y-%m-%d} a {test['timestamp'].max():%Y-%m-%d}"
    best = min(result.volume, key=lambda r: r.report.wape)  # type: ignore[union-attr]
    errors = test.assign(prediction=best.predictions)

    holidays = errors["is_holiday"] | errors["is_bridge"]
    by_day_type = pd.DataFrame(
        {
            "festivo o puente": [
                regression_report(
                    errors.loc[holidays, "vehicles"], errors.loc[holidays, "prediction"]
                ).wape
            ],
            "resto": [
                regression_report(
                    errors.loc[~holidays, "vehicles"], errors.loc[~holidays, "prediction"]
                ).wape
            ],
        },
        index=[best.name],
    )

    per_station = (
        errors.groupby(["station_id", "direction"])
        .apply(lambda g: regression_report(g["vehicles"], g["prediction"]).wape)
        .rename("wape")
        .sort_values(ascending=False)
        .head(10)
        .to_frame()
    )
    if names is not None:
        per_station["estación"] = per_station.index.get_level_values(0).map(names.to_dict())

    sections = [
        "# Entrenamiento de modelos",
        f"Entrenamiento: {result.train_rows:,} horas · Test: {result.test_rows:,} horas ({period})",
        "## Volumen horario (regresión)",
        _table(result.volume),
        f"## Error del mejor modelo ({best.name}) según el tipo de día (WAPE)",
        by_day_type.round(4).to_markdown(),
        "## Estaciones peor predichas (WAPE)",
        per_station.round(4).to_markdown(),
        "## Nivel de congestión (clasificación, sin horas desconocidas)",
        _table(result.level),
    ]
    if "volume_lightgbm" in result.models:
        importance = pd.Series(
            result.models["volume_lightgbm"].booster_.feature_importance("gain"), index=FEATURES
        )
        share = (importance / importance.sum()).sort_values(ascending=False).rename("ganancia")
        sections += [
            "## Importancia de variables (LightGBM, volumen)",
            share.round(4).to_markdown(),
        ]
    return "\n\n".join(sections) + "\n"
