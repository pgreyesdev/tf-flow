"""Matriz de variables que reciben los modelos.

Hay dos grupos de variables:

- Las que se conocen para cualquier fecha futura: calendario, festivos y el perfil histórico de
  cada estación.
- La tendencia reciente de cada estación: cómo fue el tráfico a esa misma hora en las últimas
  semanas publicadas. El Cabildo publica los datos con retraso, así que para predecir el día D
  solo se usa lo que terminó ``lag_days`` días antes. Así el modelo aprende la deriva de cada
  estación (obras, cambios de sensor, crecimiento del tráfico) sin usar datos que no tendría.
"""

from typing import Final, Self

import numpy as np
import pandas as pd

from tf_flow_ml.models.baseline import HistoricalMeanBaseline, NotFittedError
from tf_flow_ml.processing.calendar import add_holiday_features
from tf_flow_ml.processing.congestion import STATION_KEYS, Level

CATEGORICAL: Final = ["station_key"]
RECENT: Final = ["recent_vehicles", "recent_ratio", "recent_high", "recent_congested"]
FEATURES: Final = [
    *CATEGORICAL,
    "hour",
    "day_of_week",
    "month",
    "is_weekend",
    "is_holiday",
    "is_bridge",
    "profile_mean",
    "capacity",
    *RECENT,
]
RECENT_KEYS: Final = [*STATION_KEYS, "hour", "is_weekend"]
DATE_DTYPE: Final = "datetime64[us]"
"""Resolución común de fechas: pandas no cruza fechas con distinta resolución."""


def recent_profile(
    target: pd.DataFrame, history: pd.DataFrame, lag_days: int, window_days: int
) -> pd.DataFrame:
    """Media de ``vehicles``, ``is_high`` e ``is_congested`` de la misma estación, sentido, hora y
    tipo de día en los ``window_days`` días que terminaron ``lag_days`` días antes de cada fila.

    Si después de esa ventana no hay datos, se usa la última ventana disponible. Devuelve NaN
    cuando la estación no tiene historia suficientemente antigua.
    """
    values = ["vehicles", "is_high", "is_congested"]
    past = history.assign(date=history["timestamp"].dt.normalize())
    level = past["level"] if "level" in past else pd.Series(np.nan, index=past.index)
    labeled = level.isin([Level.LOW, Level.MEDIUM, Level.HIGH])
    past["is_high"] = (level == Level.HIGH).where(labeled).astype(float)
    past["is_congested"] = level.isin([Level.MEDIUM, Level.HIGH]).where(labeled).astype(float)
    daily = past.groupby([*RECENT_KEYS, "date"])[values].mean().reset_index()
    rolled = (
        daily.sort_values("date")
        .groupby(RECENT_KEYS)
        .rolling(f"{window_days}D", on="date")[values]
        .mean()
        .reset_index()
    )
    rolled["date"] = (rolled["date"] + pd.Timedelta(days=lag_days)).astype(DATE_DTYPE)

    query = target[RECENT_KEYS].assign(
        date=target["timestamp"].dt.normalize().astype(DATE_DTYPE), row=np.arange(len(target))
    )
    merged = pd.merge_asof(
        query.sort_values("date"),
        rolled.sort_values("date"),
        on="date",
        by=RECENT_KEYS,
        direction="backward",
    ).sort_values("row")
    result = merged[values].set_axis(target.index)
    return result.rename(
        columns={
            "vehicles": "recent_vehicles",
            "is_high": "recent_high",
            "is_congested": "recent_congested",
        }
    )


class FeatureBuilder:
    """Aprende del entrenamiento el perfil y la capacidad de cada estación y sentido."""

    def __init__(self, lag_days: int = 45, window_days: int = 28) -> None:
        self.lag_days = lag_days
        self.window_days = window_days
        self._profile = HistoricalMeanBaseline()
        self._stations: pd.DataFrame | None = None

    def fit(self, hourly: pd.DataFrame) -> Self:
        self._profile.fit(hourly)
        stations = hourly.groupby(STATION_KEYS)["vehicles"].quantile(0.99).rename("capacity")
        self._stations = stations.to_frame().assign(station_key=np.arange(len(stations)))
        return self

    def transform(self, hourly: pd.DataFrame, history: pd.DataFrame | None = None) -> pd.DataFrame:
        """``history`` es el tráfico publicado del que salen las variables recientes; por defecto
        es el propio ``hourly``."""
        if self._stations is None:
            raise NotFittedError("Llama a fit() antes de transform()")
        df = hourly if "is_holiday" in hourly else add_holiday_features(hourly)
        out = df.join(self._stations, on=STATION_KEYS)
        out["station_key"] = out["station_key"].fillna(-1).astype(int)
        out["profile_mean"] = self._profile.predict(df)
        recent = recent_profile(
            df, hourly if history is None else history, self.lag_days, self.window_days
        )
        out[recent.columns] = recent
        out["recent_ratio"] = out["recent_vehicles"] / out["profile_mean"].where(
            out["profile_mean"] > 0
        )
        for column in ("is_weekend", "is_holiday", "is_bridge"):
            out[column] = out[column].astype(int)
        return out[FEATURES]
