"""Casos de uso de previsión sobre el modelo empaquetado por ``tf_flow_ml``."""

import datetime as dt
import re
from collections.abc import Callable
from dataclasses import asdict
from zoneinfo import ZoneInfo

import pandas as pd

from tf_flow_api.domain.forecast import (
    DIRECTION_LABELS,
    TIMEZONE,
    DayForecast,
    Factor,
    HourlyForecast,
    Level,
    ModelInfo,
    Station,
)
from tf_flow_ml.serving.predictor import Predictor


class StationNotFoundError(LookupError):
    pass


class DateOutOfRangeError(ValueError):
    pass


ROAD_CODE = re.compile(r"^[A-Z]{1,3}-?\d+[A-Z]?$")
"""Códigos de vía como ``TF-5`` o ``TF1``, que se dejan en mayúsculas."""
PREPOSITIONS = frozenset({"a", "al", "de", "del", "en", "por", "y"})
ARTICLES = frozenset({"el", "la", "las", "los"})


def readable_name(raw: str) -> str:
    """``TF-5 PUERTO DE LA CRUZ`` → ``TF-5 Puerto de la Cruz``.

    Los artículos solo van en minúscula tras una preposición: «Los Cristianos» es un nombre propio.
    """
    readable: list[str] = []
    for word in raw.split():
        lower = word.lower()
        after_preposition = bool(readable) and readable[-1] in PREPOSITIONS
        if ROAD_CODE.match(word.upper()):
            readable.append(word.upper())
        elif readable and (lower in PREPOSITIONS or (lower in ARTICLES and after_preposition)):
            readable.append(lower)
        else:
            readable.append(word.capitalize())
    return " ".join(readable)


def _station(station_id: int, direction: int, name: str) -> Station:
    return Station(
        station_id=station_id,
        direction=direction,
        direction_label=DIRECTION_LABELS[direction],
        name=readable_name(name),
    )


def today_in_tenerife() -> dt.date:
    return dt.datetime.now(ZoneInfo(TIMEZONE)).date()


class ForecastService:
    def __init__(
        self,
        predictor: Predictor,
        max_days: int,
        today: Callable[[], dt.date] = today_in_tenerife,
    ) -> None:
        self.predictor = predictor
        self.max_days = max_days
        self.today = today
        catalogue = predictor.bundle.stations
        self._stations: dict[tuple[int, int], Station] = {
            (station.station_id, station.direction): station
            for station in (
                _station(int(row["station_id"]), int(row["direction"]), str(row["name"]))
                for row in catalogue.to_dict("records")
            )
        }

    def stations(self) -> list[Station]:
        return list(self._stations.values())

    def model_info(self) -> ModelInfo:
        bundle = self.predictor.bundle
        return ModelInfo(
            data_until=bundle.data_until.to_pydatetime(),
            high_threshold=bundle.high_threshold,
            metrics=bundle.metrics,
        )

    def day_forecast(self, station_id: int, direction: int, date: dt.date | None) -> DayForecast:
        station = self._stations.get((station_id, direction))
        if station is None:
            raise StationNotFoundError(f"No existe la estación {station_id} en sentido {direction}")
        today = self.today()
        date = date or today
        last = today + dt.timedelta(days=self.max_days)
        if not today - dt.timedelta(days=7) <= date <= last:
            raise DateOutOfRangeError(
                f"Solo hay previsiones desde hace una semana hasta el {last.isoformat()}"
            )

        hours = list(pd.date_range(pd.Timestamp(date), periods=24, freq="h"))
        forecasts = [
            HourlyForecast(
                time=f.timestamp.to_pydatetime(),
                vehicles=f.vehicles,
                level=Level(f.level),
                probability_high=f.probability_high,
                factors=[Factor(**asdict(factor)) for factor in f.factors],
            )
            for f in self.predictor.predict(station_id, direction, hours)
        ]
        return DayForecast(
            station=station,
            date=date,
            data_until=self.predictor.bundle.data_until.to_pydatetime(),
            hours=forecasts,
            worst_hour=max(forecasts, key=lambda h: h.probability_high),
        )
