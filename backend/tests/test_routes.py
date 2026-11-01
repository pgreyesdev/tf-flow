import datetime as dt
from typing import Any, cast

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tf_flow_api.domain.forecast import Level
from tf_flow_api.domain.incidents import Incident, IncidentKind, IncidentsNow
from tf_flow_api.services.forecast import DateOutOfRangeError, ForecastService
from tf_flow_api.services.incidents import IncidentService
from tf_flow_api.services.places import PLACES, find_place, place_by_id
from tf_flow_api.services.routes import (
    RouteService,
    RoutingUnavailableError,
    fetch_osrm,
    locate,
    simplify,
)

from .conftest import ACCIDENT_TF5, NOW, OSRM_RESPONSE, TODAY

pytestmark = pytest.mark.anyio

SANTA_CRUZ = place_by_id("santa-cruz-de-tenerife")
LA_LAGUNA = place_by_id("san-cristobal-de-la-laguna")
EIGHT = dt.datetime.combine(TODAY, dt.time(8))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("La Laguna", "San Cristóbal de La Laguna"),
        ("santa cruz", "Santa Cruz de Tenerife"),
        ("GUIMAR", "Güímar"),
        ("aeropuerto sur", "Aeropuerto Tenerife Sur"),
        ("americas", "Playa de las Américas"),
        ("Los Cristianos", "Los Cristianos"),
        ("Madrid", None),
        ("  ", None),
    ],
)
def test_finds_places_by_name(query: str, expected: str | None) -> None:
    place = find_place(query)
    assert (place.name if place else None) == expected


def test_places_have_unique_ids_inside_tenerife() -> None:
    assert len({p.id for p in PLACES}) == len(PLACES)
    assert all(27.95 < p.latitude < 28.65 and -16.95 < p.longitude < -16.1 for p in PLACES)
    assert place_by_id("los-cristianos") is not None


def test_geometry_helpers() -> None:
    line = [(0.0, 0.0), (0.001, 0.0), (0.002, 0.00001), (0.003, 0.0), (0.003, 0.003)]
    assert simplify(line) == [(0.0, 0.0), (0.003, 0.0), (0.003, 0.003)]
    assert simplify(line[:2]) == line[:2]
    distance, fraction = locate((0.0015, 0.0001), line)
    assert distance == pytest.approx(11, abs=1)
    assert 0.2 < fraction < 0.3
    assert locate((0.0, 0.0), [(0.0, 0.0), (0.0, 0.0)]) == (0.0, 0.0)


async def test_recommends_the_route_and_explains_it(routes: RouteService) -> None:
    assert SANTA_CRUZ is not None and LA_LAGUNA is not None
    plan = await routes.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)

    direct, detour = plan.routes
    assert (direct.name, direct.recommended, direct.closed) == ("Por TF-5", True, False)
    assert (direct.distance_km, direct.duration_minutes) == (12.3, 15.0)
    [station] = direct.stations
    assert (station.station_id, station.name) == (1, "Autopista Norte")
    assert station.passing.date() == TODAY and station.passing.hour == 8
    assert [i.road for i in direct.incidents] == ["TF-5"]
    assert direct.score_minutes >= 20  # 15 min más el accidente y lo que marque la estación.
    assert (detour.name, detour.recommended, detour.stations, detour.incidents) == (
        "Por TF-11 y TF-12",
        False,
        [],
        [],
    )
    assert detour.geometry[0] == (-16.2518, 28.4636)


async def test_avoids_a_closed_road(forecast: ForecastService) -> None:
    closure = Incident(
        id="9",
        kind=IncidentKind.WORKS,
        label="Obras",
        details=["Vía cortada"],
        road="TF-5",
        latitude=ACCIDENT_TF5[1],
        longitude=ACCIDENT_TF5[0],
        end=dt.datetime(2030, 1, 1, tzinfo=dt.UTC),
    )

    class Incidents:
        async def current(self) -> IncidentsNow:
            return IncidentsNow(available=True, incidents=[closure])

    async def fetch(url: str, origin: Any, destination: Any) -> dict[str, Any]:
        return OSRM_RESPONSE

    service = RouteService(forecast, cast(IncidentService, Incidents()), fetch=fetch)
    assert SANTA_CRUZ is not None and LA_LAGUNA is not None

    plan = await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)
    assert [(r.name, r.recommended, r.closed) for r in plan.routes] == [
        ("Por TF-11 y TF-12", True, False),
        ("Por TF-5", False, True),
    ]
    # Otro día solo cuentan las obras que siguen; las que no tienen fin, no.
    tomorrow = await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT + dt.timedelta(days=1))
    assert tomorrow.routes[1].closed
    closure.end = None
    tomorrow = await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT + dt.timedelta(days=1))
    assert tomorrow.routes[0].name == "Por TF-5"


