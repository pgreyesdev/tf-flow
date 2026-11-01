"""Rutas entre dos lugares de Tenerife, cruzadas con la previsión y las incidencias."""

import datetime as dt

from pydantic import BaseModel, Field

from tf_flow_api.domain.forecast import TIMEZONE, Level
from tf_flow_api.domain.incidents import Incident


class Place(BaseModel):
    id: str = Field(description="Identificador para la URL, como «los-cristianos»")
    name: str
    latitude: float
    longitude: float


class RouteStation(BaseModel):
    """Una estación de aforo por la que pasa la ruta, a la hora a la que se llegaría a ella."""

    station_id: int
    name: str
    latitude: float
    longitude: float
    passing: dt.datetime = Field(description=f"Hora local ({TIMEZONE}) aproximada de paso")
    level: Level = Field(description="El peor de los dos sentidos: no se sabe cuál lleva la ruta")
    probability_high: float = Field(ge=0, le=1)


class RouteOption(BaseModel):
    name: str = Field(description="Las vías principales, como «Por TF-1»")
    roads: list[str]
    distance_km: float
    duration_minutes: float = Field(description="Tiempo sin tráfico según OpenStreetMap")
    geometry: list[tuple[float, float]] = Field(description="Puntos [longitud, latitud]")
    stations: list[RouteStation]
    incidents: list[Incident]
    closed: bool = Field(description="Alguna incidencia de la ruta corta la vía")
    score_minutes: float = Field(
        description="Tiempo sin tráfico más una penalización orientativa por atascos e incidencias"
    )
    recommended: bool = False


class RoutePlan(BaseModel):
    origin: Place
    destination: Place
    departure: dt.datetime = Field(description=f"Hora local ({TIMEZONE}) de salida")
    source: str = "© OpenStreetMap · rutas con OSRM"
    routes: list[RouteOption]
