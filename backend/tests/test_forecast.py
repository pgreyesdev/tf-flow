import datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.main import load_forecast_service
from tf_flow_api.services.forecast import readable_name, today_in_tenerife
from tf_flow_ml.serving.bundle import ServingBundle, save_bundle

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
        },
        {"station_id": 2, "direction": 1, "direction_label": "creciente", "name": "Autopista Sur"},
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
        ("DÁRSENA PESQUERA", "Dársena Pesquera"),
        ("ACCESO AL PUERTO POR LA TF-24", "Acceso al Puerto por la TF-24"),
    ],
)
def test_station_names_are_readable(raw: str, expected: str) -> None:
    assert readable_name(raw) == expected
