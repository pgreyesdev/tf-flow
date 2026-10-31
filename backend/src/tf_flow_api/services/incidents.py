"""Incidencias en directo de la DGT (DATEX II v3, perfil RTTI SituationPublication).

La DGT publica un único fichero con las incidencias de toda España. Se descarga como mucho cada
pocos minutos, cuando alguien las pide, y se queda solo con las que caen en Tenerife. Si la fuente
falla se siguen sirviendo las últimas leídas durante un rato, avisando de cuándo son.
"""

import asyncio
import datetime as dt
import io
import logging
from collections.abc import Awaitable, Callable
from typing import Final
from xml.etree.ElementTree import Element
from zoneinfo import ZoneInfo

import httpx
from defusedxml.ElementTree import iterparse

from tf_flow_api.domain.forecast import TIMEZONE
from tf_flow_api.domain.incidents import Incident, IncidentKind, IncidentsNow

logger = logging.getLogger(__name__)

DGT_FEED_URL: Final = "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v36.xml"
#: Recuadro de Tenerife: el fichero trae también La Palma, La Gomera y El Hierro en la provincia.
TENERIFE_BOUNDS: Final = {"west": -17.0, "east": -16.0, "south": 27.95, "north": 28.65}
#: Tiempo que se siguen sirviendo las últimas incidencias si la DGT deja de responder.
STALE_AFTER: Final = dt.timedelta(minutes=30)
MAX_FEED_BYTES: Final = 64 * 1024 * 1024
XSI_TYPE: Final = "{http://www.w3.org/2001/XMLSchema-instance}type"

_BY_RECORD_TYPE: Final[dict[str, tuple[IncidentKind, str]]] = {
    "Accident": (IncidentKind.ACCIDENT, "Accidente"),
    "AbnormalTraffic": (IncidentKind.CONGESTION, "Retención"),
    "MaintenanceWorks": (IncidentKind.WORKS, "Obras"),
    "ConstructionWorks": (IncidentKind.WORKS, "Obras"),
    "VehicleObstruction": (IncidentKind.OBSTRUCTION, "Vehículo detenido"),
    "AnimalPresenceObstruction": (IncidentKind.OBSTRUCTION, "Animales en la vía"),
    "GeneralObstruction": (IncidentKind.OBSTRUCTION, "Obstáculo en la vía"),
    "EnvironmentalObstruction": (IncidentKind.OBSTRUCTION, "Obstáculo en la vía"),
    "InfrastructureDamageObstruction": (IncidentKind.OBSTRUCTION, "Daños en la vía"),
    "NonWeatherRelatedRoadConditions": (IncidentKind.OBSTRUCTION, "Calzada en mal estado"),
    "RoadOrCarriagewayOrLaneManagement": (IncidentKind.RESTRICTION, "Corte o carril cerrado"),
    "NetworkManagement": (IncidentKind.RESTRICTION, "Desvío o regulación"),
    "SpeedManagement": (IncidentKind.RESTRICTION, "Limitación de velocidad"),
    "PoorEnvironmentConditions": (IncidentKind.WEATHER, "Meteorología adversa"),
    "WeatherRelatedRoadConditions": (IncidentKind.WEATHER, "Calzada afectada por el tiempo"),
    "WinterDrivingManagement": (IncidentKind.WEATHER, "Vialidad invernal"),
}
"""Tipo de cada ``situationRecord`` según su ``xsi:type``."""

