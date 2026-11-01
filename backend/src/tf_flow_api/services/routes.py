"""Rutas alternativas entre dos lugares, puntuadas con la previsión y las incidencias.

Las rutas salen de un servidor OSRM con el mapa de OpenStreetMap (por defecto, el público del
proyecto). Para cada una se buscan las estaciones de aforo que tiene encima, se calcula a qué hora
se pasaría por cada una y se mira su previsión a esa hora, y se añaden las incidencias de la DGT
que caen sobre la ruta. Donde no hay estación no se sabe el tráfico: la ruta lo dice.
"""

import asyncio
import datetime as dt
import itertools
import logging
import math
from collections import OrderedDict
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Final
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx

from tf_flow_api.domain.forecast import TIMEZONE, Level, Station
from tf_flow_api.domain.incidents import Incident
from tf_flow_api.domain.routes import Place, RouteOption, RoutePlan, RouteStation
from tf_flow_api.services.forecast import DateOutOfRangeError, ForecastService
from tf_flow_api.services.incidents import IncidentService, now_in_tenerife

logger = logging.getLogger(__name__)

OSRM_URL: Final = "https://router.project-osrm.org"
#: Una estación está «en la ruta» si queda a menos de esto de su trazado.
STATION_RADIUS_M: Final = 120.0
#: Las incidencias se sitúan con menos precisión (un extremo del tramo afectado).
INCIDENT_RADIUS_M: Final = 200.0
#: Penalización orientativa, en minutos, para ordenar las rutas. No es un retraso medido.
PENALTY_MINUTES: Final = {Level.HIGH: 8.0, Level.MEDIUM: 3.0}
CLOSURE_PENALTY_MINUTES: Final = 60.0
INCIDENT_PENALTY_MINUTES: Final = 5.0
#: Tolerancia al simplificar el trazado que se envía (en grados, unos 10 m).
SIMPLIFY_DEGREES: Final = 0.0001
CACHE_SIZE: Final = 256
DEFAULT_HOUR: Final = 8
EARTH_RADIUS_M: Final = 6_371_000.0

Point = tuple[float, float]
"""[longitud, latitud], como en GeoJSON."""


class RoutingUnavailableError(RuntimeError):
    """El servidor de rutas no responde o no encuentra camino."""


async def fetch_osrm(base_url: str, origin: Place, destination: Place) -> dict[str, Any]:
    coordinates = ";".join(f"{p.longitude},{p.latitude}" for p in (origin, destination))
    url = f"{base_url.rstrip('/')}/route/v1/driving/{quote(coordinates, safe=',;.-')}"
    params = {"alternatives": "3", "overview": "full", "geometries": "geojson", "steps": "false"}
    async with httpx.AsyncClient(
        timeout=20, headers={"User-Agent": "TF-FLOW (TFG, ULL)"}
    ) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        body: dict[str, Any] = response.json()
        return body


def _xy(point: Point, latitude0: float) -> tuple[float, float]:
    """Proyección local en metros: de sobra para distancias de unos cientos de metros."""
    rad = math.pi / 180
    return (
        point[0] * rad * EARTH_RADIUS_M * math.cos(latitude0 * rad),
        point[1] * rad * EARTH_RADIUS_M,
    )


def _segment_distance(p: Point, a: Point, b: Point) -> tuple[float, float]:
    """Distancia de ``p`` al segmento ``ab`` en metros y en qué fracción del segmento cae."""
    px, py = _xy(p, p[1])
    ax, ay = _xy(a, p[1])
    bx, by = _xy(b, p[1])
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t


def _length(a: Point, b: Point) -> float:
    ax, ay = _xy(a, a[1])
    bx, by = _xy(b, a[1])
    return math.hypot(bx - ax, by - ay)


