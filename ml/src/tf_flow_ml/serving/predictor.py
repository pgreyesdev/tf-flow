"""Predicción de volumen y nivel de congestión para una estación, con sus motivos."""

from dataclasses import dataclass
from typing import Final, cast

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
    def __init__(self, bundle: ServingBundle, top_factors: int = 3) -> None:
        self.bundle = bundle
        self.top_factors = top_factors
        self._known = set(bundle.stations[["station_id", "direction"]].itertuples(index=False))
        # Las variables recientes solo miran la historia de la propia estación y sentido. Separarla
        # una vez evita recorrer la red entera en cada petición, que es lo que más tarda.
        self._history: dict[tuple[int, int], pd.DataFrame] = {
            cast(tuple[int, int], key): rows
            for key, rows in bundle.history.groupby(["station_id", "direction"], observed=True)
        }

    def predict(
        self, station_id: int, direction: int, timestamps: list[pd.Timestamp]
    ) -> list[HourlyForecast]:
        if (station_id, direction) not in self._known:
            raise UnknownStationError(f"No hay datos de la estación {station_id}/{direction}")
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

        forecasts = []
        for i, timestamp in enumerate(frame["timestamp"]):
            row = contributions.iloc[i].sort_values(key=np.abs, ascending=False)
            factors = tuple(
                Factor(str(name), FEATURE_LABELS[str(name)], round(float(value), 4))
                for name, value in row.head(self.top_factors).items()
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