_BY_CAUSE: Final[dict[str, tuple[IncidentKind, str]]] = {
    "accident": (IncidentKind.ACCIDENT, "Accidente"),
    "abnormalTraffic": (IncidentKind.CONGESTION, "Retención"),
    "roadMaintenance": (IncidentKind.WORKS, "Obras"),
    "constructionWork": (IncidentKind.WORKS, "Obras"),
    "vehicleObstruction": (IncidentKind.OBSTRUCTION, "Vehículo detenido"),
    "animalPresence": (IncidentKind.OBSTRUCTION, "Animales en la vía"),
    "obstruction": (IncidentKind.OBSTRUCTION, "Obstáculo en la vía"),
    "environmentalObstruction": (IncidentKind.OBSTRUCTION, "Obstáculo en la vía"),
    "infrastructureDamageObstruction": (IncidentKind.OBSTRUCTION, "Daños en la vía"),
    "roadOrCarriagewayOrLaneManagement": (IncidentKind.RESTRICTION, "Corte o carril cerrado"),
    "poorEnvironment": (IncidentKind.WEATHER, "Meteorología adversa"),
    "publicEvent": (IncidentKind.OTHER, "Evento"),
}
"""Los registros genéricos (``GenericSituationRecord``) dicen qué son en ``causeType``."""

