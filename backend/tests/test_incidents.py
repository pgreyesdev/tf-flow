import datetime as dt

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from tf_flow_api.domain.incidents import IncidentKind
from tf_flow_api.services.incidents import (
    MAX_FEED_BYTES,
    IncidentService,
    download,
    parse_incidents,
)

from .conftest import DGT_SAMPLE, NOW

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def test_keeps_only_active_incidents_in_tenerife() -> None:
    incidents = parse_incidents(DGT_SAMPLE.read_bytes(), NOW)

    assert [i.id for i in incidents] == ["1", "17264754", "2"]
    accident, _, works = incidents
    assert (accident.kind, accident.label) == (IncidentKind.ACCIDENT, "Accidente")
    assert (accident.road, accident.kilometer) == ("TF-5", 10.379)
    assert accident.municipality == "San Cristóbal de La Laguna"
    assert (accident.latitude, accident.longitude) == (28.4791, -16.3122)
    assert accident.start == dt.datetime(2025, 6, 2, 6, 50, tzinfo=dt.UTC)
    assert accident.end is None
    assert (works.kind, works.road, works.municipality) == (IncidentKind.WORKS, "TF-1", "Arona")
    assert works.end is not None
    assert works.details == []


def test_shows_each_situation_once_with_what_it_means() -> None:
    closure = parse_incidents(DGT_SAMPLE.read_bytes(), NOW)[1]

    # Dos registros, uno por sentido: el corte por obras se cuenta como obras y como vía cortada.
    assert (closure.kind, closure.label, closure.road) == (IncidentKind.WORKS, "Obras", "TF-82")
    assert closure.details == ["Vía cortada"]
    assert (closure.kilometer, closure.municipality) == (9.5, "El Tanque")
    assert closure.end == dt.datetime(2026, 3, 10, 23, 0, tzinfo=dt.UTC)


def test_describes_lane_closures_and_speed_limits() -> None:
    feed = b"""<p xmlns:x="urn:x" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <x:situation id="9">
        <x:situationRecord xsi:type="x:RoadOrCarriagewayOrLaneManagement" id="1">
          <x:latitude>28.3</x:latitude><x:longitude>-16.5</x:longitude>
          <x:roadOrCarriagewayOrLaneManagementType>laneClosures</x:roadOrCarriagewayOrLaneManagementType>
        </x:situationRecord>
        <x:situationRecord xsi:type="x:SpeedManagement" id="2">
          <x:latitude>28.3</x:latitude><x:longitude>-16.5</x:longitude>
          <x:overallEndTime>2099-01-01T00:00</x:overallEndTime>
        </x:situationRecord>
      </x:situation>
    </p>"""

    [incident] = parse_incidents(feed, NOW)

    assert (incident.id, incident.label) == ("9", "Corte o carril cerrado")
    assert incident.details == ["Carril cortado", "Velocidad limitada"]
    assert incident.end is None  # Uno de los registros no tiene fin.


def test_ignores_records_it_cannot_place_or_date() -> None:
    feed = b"""<p xmlns:x="urn:x">
      <x:situationRecord id="1"><x:latitude>28.3</x:latitude></x:situationRecord>
      <x:situationRecord id="2"><x:latitude>norte</x:latitude><x:longitude>-16.5</x:longitude>
      </x:situationRecord>
      <x:situationRecord id="3"><x:latitude>28.3</x:latitude><x:longitude>-16.5</x:longitude>
        <x:overallStartTime>ayer</x:overallStartTime><x:overallEndTime>2099-01-01T00:00</x:overallEndTime>
      </x:situationRecord>
    </p>"""

    [incident] = parse_incidents(feed, NOW)

    assert (incident.id, incident.kind, incident.label) == ("3", IncidentKind.OTHER, "Incidencia")
    assert incident.start is None
    assert incident.end == dt.datetime(2099, 1, 1, tzinfo=NOW.tzinfo)


def test_rejects_entity_expansion() -> None:
    bomb = b'<!DOCTYPE x [<!ENTITY a "aaaa">]><x>&a;</x>'

    with pytest.raises(ValueError, match=r"(?i)entit"):
        parse_incidents(bomb, NOW)


class Clock:
    def __init__(self) -> None:
        self.now = NOW

    def __call__(self) -> dt.datetime:
        return self.now


async def test_reads_the_feed_once_per_refresh_and_survives_outages() -> None:
    clock = Clock()
    feeds: list[bytes | Exception] = [
        DGT_SAMPLE.read_bytes(),
        httpx.ConnectError("caída"),
        httpx.ConnectError("caída"),
    ]
    calls: list[str] = []

    async def fetch(url: str) -> bytes:
        calls.append(url)
        item = feeds.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    service = IncidentService("https://dgt.example", dt.timedelta(minutes=5), fetch, clock)

    first = await service.current()
    assert first.available and len(first.incidents) == 3
    assert first.updated == NOW
    assert len((await service.current()).incidents) == 3
    assert len(calls) == 1

    # La DGT falla: se siguen dando las últimas durante un rato, y luego se avisa.
    clock.now = NOW + dt.timedelta(minutes=6)
    assert (await service.current()).available
    clock.now = NOW + dt.timedelta(minutes=40)
    late = await service.current()
    assert (late.available, late.incidents, late.updated) == (False, [], NOW)
    assert len(calls) == 3


async def test_unavailable_until_the_first_read() -> None:
    async def fetch(url: str) -> bytes:
        return b"<roto"

    now = await IncidentService(fetch=fetch, now=lambda: NOW).current()

    assert (now.available, now.updated, now.incidents) == (False, None, [])


@respx.mock
async def test_download() -> None:
    respx.get("https://dgt.example/ok").respond(200, content=b"<x/>")
    respx.get("https://dgt.example/caida").respond(503)
    respx.get("https://dgt.example/enorme").respond(200, content=b"x" * (MAX_FEED_BYTES + 1))

    assert await download("https://dgt.example/ok") == b"<x/>"
    assert respx.calls[0].request.headers["User-Agent"].startswith("TF-FLOW")
    with pytest.raises(httpx.HTTPStatusError):
        await download("https://dgt.example/caida")
    with pytest.raises(ValueError, match="ocupa"):
        await download("https://dgt.example/enorme")


def test_incidents_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/incidents")

    assert response.status_code == 200
    body = response.json()
    assert body["available"] is True
    assert body["source"].startswith("DGT")
    assert [i["road"] for i in body["incidents"]] == ["TF-5", "TF-82", "TF-1"]
