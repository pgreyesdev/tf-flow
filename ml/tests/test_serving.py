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
)
from tf_flow_ml.serving.predictor import FEATURE_LABELS, Predictor, UnknownStationError
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
