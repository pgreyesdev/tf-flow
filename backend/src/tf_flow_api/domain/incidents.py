"""Incidencias de tráfico en directo, tal como las publica la DGT."""

import datetime as dt
from enum import StrEnum

from pydantic import BaseModel, Field


class IncidentKind(StrEnum):
    ACCIDENT = "accident"
    CONGESTION = "congestion"
    WORKS = "works"
    OBSTRUCTION = "obstruction"
    RESTRICTION = "restriction"
    WEATHER = "weather"
    OTHER = "other"


class Incident(BaseModel):
    id: str
    kind: IncidentKind
    label: str = Field(description="Tipo de incidencia en español, como «Obras» o «Accidente»")
    details: list[str] = Field(
        default_factory=list, description="Efectos, como «Vía cortada» o «Velocidad limitada»"
    )
    road: str | None = Field(default=None, description="Vía, como «TF-5»")
    kilometer: float | None = None
    municipality: str | None = None
    latitude: float
    longitude: float
    start: dt.datetime | None = Field(default=None, description="Inicio según la DGT")
    end: dt.datetime | None = Field(default=None, description="Fin previsto, si lo hay")


class IncidentsNow(BaseModel):
    available: bool = Field(description="Falso si no se ha podido leer la fuente")
    updated: dt.datetime | None = Field(
        default=None, description="Cuándo se leyó la fuente por última vez"
    )
    source: str = "DGT · Punto de Acceso Nacional (DATEX II)"
    incidents: list[Incident]
