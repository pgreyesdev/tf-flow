"""Paso de los registros por carril del Cabildo a volumen horario por estación y sentido."""

from typing import Final

import numpy as np
import pandas as pd

RANGE_COLUMNS: Final = tuple(f"rango{i}_vehiculos" for i in range(1, 7))
"""Vehículos por rango de velocidad; los seis suman ``ligeros + pesados``.

El rango 1 es el más lento: en los accesos concentra el 79 % de los vehículos. Los límites en km/h
no están publicados y no son comparables entre estaciones (ver ADR 0006).
"""
RAW_COLUMNS: Final = ("fecha", "estacion_id", "carril_id", "ligeros", "pesados", *RANGE_COLUMNS)
BIN_COLUMNS: Final = [f"speed_bin_{i}" for i in range(1, 7)]
GROUP_KEYS: Final = ["timestamp", "station_id", "direction"]
NON_MAINLINE_PATTERN: Final = r"acceso|salida|enlace|incorpora|ramal|rotonda|bus"
"""Carriles que no son tronco de la vía: accesos, salidas y carriles bus."""


class SchemaError(ValueError):
    """Al dataset le faltan columnas que el preprocesado necesita."""


def is_mainline(lane_description: pd.Series) -> pd.Series:
    """``True`` para los carriles del tronco de la vía según su descripción."""
    lowered = lane_description.fillna("").str.lower()
    return ~lowered.str.contains(NON_MAINLINE_PATTERN)


def aggregate_hourly(raw: pd.DataFrame, *, mainline_only: bool = False) -> pd.DataFrame:
    """Suma los carriles de un mismo sentido y añade las variables de calendario.

    El sentido sale del signo de ``carril_id``: positivo es creciente, negativo decreciente y
    cero sentido único. Las filas sin fecha o sin estación se descartan. Con ``mainline_only``
    se ignoran accesos, salidas y carriles bus, que tienen su propia dinámica de velocidad.
    """
    required = {*RAW_COLUMNS, "carril_descripcion"} if mainline_only else set(RAW_COLUMNS)
    missing = sorted(required - set(raw.columns))
    if missing:
        raise SchemaError(f"Faltan columnas en el dataset de tráfico: {missing}")

    if mainline_only:
        raw = raw[is_mainline(raw["carril_descripcion"])]
    df = raw.loc[:, list(RAW_COLUMNS)].copy()
    df["timestamp"] = pd.to_datetime(df["fecha"], errors="coerce")
    df = df.dropna(subset=["timestamp", "estacion_id", "carril_id"])
    df["station_id"] = df["estacion_id"].astype(int)
    df["direction"] = np.sign(df["carril_id"].astype(int))
    df["vehicles"] = df["ligeros"].fillna(0) + df["pesados"].fillna(0)
    df["heavy"] = df["pesados"].fillna(0)
    df[BIN_COLUMNS] = df[list(RANGE_COLUMNS)].fillna(0).to_numpy()

    hourly = df.groupby(GROUP_KEYS, as_index=False)[["vehicles", "heavy", *BIN_COLUMNS]].sum()
    return add_calendar_features(hourly)


def add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    ts = out["timestamp"].dt
    out["hour"] = ts.hour
    out["day_of_week"] = ts.day_of_week
    out["month"] = ts.month
    out["is_weekend"] = out["day_of_week"] >= 5  # noqa: PLR2004 (sábado = 5)
    return out
