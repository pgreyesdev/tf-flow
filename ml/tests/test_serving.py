from dataclasses import fields
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from tf_flow_ml.processing.aggregation import add_calendar_features
from tf_flow_ml.serving.bundle import (
    IntegrityError,
    ServingBundle,
    build_bundle,
    file_sha256,
    load_bundle,
    save_bundle,
    station_coordinates,
)
from tf_flow_ml.serving.predictor import (
    FEATURE_LABELS,
    Predictor,
    UnknownStationError,
    precompute_forecasts,
    precompute_window,
)
from tf_flow_ml.training.features import FEATURES
from tf_flow_ml.training.pipeline import TrainingConfig, train_and_evaluate

FAST = TrainingConfig(n_estimators=10)


@pytest.fixture(scope="module")
def bundle(hourly: pd.DataFrame) -> ServingBundle:
    result = train_and_evaluate(hourly, FAST)
    names = pd.Series({1: "NORTE", 2: "SUR"})
    return build_bundle(result.data, names, FAST, result.high_threshold, {"volume_wape": 0.1})


def test_bundle_keeps_only_recent_history(bundle: ServingBundle) -> None:
    assert bundle.data_until == pd.Timestamp("2025-03-31 23:00")
    assert bundle.history["timestamp"].min() > pd.Timestamp("2024-11-30")
    assert bundle.stations.to_dict("records") == [
        {"station_id": 1, "direction": 1, "name": "NORTE"},
        {"station_id": 2, "direction": 1, "name": "SUR"},
    ]


def test_load_checks_the_fingerprint(bundle: ServingBundle, tmp_path: Path) -> None:
    path = tmp_path / "serving.joblib"
    digest = save_bundle(bundle, path)

    assert (tmp_path / "serving.joblib.sha256").read_text(encoding="utf-8").startswith(digest)
    assert load_bundle(path, digest.upper()).high_threshold == bundle.high_threshold
    with pytest.raises(IntegrityError, match="no coincide"):
        load_bundle(path, "0" * 64)


def test_load_rejects_other_objects(tmp_path: Path) -> None:
    path = tmp_path / "other.joblib"
    joblib.dump({"not": "a bundle"}, path)

    with pytest.raises(IntegrityError, match="no es un paquete"):
        load_bundle(path, file_sha256(path))


def test_predicts_a_day_with_reasons(bundle: ServingBundle) -> None:
    day = list(pd.date_range("2025-06-02", periods=24, freq="h"))

    forecast = Predictor(bundle).predict(2, 1, day)

    assert [f.timestamp.hour for f in forecast] == list(range(24))
    assert all(f.vehicles >= 0 for f in forecast)
    assert all(0 <= f.probability_high <= 1 for f in forecast)
    assert forecast[8].vehicles > forecast[3].vehicles
    assert forecast[8].probability_high > forecast[3].probability_high
    assert len(forecast[8].factors) == 3
    assert {f.feature for f in forecast[8].factors} <= set(FEATURES)


def test_every_feature_has_a_label() -> None:
    assert set(FEATURE_LABELS) == set(FEATURES)


def test_unknown_station(bundle: ServingBundle) -> None:
    with pytest.raises(UnknownStationError):
        Predictor(bundle).predict(99, 1, [pd.Timestamp("2025-06-02 08:00")])


def test_station_history_gives_the_same_features_as_the_whole_network(
    bundle: ServingBundle,
) -> None:
    station = bundle.stations.iloc[0]
    station_id, direction = int(station["station_id"]), int(station["direction"])
    frame = add_calendar_features(
        pd.DataFrame(
            {
                "timestamp": pd.date_range("2025-04-02", periods=24, freq="h"),
                "station_id": station_id,
                "direction": direction,
            }
        )
    )
    whole = bundle.features.transform(frame, history=bundle.history)
    own = bundle.history[
        (bundle.history["station_id"] == station_id) & (bundle.history["direction"] == direction)
    ]
    pd.testing.assert_frame_equal(bundle.features.transform(frame, history=own), whole)
    forecast = Predictor(bundle).predict(station_id, direction, list(frame["timestamp"]))
    expected = np.clip(bundle.volume_model.predict(whole), 0, None)
    assert [h.vehicles for h in forecast] == pytest.approx(list(expected), abs=0.05)


