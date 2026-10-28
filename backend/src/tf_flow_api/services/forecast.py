"""Casos de uso de previsión sobre el modelo empaquetado por ``tf_flow_ml``."""

import datetime as dt
import re
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import asdict
from threading import Lock
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
"""Códigos de vía como ``TF-5`` o ``TF1``, que se dejan en mayúsculas, igual que abreviaturas como
``S/C``."""
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
        if ROAD_CODE.match(word.upper()) or "/" in word:
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


#: Días por estación y sentido que caben en caché: de sobra para toda la red y el rango servido.
CACHE_SIZE = 4096
#: Días que la web enseña a partir de hoy. Se calculan juntos cuando se pide uno que falta.
OUTLOOK_DAYS = 7
HOURS_PER_DAY = 24
PAST_DAYS = 7


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
        # El modelo no cambia mientras el proceso vive, así que cada día se calcula una sola vez.
        # Calcular varios días en una sola llamada al modelo cuesta poco más que uno, y la web pide
        # la semana entera de golpe: el primer día que falta trae consigo el resto de la semana.
        # El cálculo ocupa la CPU entera, así que se hace de uno en uno y nadie repite el trabajo.
        self._cache: OrderedDict[tuple[int, int, dt.date], DayForecast] = OrderedDict()
        self._lock = Lock()
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
        if not today - dt.timedelta(days=PAST_DAYS) <= date <= last:
            raise DateOutOfRangeError(
                f"Solo hay previsiones desde hace una semana hasta el {last.isoformat()}"
            )

        key = (station_id, direction, date)
        with self._lock:
            if key not in self._cache:
                week = (today + dt.timedelta(days=i) for i in range(OUTLOOK_DAYS))
                days = sorted(
                    day
                    for day in {date, *week}
                    if day <= last and (station_id, direction, day) not in self._cache
                )
                for forecast in self._compute_days(station, days):
                    self._cache[(station_id, direction, forecast.date)] = forecast
                while len(self._cache) > CACHE_SIZE:
                    self._cache.popitem(last=False)
            self._cache.move_to_end(key)
            return self._cache[key]

    def _compute_days(self, station: Station, days: list[dt.date]) -> list[DayForecast]:
        hours = [
            pd.Timestamp(day) + pd.Timedelta(hours=hour)
            for day in days
            for hour in range(HOURS_PER_DAY)
        ]
        predicted = self.predictor.predict(station.station_id, station.direction, hours)
        data_until = self.predictor.bundle.data_until.to_pydatetime()
        result = []
        for i, day in enumerate(days):
            forecasts = [
                HourlyForecast(
                    time=f.timestamp.to_pydatetime(),
                    vehicles=f.vehicles,
                    level=Level(f.level),
                    probability_high=f.probability_high,
                    factors=[Factor(**asdict(factor)) for factor in f.factors],
                )
                for f in predicted[i * HOURS_PER_DAY : (i + 1) * HOURS_PER_DAY]
            ]
            result.append(
                DayForecast(
                    station=station,
                    date=day,
                    data_until=data_until,
                    hours=forecasts,
                    worst_hour=max(forecasts, key=lambda h: h.probability_high),
                )
            )
        return result