_OTHER: Final = (IncidentKind.OTHER, "Incidencia")
CLOSURES: Final = {
    "roadClosed",
    "carriagewayClosures",
    "laneClosures",
    "doNotUseSpecifiedLanesOrCarriageways",
}
"""Tipos de ``roadOrCarriagewayOrLaneManagementType`` que cortan la vía o algún carril."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].rsplit(":", 1)[-1]


def _text(record: Element, name: str) -> str | None:
    for element in record.iter():
        if _local(element.tag) == name and element.text and element.text.strip():
            return element.text.strip()
    return None


def _number(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


def _time(value: str | None, zone: ZoneInfo) -> dt.datetime | None:
    if value is None:
        return None
    try:
        moment = dt.datetime.fromisoformat(value)
    except ValueError:
        return None
    return moment.astimezone(zone) if moment.tzinfo else moment.replace(tzinfo=zone)


def _in_tenerife(latitude: float, longitude: float) -> bool:
    b = TENERIFE_BOUNDS
    return b["south"] <= latitude <= b["north"] and b["west"] <= longitude <= b["east"]


def _details(record: Element) -> list[str]:
    """Lo que supone para el conductor: si la vía o un carril están cortados, o hay límite."""
    details = []
    management = _text(record, "roadOrCarriagewayOrLaneManagementType")
    if management in CLOSURES:
        whole = management in {"roadClosed", "carriagewayClosures"} or (
            _text(record, "laneUsage") == "allLanesCompleteCarriageway"
        )
        details.append("Vía cortada" if whole else "Carril cortado")
    if _local(record.get(XSI_TYPE, "")) == "SpeedManagement":
        details.append("Velocidad limitada")
    return details


def _incident(record: Element, now: dt.datetime) -> Incident | None:
    """La incidencia de un ``situationRecord``, o ``None`` si no está en Tenerife o no sigue
    activa."""
    # Las coordenadas del primer punto: el punto de la incidencia o un extremo del tramo.
    latitude, longitude = _number(_text(record, "latitude")), _number(_text(record, "longitude"))
    if latitude is None or longitude is None or not _in_tenerife(latitude, longitude):
        return None
    if _text(record, "validityStatus") == "suspended":
        return None
    zone = now.tzinfo if isinstance(now.tzinfo, ZoneInfo) else ZoneInfo(TIMEZONE)
    start = _time(_text(record, "overallStartTime"), zone)
    end = _time(_text(record, "overallEndTime"), zone)
    if (start and start > now) or (end and end < now):
        return None
    # La causa dice mejor qué pasa: un corte de carril «por obras» se cuenta como obras.
    kind, label = _BY_CAUSE.get(_text(record, "causeType") or "") or _BY_RECORD_TYPE.get(
        _local(record.get(XSI_TYPE, "")), _OTHER
    )
    return Incident(
        id=record.get("id") or f"{latitude},{longitude}",
        kind=kind,
        label=label,
        details=_details(record),
        road=_text(record, "roadName") or _text(record, "roadNumber"),
        kilometer=_number(_text(record, "kilometerPoint")),
        municipality=_text(record, "municipality"),
        latitude=round(latitude, 6),
        longitude=round(longitude, 6),
        start=start,
        end=end,
    )


def _merge(situation_id: str | None, records: list[Incident]) -> Incident:
    """Una ``situation`` agrupa los registros de un mismo suceso (cada sentido, el corte y el
    límite de velocidad de unas obras...): se muestran como una sola incidencia."""
    first = records[0]
    starts = [r.start for r in records if r.start]
    ends = [r.end for r in records if r.end]
    details = list(dict.fromkeys(d for r in records for d in r.details))
    return first.model_copy(
        update={
            "id": situation_id or first.id,
            "details": details,
            "start": min(starts) if starts else None,
            "end": max(ends) if ends and len(ends) == len(records) else None,
        }
    )


def parse_incidents(feed: bytes, now: dt.datetime) -> list[Incident]:
    """Incidencias activas en Tenerife, de la más reciente a la más antigua.

    Se lee el fichero por partes y se descarta cada registro al terminarlo: el de toda España
    ocupa varios megas. ``defusedxml`` impide entidades externas y expansiones maliciosas.
    """
    incidents: dict[str, Incident] = {}
    pending: list[Incident] = []
    for _, element in iterparse(io.BytesIO(feed), events=("end",)):
        name = _local(element.tag)
        if name == "situationRecord":
            incident = _incident(element, now)
            if incident is not None:
                pending.append(incident)
            element.clear()
        elif name == "situation":
            if pending:
                merged = _merge(element.get("id"), pending)
                incidents.setdefault(merged.id, merged)
            pending = []
            element.clear()
    for incident in pending:  # Registros sueltos, fuera de cualquier ``situation``.
        incidents.setdefault(incident.id, incident)
    oldest = dt.datetime.min.replace(tzinfo=dt.UTC)
    return sorted(incidents.values(), key=lambda i: i.start or oldest, reverse=True)


async def download(url: str) -> bytes:
    async with httpx.AsyncClient(
        timeout=30, follow_redirects=True, headers={"User-Agent": "TF-FLOW (TFG, ULL)"}
    ) as client:
        response = await client.get(url)
        response.raise_for_status()
        if len(response.content) > MAX_FEED_BYTES:
            raise ValueError(f"El fichero de la DGT ocupa {len(response.content):,} bytes")
        return response.content


def now_in_tenerife() -> dt.datetime:
    return dt.datetime.now(ZoneInfo(TIMEZONE))


class IncidentService:
    def __init__(
        self,
        url: str = DGT_FEED_URL,
        refresh: dt.timedelta = dt.timedelta(minutes=5),
        fetch: Callable[[str], Awaitable[bytes]] = download,
        now: Callable[[], dt.datetime] = now_in_tenerife,
    ) -> None:
        self.url = url
        self.refresh = refresh
        self.fetch = fetch
        self.now = now
        self._lock = asyncio.Lock()
        self._incidents: list[Incident] = []
        self._updated: dt.datetime | None = None
        self._tried: dt.datetime | None = None

    async def current(self) -> IncidentsNow:
        """Las incidencias de ahora. Se vuelve a leer la DGT si la última lectura (buena o mala)
        tiene más de ``refresh``; las peticiones que llegan mientras tanto esperan a esa lectura."""
        if self._stale():
            async with self._lock:
                if self._stale():
                    await self._update()
        now = self.now()
        fresh = self._updated is not None and now - self._updated <= STALE_AFTER
        return IncidentsNow(
            available=fresh,
            updated=self._updated,
            incidents=self._incidents if fresh else [],
        )

    def _stale(self) -> bool:
        return self._tried is None or self.now() - self._tried > self.refresh

    async def _update(self) -> None:
        self._tried = self.now()
        try:
            feed = await self.fetch(self.url)
            # Leer el XML es CPU: va fuera del bucle de eventos para no frenar otras peticiones.
            self._incidents = await asyncio.to_thread(parse_incidents, feed, self._tried)
            self._updated = self._tried
            logger.info("%s incidencias de la DGT en Tenerife", len(self._incidents))
        except (httpx.HTTPError, ValueError, SyntaxError) as error:
            logger.warning("No se pudieron leer las incidencias de la DGT: %s", error)
