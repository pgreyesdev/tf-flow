from pathlib import Path

import joblib
import mlflow
import numpy as np
import pandas as pd
import pytest

from tf_flow_ml.evaluation.explain import shap_values
from tf_flow_ml.evaluation.metrics import ClassificationReport
from tf_flow_ml.models.baseline import NotFittedError
from tf_flow_ml.processing.aggregation import BIN_COLUMNS, add_calendar_features
from tf_flow_ml.training import __main__ as cli
from tf_flow_ml.training.features import FEATURES, FeatureBuilder, recent_profile
from tf_flow_ml.training.pipeline import (
    TrainingConfig,
    TrainingResult,
    label_by_year,
    predict_with_threshold,
    train_and_evaluate,
    tune_high_threshold,
)
from tf_flow_ml.training.report import render_report
from tf_flow_ml.training.tracking import EXPERIMENT

FAST = TrainingConfig(test_from="2025-01-01", n_estimators=10)


@pytest.fixture(scope="module")
def hourly() -> pd.DataFrame:
    """Dos estaciones con ciclo diario; la 2 se atasca en hora punta."""
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
        "lightgbm_threshold",
    ]
    assert result.test["timestamp"].min() >= pd.Timestamp(FAST.test_from)
    random_forest = result.level[1].report
    assert isinstance(random_forest, ClassificationReport)
    assert random_forest.recall_high > 0.9


def test_report_lists_models_and_importances(result: TrainingResult) -> None:
    report = render_report(result, pd.Series({1: "NORTE", 2: "SUR"}))

    assert "## Volumen horario (regresión)" in report
    assert "lightgbm_threshold" in report
    assert "SHAP" in report
    assert "recent_vehicles" in report
    assert "SUR" in report


def test_cli_writes_report_and_models(
    hourly: pd.DataFrame, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    raw = pd.DataFrame({"estacion_id": [1, 2], "estacion_nombre": ["NORTE", "SUR"]})
    monkeypatch.setattr(cli, "load_snapshot", lambda _: raw)
    monkeypatch.setattr(cli, "aggregate_hourly", lambda *_, **__: hourly)

    db = tmp_path / "mlflow.db"
    cli.main(
        [
            *(str(tmp_path), "--out", str(tmp_path / "out"), "--n-estimators", "5"),
            *("--mlflow-uri", f"sqlite:///{db}"),
        ]
    )

    assert "NORTE" in (tmp_path / "out" / "entrenamiento.md").read_text(encoding="utf-8")
    bundle = joblib.load(tmp_path / "out" / "modelos.joblib")
    assert set(bundle["models"]) == {"volume_lightgbm", "level_lightgbm"}
    assert 0 < bundle["high_threshold"] < 1
    runs = mlflow.search_runs(experiment_names=[EXPERIMENT])
    assert len(runs) == 1
    assert "metrics.volume.lightgbm.wape" in runs.columns
    assert list((tmp_path / "out" / "mlruns").rglob("entrenamiento.md"))


def test_recent_profile_only_sees_published_data() -> None:
    stamps = pd.date_range("2025-01-01 08:00", periods=120, freq="D")
    history = pd.DataFrame(
        {
            "timestamp": stamps,
            "station_id": 1,
            "direction": 1,
            "hour": 8,
            "is_weekend": False,
            "vehicles": np.where(stamps < pd.Timestamp("2025-03-01"), 100.0, 500.0),
            "level": np.where(stamps < pd.Timestamp("2025-03-01"), "low", "high"),
        }
    )
    target = history[history["timestamp"].dt.strftime("%m-%d").isin(["03-10", "04-29"])]
    newcomer = target.head(1).assign(station_id=2)

    recent = recent_profile(pd.concat([target, newcomer]), history, lag_days=45, window_days=28)

    # El 10/03 solo se conoce hasta el 24/01; el 29/04, del 16/02 al 15/03 (15 días a 500).
    assert recent["recent_vehicles"].iloc[0] == pytest.approx(100)
    assert recent["recent_vehicles"].iloc[1] == pytest.approx((13 * 100 + 15 * 500) / 28)
    assert recent["recent_high"].iloc[0] == 0
    assert recent["recent_high"].iloc[1] == pytest.approx(15 / 28)
    assert recent.iloc[2].isna().all()


def test_threshold_trades_precision_for_recall() -> None:
    class Stub:
        classes_ = np.array(["high", "low", "medium"], dtype=object)

        def predict_proba(self, _: pd.DataFrame) -> np.ndarray:
            return np.array([[0.4, 0.5, 0.1], [0.2, 0.7, 0.1], [0.1, 0.3, 0.6]])

    features = pd.DataFrame(index=range(3))
    truth = pd.Series(["high", "low", "medium"])

    assert predict_with_threshold(Stub(), features, 0.5).tolist() == ["low", "low", "medium"]
    assert predict_with_threshold(Stub(), features, 0.3).tolist() == ["high", "low", "medium"]
    threshold = tune_high_threshold(Stub(), features, truth)
    assert 0.2 < threshold <= 0.4


def test_shap_values_add_up_to_the_prediction(result: TrainingResult) -> None:
    model = result.models["volume_lightgbm"]
    rows = result.x_test.head(50)

    contributions = shap_values(model, rows)
    bias = model.predict(rows, pred_contrib=True)[:, -1]

    assert np.allclose(contributions.sum(axis=1) + bias, model.predict(rows))
    high = shap_values(result.models["level_lightgbm"], rows, "high")
    assert list(high.columns) == FEATURES


def test_threshold_needs_more_than_a_year_of_training(hourly: pd.DataFrame) -> None:
    recent = hourly[hourly["timestamp"] >= pd.Timestamp("2024-06-01")]

    with pytest.raises(ValueError, match="umbral"):
        train_and_evaluate(recent, FAST)
