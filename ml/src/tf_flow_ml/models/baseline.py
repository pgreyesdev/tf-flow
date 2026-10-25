"""Baseline de media histórica: el listón que cualquier modelo de ML tiene que superar.

Predice la media del volumen para la misma estación, sentido, día de la semana y hora. Si esa
combinación no aparece en el entrenamiento, baja a estación, sentido y hora, y por último a la
media global.
"""

from typing import Final, Self

import numpy as np
import pandas as pd

LEVELS: Final = (
    ["station_id", "direction", "day_of_week", "hour"],
    ["station_id", "direction", "hour"],
)


class NotFittedError(RuntimeError):
    pass


class HistoricalMeanBaseline:
    def __init__(self, target: str = "vehicles") -> None:
        self.target = target
        self._tables: list[pd.Series] = []
        self._global_mean: float | None = None

    def fit(self, df: pd.DataFrame) -> Self:
        self._tables = [df.groupby(keys)[self.target].mean() for keys in LEVELS]
        self._global_mean = float(df[self.target].mean())
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if self._global_mean is None:
            raise NotFittedError("Llama a fit() antes de predict()")
        prediction = pd.Series(np.nan, index=df.index, dtype=float)
        for keys, table in zip(LEVELS, self._tables, strict=True):
            index = pd.MultiIndex.from_frame(df[keys])
            values = table.reindex(index).to_numpy()
            prediction = prediction.fillna(pd.Series(values, index=df.index))
        return prediction.fillna(self._global_mean).to_numpy()
