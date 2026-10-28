"""Predicción de volumen y nivel de congestión para una estación, con sus motivos."""

from dataclasses import dataclass
from typing import Any, Final, cast

import numpy as np
import pandas as pd

from tf_flow_ml.evaluation.explain import shap_log_odds
from tf_flow_ml.processing.aggregation import add_calendar_features
from tf_flow_ml.processing.congestion import Level
from tf_flow_ml.serving.bundle import ServingBundle
from tf_flow_ml.training.pipeline import predict_high_probability, predict_with_threshold

FEATURE_LABELS: Final = {
    "station_key": "la propia estación",
    "hour": "la hora",
    "day_of_week": "el día de la semana",
    "month": "el mes",
    "is_weekend": "fin de semana",
    "is_holiday": "festivo",
    "is_bridge": "puente",
    "profile_mean": "el tráfico habitual a esa hora",
    "capacity": "la capacidad de la vía",
    "recent_vehicles": "el tráfico de las últimas semanas publicadas",
    "recent_ratio": "la tendencia reciente frente a lo habitual",
    "recent_high": "los atascos fuertes recientes a esa hora",
    "recent_congested": "la congestión reciente a esa hora",
}
"""Nombre legible de cada variable, para explicar las predicciones en la web, la app y el chat."""


MAX_FACTORS: Final = 3
"""Motivos que se guardan por hora en las previsiones precalculadas."""
PRECOMPUTED_PAST_DAYS: Final = 7
"""Días anteriores al entrenamiento que se dejan calculados: la web enseña la última semana."""
PRECOMPUTED_DAYS: Final = 45
"""Días desde el entrenamiento que se dejan calculados. Explicar un día de una estación con SHAP
cuesta varios segundos en el modelo real, así que no se calcula un año entero: con 45 días la web,
que mira hasta 14 días por delante, tiene un mes de margen hasta el siguiente entrenamiento. Lo que
falte se calcula al pedirlo."""


class UnknownStationError(LookupError):
    pass


@dataclass(frozen=True, slots=True)
class Factor:
    feature: str
    label: str
    contribution: float
    """Cuánto empuja hacia el atasco fuerte, en log-odds: positivo lo hace más probable."""


@dataclass(frozen=True, slots=True)
class HourlyForecast:
    timestamp: pd.Timestamp
    vehicles: float
    level: str
    probability_high: float
    factors: tuple[Factor, ...]


class Predictor:
    def __init__(self, bundle: ServingBundle, top_factors: int = MAX_FACTORS) -> None:
        self.bundle = bundle
        self.top_factors = top_factors
        self._known = set(bundle.stations[["station_id", "direction"]].itertuples(index=False))
        # Las variables recientes solo miran la historia de la propia estación y sentido. Separarla
        # una vez evita recorrer la red entera en cada petición, que es lo que más tarda.
        self._history: dict[tuple[int, int], pd.DataFrame] = {
            cast(tuple[int, int], key): rows
            for key, rows in bundle.history.groupby(["station_id", "direction"], observed=True)
        }
        # Paquetes anteriores a las previsiones precalculadas no tienen el campo.
        table = getattr(bundle, "forecasts", None)
        self._precomputed: dict[tuple[int, int], pd.DataFrame] = (
            {}
            if table is None
            else {
                cast(tuple[int, int], key): rows.set_index("timestamp")
                for key, rows in table.groupby(["station_id", "direction"], observed=True)
            }
        )

    def predict(
        self, station_id: int, direction: int, timestamps: list[pd.Timestamp]
    ) -> list[HourlyForecast]:
        """Previsión de cada hora: la precalculada al entrenar si la hay, si no la calcula."""
        if (station_id, direction) not in self._known:
            raise UnknownStationError(f"No hay datos de la estación {station_id}/{direction}")
        stored = self._precomputed.get((station_id, direction))
        if stored is not None:
            rows = stored.reindex(pd.DatetimeIndex(timestamps).floor("h"))
            if not rows["vehicles"].isna().any():
                return [_from_row(row) for row in rows.itertuples()]
        return self.compute(station_id, direction, timestamps)

    def compute(
        self, station_id: int, direction: int, timestamps: list[pd.Timestamp]
    ) -> list[HourlyForecast]:
        """Pasa las horas por los modelos y explica cada una con SHAP. Es lo caro."""
        frame = add_calendar_features(
            pd.DataFrame(
                {
                    "timestamp": pd.to_datetime(timestamps).floor("h"),
                    "station_id": station_id,
                    "direction": direction,
                }
            )
        )
        history = self._history.get((station_id, direction), self.bundle.history.iloc[:0])
        x = self.bundle.features.transform(frame, history=history)
        vehicles = np.clip(self.bundle.volume_model.predict(x), 0, None)
        model = self.bundle.level_model
        levels = predict_with_threshold(model, x, self.bundle.high_threshold)
        probability = predict_high_probability(model, x)
        contributions = shap_log_odds(model, x, Level.HIGH, Level.LOW)

        values = contributions.to_numpy()
        names = contributions.columns.to_numpy()
        top = np.argsort(-np.abs(values), axis=1, kind="stable")[:, : self.top_factors]
        forecasts = []
        for i, timestamp in enumerate(frame["timestamp"]):
            factors = tuple(
                Factor(str(names[j]), FEATURE_LABELS[str(names[j])], round(float(values[i, j]), 4))
                for j in top[i]
            )
            forecasts.append(
                HourlyForecast(
                    timestamp=timestamp,
                    vehicles=round(float(vehicles[i]), 1),
                    level=str(levels[i]),
                    probability_high=round(float(probability[i]), 4),
                    factors=factors,
                )
            )
        return forecasts


