"""Esquemas públicos de estaciones y previsiones."""

import datetime as dt
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

TIMEZONE = "Atlantic/Canary"


class Level(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


Direction = Literal[-1, 0, 1]

DIRECTION_LABELS: dict[int, str] = {1: "creciente", -1: "decreciente", 0: "único"}


class Station(BaseModel):
    station_id: int
    direction: Direction
    direction_label: str = Field(description="Sentido según el punto kilométrico")
    name: str


class Factor(BaseModel):
    feature: str
    label: str = Field(description="Explicación legible de la variable")
    contribution: float = Field(
        description=(
            "Empuje hacia el atasco fuerte frente al tráfico fluido, en log-odds: "
            "positivo lo hace más probable"
        )
    )


class HourlyForecast(BaseModel):
    time: dt.datetime = Field(description=f"Hora local ({TIMEZONE})")
    vehicles: float = Field(ge=0, description="Vehículos previstos en esa hora")
    level: Level
    probability_high: float = Field(ge=0, le=1, description="Probabilidad de atasco fuerte")
    factors: list[Factor]


class DayForecast(BaseModel):
    station: Station
    date: dt.date
    timezone: str = TIMEZONE
    data_until: dt.datetime = Field(description="Último dato publicado con el que se predice")
    hours: list[HourlyForecast]
    worst_hour: HourlyForecast = Field(description="La hora con más riesgo de atasco fuerte")


class ModelInfo(BaseModel):
    data_until: dt.datetime
    high_threshold: float
    metrics: dict[str, float] = Field(description="Métricas en el periodo de test")
