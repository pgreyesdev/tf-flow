"""Índice de congestión a partir de los rangos de velocidad (ADR 0006).

La señal principal es el exceso de vehículos lentos (rangos 1 y 2) frente a la proporción que
tiene la misma estación y sentido cuando circula con fluidez. Los límites de los rangos no son
comparables entre estaciones, así que nunca se usa la proporción de lentos en valor absoluto.

Se compara con el tráfico fluido y no con lo habitual a esa hora porque un atasco que se repite
cada mañana sigue siendo un atasco para quien conduce.

En las estaciones donde casi todo el tráfico cae siempre en los rangos lentos, la velocidad no
aporta información y el nivel se calcula con el volumen relativo a la capacidad observada.

Las referencias se calculan en ``fit`` solo con datos de entrenamiento, para no filtrar el futuro,
y con el último año disponible, porque algunas estaciones cambian de comportamiento con los años.
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final, Self

import numpy as np
import pandas as pd

from tf_flow_ml.processing.aggregation import BIN_COLUMNS

SLOW_BINS: Final = BIN_COLUMNS[:2]
STATION_KEYS: Final = ["station_id", "direction"]


class Level(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    UNKNOWN = "unknown"


class Method(StrEnum):
    SPEED = "speed"
    VOLUME = "volume"


@dataclass(frozen=True, slots=True)
class Thresholds:
    speed_medium: float = 0.15
    """Puntos de proporción de lentos por encima del tráfico fluido para riesgo medio."""
    speed_high: float = 0.30
    min_volume_ratio: float = 0.30
    """Volumen relativo mínimo para hablar de congestión; evita falsos positivos de madrugada."""
    volume_medium: float = 0.75
    """Volumen relativo a la capacidad observada (p99) para riesgo medio sin señal de velocidad."""
    volume_high: float = 0.90
    max_baseline_slow: float = 0.90
    """Si con tráfico fluido los lentos superan este valor, la velocidad no aporta información."""
    free_flow_band: tuple[float, float] = (0.15, 0.40)
    """Volumen relativo a la capacidad que se considera tráfico fluido para la referencia."""
    window_days: int | None = 365
    """Días más recientes del entrenamiento que se usan para las referencias; ``None`` = todos."""


class NotFittedError(RuntimeError):
    pass


def slow_share(df: pd.DataFrame) -> pd.Series:
    """Proporción de vehículos en los dos rangos más lentos; ``NaN`` si no hay vehículos."""
    total = df[BIN_COLUMNS].sum(axis=1)
    share = df[SLOW_BINS].sum(axis=1) / total.where(total > 0)
    return share.clip(0, 1)


class CongestionLabeler:
    def __init__(self, thresholds: Thresholds | None = None) -> None:
        self.thresholds = thresholds or Thresholds()
        self._stations: pd.DataFrame | None = None

    def fit(self, hourly: pd.DataFrame) -> Self:
        t = self.thresholds
        df = hourly.assign(slow_share=slow_share(hourly))
        if t.window_days is not None:
            df = df[df["timestamp"] > df["timestamp"].max() - pd.Timedelta(days=t.window_days)]
        capacity = df.groupby(STATION_KEYS)["vehicles"].quantile(0.99).rename("capacity")
        # Una estación sin tráfico observado en la ventana no tiene capacidad de referencia.
        capacity = capacity.where(capacity > 0)
        ratio = df["vehicles"] / df.join(capacity, on=STATION_KEYS)["capacity"]
        low, high = t.free_flow_band
        fluid = df[ratio.between(low, high)]
        free_flow = fluid.groupby(STATION_KEYS)["slow_share"].median().rename("baseline_slow")
        stations = pd.concat([capacity, free_flow], axis=1)
        stations["speed_informative"] = stations["baseline_slow"] < t.max_baseline_slow
        self._stations = stations
        return self

    @property
    def stations(self) -> pd.DataFrame:
        if self._stations is None:
            raise NotFittedError("Llama a fit() antes de usar el etiquetador")
        return self._stations

    def transform(self, hourly: pd.DataFrame) -> pd.DataFrame:
        """Añade ``slow_share``, ``slow_excess``, ``volume_ratio``, ``method`` y ``level``."""
        if self._stations is None:
            raise NotFittedError("Llama a fit() antes de transform()")
        out = hourly.assign(slow_share=slow_share(hourly))
        out = out.join(self._stations, on=STATION_KEYS)
        out["slow_excess"] = out["slow_share"] - out["baseline_slow"]
        out["volume_ratio"] = out["vehicles"] / out["capacity"]

        t = self.thresholds
        by_speed = out["speed_informative"].fillna(False).astype(bool) & out["slow_excess"].notna()
        busy = out["volume_ratio"] >= t.min_volume_ratio
        out["method"] = np.where(by_speed, Method.SPEED, Method.VOLUME)

        level = pd.Series(Level.LOW, index=out.index, dtype=object)
        speed_medium = by_speed & busy & (out["slow_excess"] >= t.speed_medium)
        speed_high = by_speed & busy & (out["slow_excess"] >= t.speed_high)
        volume_medium = ~by_speed & (out["volume_ratio"] >= t.volume_medium)
        volume_high = ~by_speed & (out["volume_ratio"] >= t.volume_high)
        level[speed_medium | volume_medium] = Level.MEDIUM
        level[speed_high | volume_high] = Level.HIGH
        level[out["capacity"].isna()] = Level.UNKNOWN
        out["level"] = level
        return out.drop(columns=["capacity", "speed_informative", "baseline_slow"])
