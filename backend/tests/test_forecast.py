import datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.main import load_forecast_service
from tf_flow_api.services.forecast import ForecastService, readable_name, today_in_tenerife
from tf_flow_ml.serving.bundle import ServingBundle, save_bundle
from tf_flow_ml.serving.predictor import HourlyForecast

from .conftest import TODAY


def test_lists_stations_with_readable_names(client: TestClient) -> None:
    response = client.get("/api/v1/stations")

    assert response.status_code == 200
    assert response.json() == [
        {
            "station_id": 1,
            "direction": 1,
            "direction_label": "creciente",
            "name": "Autopista Norte",
            "latitude": 28.448319,
            "longitude": -16.27364,
        },
        {
            "station_id": 2,
            "direction": 1,
            "direction_label": "creciente",
            "name": "Autopista Sur",
            "latitude": None,
            "longitude": None,
        },
    ]


def test_day_forecast_defaults_to_today(client: TestClient) -> None:
    response = client.get("/api/v1/stations/2/forecast", params={"direction": 1})

    assert response.status_code == 200
    body = response.json()
    assert body["date"] == TODAY.isoformat()
    assert body["timezone"] == "Atlantic/Canary"
    assert len(body["hours"]) == 24
    assert body["hours"][0]["time"] == f"{TODAY.isoformat()}T00:00:00"
    assert body["worst_hour"]["time"][11:13] in {"07", "08", "14"}
    assert body["worst_hour"]["level"] == "high"
    factor = body["worst_hour"]["factors"][0]
    assert set(factor) == {"feature", "label", "contribution"}


def test_forecast_for_a_given_date(client: TestClient) -> None:
    response = client.get(
        "/api/v1/stations/1/forecast", params={"direction": 1, "date": "2025-06-10"}
    )

    assert response.status_code == 200
    assert response.json()["date"] == "2025-06-10"


@pytest.mark.parametrize(
    ("path", "params", "status"),
    [
        ("/api/v1/stations/99/forecast", {"direction": 1}, 404),
        ("/api/v1/stations/1/forecast", {"direction": -1}, 404),
        ("/api/v1/stations/1/forecast", {"direction": 5}, 422),
        ("/api/v1/stations/1/forecast", {}, 422),
        ("/api/v1/stations/0/forecast", {"direction": 1}, 422),
        ("/api/v1/stations/1/forecast", {"direction": 1, "date": "2025-07-01"}, 422),
        ("/api/v1/stations/1/forecast", {"direction": 1, "date": "2025-05-01"}, 422),
        ("/api/v1/stations/1/forecast", {"direction": 1, "date": "mañana"}, 422),
    ],
)
def test_rejects_bad_requests(
    client: TestClient, path: str, params: dict[str, object], status: int
) -> None:
    assert client.get(path, params=params).status_code == status


def test_model_info(client: TestClient) -> None:
    body = client.get("/api/v1/model").json()

    assert body["data_until"] == "2025-03-31T23:00:00"
    assert body["metrics"] == {"volume_wape": 0.12}
    assert 0 < body["high_threshold"] < 1


def test_without_model_forecasts_are_unavailable(client_without_model: TestClient) -> None:
    assert client_without_model.get("/api/v1/health").json()["model_loaded"] is False
    assert client_without_model.get("/api/v1/stations").status_code == 503


def test_loads_the_configured_model(bundle: ServingBundle, tmp_path: Path) -> None:
    path = tmp_path / "serving.joblib"
    digest = save_bundle(bundle, path)

    service = load_forecast_service(
        Settings(environment=Environment.TEST, model_path=path, model_sha256=digest)
    )

    assert service is not None
    assert len(service.stations()) == 2


def test_refuses_a_model_without_fingerprint(tmp_path: Path) -> None:
    settings = Settings(environment=Environment.TEST, model_path=tmp_path / "serving.joblib")

    with pytest.raises(RuntimeError, match="TFFLOW_MODEL_SHA256"):
        load_forecast_service(settings)


def test_today_uses_the_canary_islands_clock() -> None:
    assert today_in_tenerife() == dt.datetime.now(ZoneInfo("Atlantic/Canary")).date()


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("TF-5 AUTOPISTA DEL NORTE", "TF-5 Autopista del Norte"),
        ("  tf1  los cristianos ", "TF1 Los Cristianos"),
        ("LA LAGUNA - TEJINA", "La Laguna - Tejina"),
        ("PUERTO DE LA CRUZ", "Puerto de la Cruz"),
        ("DEPURADORA S/C", "Depuradora S/C"),
        ("DÁRSENA PESQUERA", "Dársena Pesquera"),
        ("ACCESO AL PUERTO POR LA TF-24", "Acceso al Puerto por la TF-24"),
    ],
)
def test_station_names_are_readable(raw: str, expected: str) -> None:
    assert readable_name(raw) == expected


def test_predicts_the_week_in_one_go_and_each_day_once(
    forecast: ForecastService, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[int] = []
    predict = forecast.predictor.predict

    def counting(
        station_id: int, direction: int, hours: list[pd.Timestamp]
    ) -> list[HourlyForecast]:
        calls.append(len(hours))
        return predict(station_id, direction, hours)

    monkeypatch.setattr(forecast.predictor, "predict", counting)
    station = forecast.stations()[0]
    first = forecast.day_forecast(station.station_id, station.direction, TODAY)
    assert calls == [7 * 24]
    assert forecast.day_forecast(station.station_id, station.direction, None) == first
    friday = forecast.day_forecast(
        station.station_id, station.direction, TODAY + dt.timedelta(days=6)
    )
    assert calls == [7 * 24]
    assert friday.date == TODAY + dt.timedelta(days=6)
    assert [h.time.date() for h in friday.hours] == [friday.date] * 24

    later = forecast.day_forecast(
        station.station_id, station.direction, TODAY + dt.timedelta(days=10)
    )
    assert calls == [7 * 24, 24]
    assert later.date == TODAY + dt.timedelta(days=10)


def test_a_week_in_one_go_matches_day_by_day(forecast: ForecastService) -> None:
    station = forecast.stations()[0]
    days = [TODAY + dt.timedelta(days=i) for i in range(3)]
    together = forecast._compute_days(station, days)
    assert together == [forecast._compute_days(station, [day])[0] for day in days]


def test_network_now_gives_the_mapped_stations_at_the_current_hour(
    forecast: ForecastService,
) -> None:
    now = dt.datetime(2025, 6, 2, 8, 41, tzinfo=ZoneInfo("Atlantic/Canary"))
    network = forecast.network_now(now)
    assert network.time == dt.datetime(2025, 6, 2, 8)
    # La estación 2 no tiene coordenadas en el catálogo: no se puede situar en el mapa.
    assert [s.station.station_id for s in network.stations] == [1]
    expected = forecast.day_forecast(1, 1, TODAY).hours[8]
    assert network.stations[0].hour == expected


def test_network_now_endpoint(client: TestClient) -> None:
    response = client.get("/api/v1/network/now")
    assert response.status_code == 200
    body = response.json()
    assert len(body["stations"]) == 1
    assert body["stations"][0]["station"]["latitude"] == 28.448319
