"""Compara el baseline con Random Forest y LightGBM sobre una partición temporal.

Se entrena con los años anteriores a ``test_from`` (sin el estado de alarma de 2020) y se evalúa
con todo lo posterior. Hay dos tareas: el volumen horario (regresión) y el nivel de congestión
del ADR 0006 (clasificación en bajo, medio y alto).
"""

import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor

from tf_flow_ml.evaluation.metrics import (
    ClassificationReport,
    RegressionReport,
    classification_report,
    regression_report,
)
from tf_flow_ml.evaluation.split import temporal_split
from tf_flow_ml.models.baseline import HistoricalMeanBaseline, HistoricalModeBaseline
from tf_flow_ml.processing.calendar import add_holiday_features, in_lockdown
from tf_flow_ml.processing.congestion import CongestionLabeler, Level, Thresholds
from tf_flow_ml.training.features import CATEGORICAL, FeatureBuilder

LABELED_LEVELS = [Level.LOW, Level.MEDIUM, Level.HIGH]


@dataclass(frozen=True, slots=True)
class TrainingConfig:
    test_from: str = "2025-01-01"
    n_estimators: int = 300
    rf_max_samples: float = 0.25
    seed: int = 42
    thresholds: Thresholds = field(default_factory=Thresholds)


@dataclass(slots=True)
class ModelResult:
    name: str
    seconds: float
    report: RegressionReport | ClassificationReport
    predictions: np.ndarray


@dataclass(slots=True)
class TrainingResult:
    train_rows: int
    test_rows: int
    volume: list[ModelResult]
    level: list[ModelResult]
    test: pd.DataFrame
    features: FeatureBuilder
    models: dict[str, Any]


def label_by_year(hourly: pd.DataFrame, thresholds: Thresholds | None = None) -> pd.Series:
    """Nivel de congestión con las referencias de cada año, para que la deriva de una estación
    entre años (obras, cambio de sensor) no se confunda con atascos."""
    levels: list[pd.Series] = []
    for _, year in hourly.groupby(hourly["timestamp"].dt.year):
        labeler = CongestionLabeler(thresholds).fit(year)
        levels.append(labeler.transform(year)["level"])
    labels: pd.Series = pd.concat(levels).reindex(hourly.index)
    return labels


def _timed(fit_predict: Callable[[], np.ndarray]) -> tuple[np.ndarray, float]:
    start = time.perf_counter()
    predictions = fit_predict()
    return predictions, time.perf_counter() - start


def train_and_evaluate(hourly: pd.DataFrame, config: TrainingConfig) -> TrainingResult:
    data = add_holiday_features(hourly)
    data["level"] = label_by_year(data, config.thresholds)
    train, test = temporal_split(data, config.test_from)
    train = train[~in_lockdown(train["timestamp"])]

    features = FeatureBuilder().fit(train)
    x_train, x_test = features.transform(train), features.transform(test)
    rf_options: dict[str, Any] = {
        "n_estimators": config.n_estimators // 2,
        "min_samples_leaf": 10,
        "max_features": 0.6,
        "max_samples": config.rf_max_samples,
        "n_jobs": -1,
        "random_state": config.seed,
    }
    lgbm_options: dict[str, Any] = {
        "n_estimators": config.n_estimators,
        "learning_rate": 0.05,
        "num_leaves": 127,
        "min_child_samples": 50,
        "subsample": 0.8,
        "subsample_freq": 1,
        "colsample_bytree": 0.8,
        "random_state": config.seed,
        "verbose": -1,
    }
    models: dict[str, Any] = {}

    def fit_lgbm(name: str, model: Any, x: pd.DataFrame, y: pd.Series) -> Callable[[], Any]:
        def run() -> np.ndarray:
            model.fit(x, y, categorical_feature=CATEGORICAL)
            models[name] = model
            return np.asarray(model.predict(x_test.loc[:, x.columns]))

        return run

    y_volume = train["vehicles"]
    volume_candidates: dict[str, Callable[[], np.ndarray]] = {
        "baseline": lambda: HistoricalMeanBaseline().fit(train).predict(test),
        "random_forest": lambda: (
            RandomForestRegressor(**rf_options).fit(x_train, y_volume).predict(x_test)
        ),
        "lightgbm": fit_lgbm("volume_lightgbm", LGBMRegressor(**lgbm_options), x_train, y_volume),
    }
    volume = []
    for name, run in volume_candidates.items():
        predictions, seconds = _timed(run)
        report = regression_report(test["vehicles"], predictions)
        volume.append(ModelResult(name, seconds, report, predictions))

    labeled_train = train["level"].isin(LABELED_LEVELS)
    labeled_test = test["level"].isin(LABELED_LEVELS).to_numpy()
    y_level = train.loc[labeled_train, "level"].astype(str)
    x_level = x_train[labeled_train]
    level_candidates: dict[str, Callable[[], np.ndarray]] = {
        "baseline": lambda: HistoricalModeBaseline().fit(train[labeled_train]).predict(test),
        "random_forest": lambda: (
            RandomForestClassifier(**rf_options, class_weight="balanced_subsample")
            .fit(x_level, y_level)
            .predict(x_test)
        ),
        "lightgbm": fit_lgbm("level_lightgbm", LGBMClassifier(**lgbm_options), x_level, y_level),
        "lightgbm_balanced": fit_lgbm(
            "level_lightgbm_balanced",
            LGBMClassifier(**lgbm_options, class_weight="balanced"),
            x_level,
            y_level,
        ),
    }
    level = []
    truth = test["level"].astype(str).to_numpy()[labeled_test]
    for name, run in level_candidates.items():
        predictions, seconds = _timed(run)
        scores = classification_report(truth, np.asarray(predictions)[labeled_test])
        level.append(ModelResult(name, seconds, scores, np.asarray(predictions)))

    return TrainingResult(
        train_rows=len(train),
        test_rows=len(test),
        volume=volume,
        level=level,
        test=test,
        features=features,
        models=models,
    )
