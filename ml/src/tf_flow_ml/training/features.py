"""Matriz de variables que reciben los modelos.

Solo se usan variables conocidas de antemano para cualquier fecha futura: el calendario, los
festivos y el perfil histórico de cada estación. El Cabildo publica los datos con un mes de
retraso, así que el tráfico reciente no está disponible cuando se pide una predicción.
"""

from typing import Final, Self

import numpy as np
import pandas as pd

from tf_flow_ml.models.baseline import HistoricalMeanBaseline, NotFittedError
from tf_flow_ml.processing.calendar import add_holiday_features
from tf_flow_ml.processing.congestion import STATION_KEYS

CATEGORICAL: Final = ["station_key"]
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
]


class FeatureBuilder:
    """Aprende del entrenamiento el perfil y la capacidad de cada estación y sentido."""

    def __init__(self) -> None:
        self._profile = HistoricalMeanBaseline()
        self._stations: pd.DataFrame | None = None

    def fit(self, hourly: pd.DataFrame) -> Self:
        self._profile.fit(hourly)
        stations = hourly.groupby(STATION_KEYS)["vehicles"].quantile(0.99).rename("capacity")
        self._stations = stations.to_frame().assign(station_key=np.arange(len(stations)))
        return self

    def transform(self, hourly: pd.DataFrame) -> pd.DataFrame:
        if self._stations is None:
            raise NotFittedError("Llama a fit() antes de transform()")
        df = hourly if "is_holiday" in hourly else add_holiday_features(hourly)
        out = df.join(self._stations, on=STATION_KEYS)
        out["station_key"] = out["station_key"].fillna(-1).astype(int)
        out["profile_mean"] = self._profile.predict(df)
        for column in ("is_weekend", "is_holiday", "is_bridge"):
            out[column] = out[column].astype(int)
        return out[FEATURES]
