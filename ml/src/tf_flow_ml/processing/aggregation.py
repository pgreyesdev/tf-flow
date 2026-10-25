"""Paso de los registros por carril del Cabildo a volumen horario por estación y sentido."""

from typing import Final

import numpy as np
import pandas as pd

RAW_COLUMNS: Final = ("fecha", "estacion_id", "carril_id", "ligeros", "pesados")
GROUP_KEYS: Final = ["timestamp", "station_id", "direction"]


class SchemaError(ValueError):
    """Al dataset le faltan columnas que el preprocesado necesita."""


def aggregate_hourly(raw: pd.DataFrame) -> pd.DataFrame:
    """Suma los carriles de un mismo sentido y añade las variables de calendario.

    El sentido sale del signo de ``carril_id``: positivo es creciente, negativo decreciente y
    cero sentido único. Las filas sin fecha o sin estación se descartan.
    """
    missing = sorted(set(RAW_COLUMNS) - set(raw.columns))
    if missing:
        raise SchemaError(f"Faltan columnas en el dataset de tráfico: {missing}")

    df = raw.loc[:, list(RAW_COLUMNS)].copy()
    df["timestamp"] = pd.to_datetime(df["fecha"], errors="coerce")
    df = df.dropna(subset=["timestamp", "estacion_id", "carril_id"])
    df["station_id"] = df["estacion_id"].astype(int)
    df["direction"] = np.sign(df["carril_id"].astype(int))
    df["vehicles"] = df["ligeros"].fillna(0) + df["pesados"].fillna(0)
    df["heavy"] = df["pesados"].fillna(0)

    hourly = df.groupby(GROUP_KEYS, as_index=False)[["vehicles", "heavy"]].sum()
    return add_calendar_features(hourly)


def add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    ts = out["timestamp"].dt
    out["hour"] = ts.hour
    out["day_of_week"] = ts.day_of_week
    out["month"] = ts.month
    out["is_weekend"] = out["day_of_week"] >= 5  # noqa: PLR2004 (sábado = 5)
    return out