def locate(point: Point, line: Sequence[Point]) -> tuple[float, float]:
    """Distancia mínima en metros del punto al trazado y fracción del recorrido (0 a 1) donde
    queda más cerca."""
    best, best_at, travelled = math.inf, 0.0, 0.0
    for a, b in itertools.pairwise(line):
        segment = _length(a, b)
        distance, t = _segment_distance(point, a, b)
        if distance < best:
            best, best_at = distance, travelled + t * segment
        travelled += segment
    return best, (best_at / travelled if travelled else 0.0)


def simplify(line: Sequence[Point], tolerance: float = SIMPLIFY_DEGREES) -> list[Point]:
    """Douglas-Peucker: el mismo dibujo con muchos menos puntos."""
    if len(line) < 3:  # noqa: PLR2004
        return list(line)
    keep = [False] * len(line)
    keep[0] = keep[-1] = True
    stack = [(0, len(line) - 1)]
    while stack:
        first, last = stack.pop()
        (ax, ay), (bx, by) = line[first], line[last]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1.0
        index, farthest = first, 0.0
        for i in range(first + 1, last):
            px, py = line[i]
            distance = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if distance > farthest:
                index, farthest = i, distance
        if farthest > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [(round(x, 5), round(y, 5)) for (x, y), kept in zip(line, keep, strict=True) if kept]


def _closes_road(incident: Incident) -> bool:
    return "Vía cortada" in incident.details


def _active_at(incident: Incident, moment: dt.datetime, today: dt.date) -> bool:
    """Hoy cuentan todas las activas; otro día, solo las que según la DGT siguen entonces."""
    if moment.date() == today:
        return True
    if incident.end is None:
        return False
    local = moment.replace(tzinfo=ZoneInfo(TIMEZONE))
    return (incident.start is None or incident.start <= local) and local <= incident.end


