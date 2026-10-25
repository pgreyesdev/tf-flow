"""Baselines históricos: el listón que cualquier modelo de ML tiene que superar.

Para cada estación, sentido, día de la semana y hora, predicen lo que pasó de media en el
entrenamiento. Si esa combinación no aparece, bajan a estación, sentido y hora, y por último al
valor global.
"""

from abc import ABC, abstractmethod
from typing import Any, Final, Self

import numpy as np
import pandas as pd

LEVELS: Final = (
    ["station_id", "direction", "day_of_week", "hour"],
    ["station_id", "direction", "hour"],
)


class NotFittedError(RuntimeError):
    pass


class _HierarchicalLookup(ABC):
    def __init__(self, target: str) -> None:
        self.target = target
        self._tables: list[pd.Series] = []
        self._fallback: Any = None

    @abstractmethod
    def _summarize(self, df: pd.DataFrame, keys: list[str] | None) -> pd.Series:
        """Valor por combinación de ``keys``, o un único valor global si ``keys`` es None."""

    def fit(self, df: pd.DataFrame) -> Self:
        self._tables = [self._summarize(df, keys) for keys in LEVELS]
        self._fallback = self._summarize(df, None).iloc[0]
        return self

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        if self._fallback is None:
            raise NotFittedError("Llama a fit() antes de predict()")
        prediction = pd.Series(None, index=df.index, dtype=object)
        for keys, table in zip(LEVELS, self._tables, strict=True):
            index = pd.MultiIndex.from_frame(df[keys])
            values = table.reindex(index).to_numpy(dtype=object)
            prediction = prediction.fillna(pd.Series(values, index=df.index))
        return prediction.fillna(self._fallback).to_numpy()


class HistoricalMeanBaseline(_HierarchicalLookup):
    """Media del volumen."""

    def __init__(self, target: str = "vehicles") -> None:
        super().__init__(target)

    def _summarize(self, df: pd.DataFrame, keys: list[str] | None) -> pd.Series:
        if keys is None:
            return pd.Series([float(df[self.target].mean())])
        return df.groupby(keys)[self.target].mean()

    def predict(self, df: pd.DataFrame) -> np.ndarray:
        return super().predict(df).astype(float)


class HistoricalModeBaseline(_HierarchicalLookup):
    """Nivel de congestión más frecuente."""

    def __init__(self, target: str = "level") -> None:
        super().__init__(target)

    def _summarize(self, df: pd.DataFrame, keys: list[str] | None) -> pd.Series:
        if keys is None:
            return df[self.target].value_counts().head(1).index.to_series()
        counts = df.groupby(keys)[self.target].value_counts()
        return counts.groupby(level=keys).idxmax().map(lambda key: key[-1])