def _from_row(row: Any) -> HourlyForecast:
    factors = tuple(
        Factor(str(name), FEATURE_LABELS[str(name)], round(float(value), 4))
        for name, value in (
            (getattr(row, f"factor_{i}"), getattr(row, f"contribution_{i}"))
            for i in range(1, MAX_FACTORS + 1)
        )
        if isinstance(name, str)
    )
    return HourlyForecast(
        timestamp=row.Index,
        vehicles=round(float(row.vehicles), 1),
        level=str(row.level),
        probability_high=round(float(row.probability_high), 4),
        factors=factors,
    )


def to_table(station_id: int, direction: int, forecasts: list[HourlyForecast]) -> pd.DataFrame:
    """Previsiones en una tabla compacta, para guardarlas en el paquete."""
    table = pd.DataFrame(
        {
            "station_id": station_id,
            "direction": direction,
            "timestamp": [f.timestamp for f in forecasts],
            "vehicles": np.array([f.vehicles for f in forecasts], dtype="float32"),
            "level": [f.level for f in forecasts],
            "probability_high": np.array([f.probability_high for f in forecasts], dtype="float32"),
        }
    )
    for i in range(MAX_FACTORS):
        table[f"factor_{i + 1}"] = [
            f.factors[i].feature if i < len(f.factors) else None for f in forecasts
        ]
        table[f"contribution_{i + 1}"] = np.array(
            [f.factors[i].contribution if i < len(f.factors) else np.nan for f in forecasts],
            dtype="float32",
        )
    return table


def precompute_window(
    bundle: ServingBundle, today: pd.Timestamp, days: int = PRECOMPUTED_DAYS
) -> tuple[pd.Timestamp, int]:
    """Primer día y número de días a precalcular: de una semana antes de ``today`` a ``days``
    después, sin empezar antes del día siguiente al último dato."""
    first_without_data = bundle.data_until.normalize() + pd.Timedelta(days=1)
    start = max(first_without_data, today.normalize() - pd.Timedelta(days=PRECOMPUTED_PAST_DAYS))
    end = today.normalize() + pd.Timedelta(days=days)
    return start, max((end - start).days, 0)


def precompute_forecasts(
    bundle: ServingBundle, days: int, start: pd.Timestamp | None = None
) -> pd.DataFrame:
    """Calcula las previsiones de todas las estaciones para ``days`` días desde ``start`` (por
    defecto, el día siguiente al último dato publicado).

    Explicar cada hora con SHAP cuesta CPU; aquí se paga una vez, en la máquina que entrena, y el
    servidor solo tiene que leer el resultado.
    """
    predictor = Predictor(bundle)
    if start is None:
        start = bundle.data_until.normalize() + pd.Timedelta(days=1)
    hours = list(pd.date_range(start, periods=days * 24, freq="h"))
    table = pd.concat(
        [
            to_table(station_id, direction, predictor.compute(station_id, direction, hours))
            for station_id, direction in bundle.stations[["station_id", "direction"]].itertuples(
                index=False
            )
        ],
        ignore_index=True,
    )
    categories = ["level", *(f"factor_{i}" for i in range(1, MAX_FACTORS + 1))]
    return table.astype(dict.fromkeys(categories, "category"))