class RouteService:
    def __init__(
        self,
        forecast: ForecastService,
        incidents: IncidentService,
        url: str = OSRM_URL,
        fetch: Callable[[str, Place, Place], Awaitable[dict[str, Any]]] = fetch_osrm,
        now: Callable[[], dt.datetime] = now_in_tenerife,
    ) -> None:
        self.now = now
        self.forecast = forecast
        self.incidents = incidents
        self.url = url
        self.fetch = fetch
        # Las carreteras no cambian de un minuto a otro: cada trayecto se pide una sola vez.
        self._cache: OrderedDict[tuple[str, str], list[dict[str, Any]]] = OrderedDict()

    def departure(self, date: dt.date | None, hour: int | None) -> dt.datetime:
        """Hora local de salida: por defecto, ahora; un día que no es hoy, a las 8 si no se dice.

        Solo se planifica desde hoy hasta donde llega la previsión."""
        today = self.forecast.today()
        date = date or today
        last = today + dt.timedelta(days=self.forecast.max_days)
        if not today <= date <= last:
            raise DateOutOfRangeError(f"Solo se planifican rutas desde hoy hasta el {last}")
        if hour is not None:
            return dt.datetime.combine(date, dt.time(hour))
        if date == today:
            now = self.now()
            return dt.datetime.combine(today, dt.time(now.hour, now.minute))
        return dt.datetime.combine(date, dt.time(DEFAULT_HOUR))

    async def plan(self, origin: Place, destination: Place, departure: dt.datetime) -> RoutePlan:
        """Las rutas posibles, de la más recomendable a la menos. ``departure`` es hora local
        sin zona."""
        raw_routes = await self._routes(origin, destination)
        today = self.forecast.today()
        now = await self.incidents.current()
        incidents = [i for i in now.incidents if _active_at(i, departure, today)]
        stations = [
            s
            for s in self.forecast.stations()
            if s.latitude is not None and s.longitude is not None
        ]
        options = await asyncio.to_thread(
            lambda: [self._option(raw, departure, stations, incidents) for raw in raw_routes]
        )
        options.sort(key=lambda option: option.score_minutes)
        if options:
            options[0].recommended = True
        return RoutePlan(
            origin=origin, destination=destination, departure=departure, routes=options
        )

    async def _routes(self, origin: Place, destination: Place) -> list[dict[str, Any]]:
        key = (origin.id, destination.id)
        if key not in self._cache:
            try:
                body = await self.fetch(self.url, origin, destination)
            except (httpx.HTTPError, ValueError) as error:
                logger.warning("No se pudo calcular la ruta: %s", error)
                raise RoutingUnavailableError("El servidor de rutas no responde") from error
            routes = body.get("routes") if body.get("code") == "Ok" else None
            if not routes:
                raise RoutingUnavailableError("No se encontró ninguna ruta entre esos lugares")
            self._cache[key] = routes
            while len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
        self._cache.move_to_end(key)
        return self._cache[key]

    def _option(
        self,
        raw: dict[str, Any],
        departure: dt.datetime,
        stations: list[Station],
        incidents: list[Incident],
    ) -> RouteOption:
        # Con el trazado simplificado (a unos 10 m) se busca igual de bien y mucho antes.
        line = simplify([(float(x), float(y)) for x, y in raw["geometry"]["coordinates"]])
        duration = float(raw["duration"]) / 60
        on_route = self._stations_on(line, departure, duration, stations)
        near = [
            incident
            for incident in incidents
            if locate((incident.longitude, incident.latitude), line)[0] <= INCIDENT_RADIUS_M
        ]
        closed = any(_closes_road(i) for i in near)
        score = (
            duration
            + sum(PENALTY_MINUTES.get(s.level, 0.0) for s in on_route)
            + sum(
                CLOSURE_PENALTY_MINUTES if _closes_road(i) else INCIDENT_PENALTY_MINUTES
                for i in near
            )
        )
        summaries = [leg.get("summary", "") for leg in raw.get("legs", [])]
        roads = list(dict.fromkeys(r.strip() for s in summaries for r in s.split(",") if r.strip()))
        return RouteOption(
            name=f"Por {' y '.join(roads)}" if roads else "Ruta",
            roads=roads,
            distance_km=round(float(raw["distance"]) / 1000, 1),
            duration_minutes=round(duration, 1),
            geometry=line,
            stations=on_route,
            incidents=near,
            closed=closed,
            score_minutes=round(score, 1),
        )

    def _stations_on(
        self,
        line: list[Point],
        departure: dt.datetime,
        duration_minutes: float,
        stations: list[Station],
    ) -> list[RouteStation]:
        """Las estaciones sobre la ruta, en orden de paso, con la previsión de cuando se pasa.

        De cada estación se toma el peor de sus sentidos: el sentido del aforo va por punto
        kilométrico y no se sabe cuál coincide con el de la ruta.
        """
        found: dict[int, RouteStation] = {}
        fractions: dict[int, float] = {}
        margin = 0.01  # Unos 1000 m: lo que queda fuera del recuadro de la ruta ni se mira.
        west, east = min(p[0] for p in line) - margin, max(p[0] for p in line) + margin
        south, north = min(p[1] for p in line) - margin, max(p[1] for p in line) + margin
        located: dict[int, tuple[float, float]] = {}
        for station in stations:
            latitude, longitude = station.latitude or 0.0, station.longitude or 0.0
            if not (west <= longitude <= east and south <= latitude <= north):
                continue
            if station.station_id not in located:
                located[station.station_id] = locate((longitude, latitude), line)
            distance, fraction = located[station.station_id]
            if distance > STATION_RADIUS_M:
                continue
            passing = departure + dt.timedelta(minutes=duration_minutes * fraction)
            hour = self.forecast.hour_forecast(station, passing.replace(minute=0, second=0))
            current = found.get(station.station_id)
            if current is None or hour.probability_high > current.probability_high:
                found[station.station_id] = RouteStation(
                    station_id=station.station_id,
                    name=station.name,
                    latitude=latitude,
                    longitude=longitude,
                    passing=passing.replace(second=0, microsecond=0),
                    level=hour.level,
                    probability_high=round(hour.probability_high, 3),
                )
                fractions[station.station_id] = fraction
        return sorted(found.values(), key=lambda s: fractions[s.station_id])
