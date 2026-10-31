import datetime as dt
from collections.abc import Iterator
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.main import create_app
from tf_flow_api.services.forecast import ForecastService
from tf_flow_api.services.incidents import IncidentService
from tf_flow_ml.processing.aggregation import BIN_COLUMNS, add_calendar_features
from tf_flow_ml.serving.bundle import ServingBundle, build_bundle
from tf_flow_ml.serving.predictor import Predictor
from tf_flow_ml.training.pipeline import TrainingConfig, train_and_evaluate

TODAY = dt.date(2025, 6, 2)
NOW = dt.datetime(2025, 6, 2, 8, 30, tzinfo=ZoneInfo("Atlantic/Canary"))
DGT_SAMPLE = Path(__file__).parent / "data" / "dgt_incidencias.xml"


@pytest.fixture(scope="session")
def bundle() -> ServingBundle:
    """Modelo pequeño entrenado con dos estaciones sintéticas; la 2 se atasca a las 8."""
    rng = np.random.default_rng(0)
    stamps = pd.date_range("2023-07-01", "2025-03-31 23:00", freq="h")
    frames = []
    for station in (1, 2):
        expected = np.asarray(300 * station * (1 + np.sin((stamps.hour - 6) / 24 * 2 * np.pi)) + 20)
        vehicles = rng.poisson(expected)
        jam = (station == 2) & np.isin(stamps.hour, [7, 8, 14])
        slow = np.where(jam, vehicles * 0.7, vehicles * 0.1).astype(int)
        frame = pd.DataFrame(
            {"timestamp": stamps, "station_id": station, "direction": 1, "vehicles": vehicles}
        )
        frame[BIN_COLUMNS] = 0
        frame["speed_bin_1"] = slow
        frame["speed_bin_3"] = vehicles - slow
        frames.append(frame)
    hourly = add_calendar_features(pd.concat(frames, ignore_index=True))
    config = TrainingConfig(n_estimators=10)
    result = train_and_evaluate(hourly, config)
    names = pd.Series({1: "AUTOPISTA NORTE", 2: "AUTOPISTA SUR"})
    # La 2 no consta en el catálogo de estaciones: la API la sirve sin coordenadas.
    coordinates = pd.DataFrame(
        {"latitude": [28.4483194], "longitude": [-16.2736395]},
        index=pd.Index([1], name="station_id"),
    )
    return build_bundle(
        result.data,
        names,
        config,
        result.high_threshold,
        {"volume_wape": 0.12},
        coordinates=coordinates,
    )


@pytest.fixture
def settings() -> Settings:
    return Settings(environment=Environment.TEST, cors_origins=["https://tf-flow.example"])


@pytest.fixture
def forecast(bundle: ServingBundle) -> ForecastService:
    return ForecastService(Predictor(bundle), max_days=14, today=lambda: TODAY)


@pytest.fixture
def incidents() -> IncidentService:
    """Incidencias leídas de la muestra de la DGT, sin salir a la red."""

    async def fetch(url: str) -> bytes:
        return DGT_SAMPLE.read_bytes()

    return IncidentService("https://dgt.example/feed.xml", fetch=fetch, now=lambda: NOW)


@pytest.fixture
def client(
    settings: Settings, forecast: ForecastService, incidents: IncidentService
) -> Iterator[TestClient]:
    with TestClient(create_app(settings, forecast, incidents=incidents)) as test_client:
        yield test_client


@pytest.fixture
def client_without_model(settings: Settings, incidents: IncidentService) -> Iterator[TestClient]:
    with TestClient(create_app(settings, incidents=incidents)) as test_client:
        yield test_client