def test_precomputed_forecasts_match_the_models(
    bundle: ServingBundle, monkeypatch: pytest.MonkeyPatch
) -> None:
    table = precompute_forecasts(bundle, days=3)
    assert len(table) == len(bundle.stations) * 3 * 24
    with_table = ServingBundle(**{**asdict_shallow(bundle), "forecasts": table})
    station_id, direction = (int(v) for v in bundle.stations.iloc[0][["station_id", "direction"]])
    hours = list(
        pd.date_range(bundle.data_until.normalize() + pd.Timedelta(days=2), periods=24, freq="h")
    )
    expected = Predictor(bundle).compute(station_id, direction, hours)

    predictor = Predictor(with_table)
    monkeypatch.setattr(predictor, "compute", lambda *args: pytest.fail("debería leer la tabla"))
    assert predictor.predict(station_id, direction, hours) == expected


def test_hours_beyond_the_table_are_computed(bundle: ServingBundle) -> None:
    table = precompute_forecasts(bundle, days=1)
    predictor = Predictor(ServingBundle(**{**asdict_shallow(bundle), "forecasts": table}))
    station_id, direction = (int(v) for v in bundle.stations.iloc[0][["station_id", "direction"]])
    later = list(
        pd.date_range(bundle.data_until.normalize() + pd.Timedelta(days=5), periods=24, freq="h")
    )
    assert predictor.predict(station_id, direction, later) == Predictor(bundle).compute(
        station_id, direction, later
    )


def test_precompute_window_covers_the_last_week_and_the_coming_weeks(
    bundle: ServingBundle,
) -> None:
    after_data = bundle.data_until.normalize() + pd.Timedelta(days=1)
    today = after_data + pd.Timedelta(days=30, hours=15)
    start, days = precompute_window(bundle, today, days=45)
    assert start == today.normalize() - pd.Timedelta(days=7)
    assert days == 52
    # Si se entrena justo tras publicarse los datos, no hay semana pasada sin datos que calcular.
    start, days = precompute_window(bundle, after_data, days=45)
    assert (start, days) == (after_data, 45)


def asdict_shallow(bundle: ServingBundle) -> dict[str, object]:
    return {field.name: getattr(bundle, field.name) for field in fields(bundle)}


def test_station_coordinates_from_the_catalogue() -> None:
    catalogue = pd.DataFrame(
        {
            "estacion_id": [1, 1, 2, 3, 4],
            "estacion_nombre": ["NORTE", "NORTE", "SUR", "ERRATA", "SIN DATOS"],
            "estacion_latitud": [28.45, 28.46, 28.05, 40.4, None],
            "estacion_longitud": [-16.27, -16.28, -16.71, -3.7, None],
        }
    )
    coordinates = station_coordinates(catalogue)
    assert coordinates.to_dict("index") == {
        1: {"latitude": 28.45, "longitude": -16.27},
        2: {"latitude": 28.05, "longitude": -16.71},
    }


def test_bundle_places_stations_on_the_map(hourly: pd.DataFrame) -> None:
    result = train_and_evaluate(hourly, FAST)
    coordinates = pd.DataFrame(
        {"latitude": [28.45], "longitude": [-16.27]}, index=pd.Index([1], name="station_id")
    )
    bundle = build_bundle(
        result.data, pd.Series({1: "NORTE", 2: "SUR"}), FAST, 0.5, {}, coordinates=coordinates
    )
    north = bundle.stations[bundle.stations["station_id"] == 1]
    assert north[["latitude", "longitude"]].to_numpy().tolist()[0] == [28.45, -16.27]
    assert bundle.stations.loc[bundle.stations["station_id"] == 2, "latitude"].isna().all()
