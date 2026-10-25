from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from tf_flow_ml.evaluation.metrics import ClassificationReport
from tf_flow_ml.models.baseline import NotFittedError
from tf_flow_ml.processing.aggregation import BIN_COLUMNS, add_calendar_features
from tf_flow_ml.training import __main__ as cli
from tf_flow_ml.training.features import FEATURES, FeatureBuilder
from tf_flow_ml.training.pipeline import (
    TrainingConfig,
    TrainingResult,
    label_by_year,
    train_and_evaluate,
)
from tf_flow_ml.training.report import render_report

FAST = TrainingConfig(test_from="2025-01-01", n_estimators=10)


@pytest.fixture(scope="module")
def hourly() -> pd.DataFrame:
    """Dos estaciones con ciclo diario; la 2 se atasca en hora punta."""
    rng = np.random.default_rng(0)
    stamps = pd.date_range("2024-01-01", "2025-03-31 23:00", freq="h")
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
    return add_calendar_features(pd.concat(frames, ignore_index=True))


@pytest.fixture(scope="module")
def result(hourly: pd.DataFrame) -> TrainingResult:
    return train_and_evaluate(hourly, FAST)


def test_labels_use_each_year_references(hourly: pd.DataFrame) -> None:
    levels = label_by_year(hourly)

    assert levels.index.equals(hourly.index)
    jams = hourly["station_id"].eq(2) & hourly["hour"].eq(8)
    assert (levels[jams] == "high").mean() > 0.9
    assert (levels[~jams & hourly["hour"].eq(3)] == "low").all()


def test_feature_builder_handles_unknown_stations(hourly: pd.DataFrame) -> None:
    builder = FeatureBuilder().fit(hourly)
    query = hourly.head(2).assign(station_id=99)

    features = builder.transform(query)

    assert list(features.columns) == FEATURES
    assert features["station_key"].tolist() == [-1, -1]
    assert features["capacity"].isna().all()


def test_feature_builder_must_fit_first(hourly: pd.DataFrame) -> None:
    with pytest.raises(NotFittedError):
        FeatureBuilder().transform(hourly)


def test_compares_every_model_on_the_future(result: TrainingResult) -> None:
    assert [r.name for r in result.volume] == ["baseline", "random_forest", "lightgbm"]
    assert [r.name for r in result.level] == [
        "baseline",
        "random_forest",
        "lightgbm",
        "lightgbm_balanced",
    ]
    assert result.test["timestamp"].min() >= pd.Timestamp(FAST.test_from)
    random_forest = result.level[1].report
    assert isinstance(random_forest, ClassificationReport)
    assert random_forest.recall_high > 0.9


def test_report_lists_models_and_importances(result: TrainingResult) -> None:
    report = render_report(result, pd.Series({1: "NORTE", 2: "SUR"}))

    assert "## Volumen horario (regresión)" in report
    assert "lightgbm_balanced" in report
    assert "profile_mean" in report
    assert "SUR" in report


def test_cli_writes_report_and_models(
    hourly: pd.DataFrame, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    raw = pd.DataFrame({"estacion_id": [1, 2], "estacion_nombre": ["NORTE", "SUR"]})
    monkeypatch.setattr(cli, "load_snapshot", lambda _: raw)
    monkeypatch.setattr(cli, "aggregate_hourly", lambda *_, **__: hourly)

    cli.main([str(tmp_path), "--out", str(tmp_path / "out"), "--n-estimators", "5"])

    assert "NORTE" in (tmp_path / "out" / "entrenamiento.md").read_text(encoding="utf-8")
    bundle = joblib.load(tmp_path / "out" / "modelos.joblib")
    assert set(bundle["models"]) == {"volume_lightgbm", "level_lightgbm", "level_lightgbm_balanced"}