def test_departure(routes: RouteService) -> None:
    assert routes.departure(None, None) == dt.datetime(2025, 6, 2, 8, 30)
    assert routes.departure(None, 17) == dt.datetime(2025, 6, 2, 17)
    assert routes.departure(dt.date(2025, 6, 5), None) == dt.datetime(2025, 6, 5, 8)
    with pytest.raises(DateOutOfRangeError):
        routes.departure(dt.date(2025, 6, 1), None)
    with pytest.raises(DateOutOfRangeError):
        routes.departure(dt.date(2025, 7, 1), None)


async def test_asks_the_router_once_and_reports_failures(
    forecast: ForecastService, incidents: IncidentService
) -> None:
    answers: list[Any] = [httpx.ConnectError("caído"), {"code": "NoRoute", "routes": []}]
    answers.append(OSRM_RESPONSE)
    calls = []

    async def fetch(url: str, origin: Any, destination: Any) -> dict[str, Any]:
        calls.append(url)
        answer = answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return cast(dict[str, Any], answer)

    service = RouteService(forecast, incidents, "https://osrm.example", fetch)
    assert SANTA_CRUZ is not None and LA_LAGUNA is not None
    with pytest.raises(RoutingUnavailableError, match="no responde"):
        await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)
    with pytest.raises(RoutingUnavailableError, match="ninguna ruta"):
        await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)
    await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)
    await service.plan(SANTA_CRUZ, LA_LAGUNA, EIGHT)
    assert len(calls) == 3


@respx.mock
async def test_fetch_osrm() -> None:
    route = respx.get(url__regex=r"https://osrm\.example/route/v1/driving/.*").respond(
        200, json=OSRM_RESPONSE
    )
    assert SANTA_CRUZ is not None and LA_LAGUNA is not None

    assert await fetch_osrm("https://osrm.example/", SANTA_CRUZ, LA_LAGUNA) == OSRM_RESPONSE
    request = route.calls[0].request
    assert request.url.path == "/route/v1/driving/-16.2518,28.4636;-16.3159,28.4874"
    assert request.url.params["alternatives"] == "3"
    assert request.headers["User-Agent"].startswith("TF-FLOW")


def routes_client(client: TestClient, routes: RouteService) -> TestClient:
    cast(FastAPI, client.app).state.routes = routes
    return client


def test_places_endpoint(client: TestClient) -> None:
    body = client.get("/api/v1/places").json()
    assert {"id": "los-cristianos", "name": "Los Cristianos"}.items() <= next(
        p for p in body if p["id"] == "los-cristianos"
    ).items()


def test_routes_endpoint(client: TestClient, routes: RouteService) -> None:
    api = routes_client(client, routes)
    query = {"origin": "santa-cruz-de-tenerife", "destination": "san-cristobal-de-la-laguna"}

    ok = api.get("/api/v1/routes", params=query | {"date": "2025-06-02", "hour": 8})
    assert ok.status_code == 200
    body = ok.json()
    assert body["departure"] == "2025-06-02T08:00:00"
    assert [r["recommended"] for r in body["routes"]] == [True, False]
    assert body["routes"][0]["stations"][0]["level"] in {lvl.value for lvl in Level}

    unknown = api.get("/api/v1/routes", params=query | {"origin": "madrid"})
    same = api.get("/api/v1/routes", params=query | {"destination": query["origin"]})
    late = api.get("/api/v1/routes", params=query | {"date": "2026-01-01"})
    invalid = api.get("/api/v1/routes", params=query | {"origin": "<script>"})
    assert (unknown.status_code, same.status_code, late.status_code) == (404, 422, 422)
    assert invalid.status_code == 422


def test_routes_endpoint_when_the_router_fails(
    client: TestClient, forecast: ForecastService, incidents: IncidentService
) -> None:
    async def fetch(url: str, origin: Any, destination: Any) -> dict[str, Any]:
        raise httpx.ConnectError("caído")

    api = routes_client(client, RouteService(forecast, incidents, fetch=fetch, now=lambda: NOW))
    params = {"origin": "arona", "destination": "adeje"}
    assert api.get("/api/v1/routes", params=params).status_code == 503


def test_routes_need_the_model(client_without_model: TestClient) -> None:
    params = {"origin": "arona", "destination": "adeje"}
    assert client_without_model.get("/api/v1/routes", params=params).status_code == 503
