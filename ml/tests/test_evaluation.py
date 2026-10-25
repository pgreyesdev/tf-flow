import math

import pandas as pd
import pytest

from tf_flow_ml.evaluation.metrics import classification_report, regression_report
from tf_flow_ml.evaluation.split import temporal_split


def test_temporal_split_keeps_the_future_out_of_training() -> None:
    df = pd.DataFrame({"timestamp": pd.date_range("2026-01-01", periods=10, freq="D")})

    train, test = temporal_split(df, "2026-01-08")

    assert train["timestamp"].max() < test["timestamp"].min()
    assert (len(train), len(test)) == (7, 3)


def test_temporal_split_rejects_empty_partitions() -> None:
    df = pd.DataFrame({"timestamp": pd.date_range("2026-01-01", periods=3, freq="D")})

    with pytest.raises(ValueError, match="vacío"):
        temporal_split(df, "2025-01-01")


def test_regression_report() -> None:
    report = regression_report([100, 200], [110, 170])

    assert report.mae == 20
    assert report.rmse == pytest.approx(math.sqrt(500))
    assert report.wape == pytest.approx(40 / 300)


def test_wape_is_nan_when_there_is_no_traffic() -> None:
    assert math.isnan(regression_report([0, 0], [1, 1]).wape)


def test_classification_report_focuses_on_heavy_congestion() -> None:
    truth = ["low", "low", "high", "high", "medium"]
    pred = ["low", "high", "high", "low", "medium"]

    report = classification_report(truth, pred)

    assert report.precision_high == pytest.approx(0.5)
    assert report.recall_high == pytest.approx(0.5)
    assert report.balanced_accuracy == pytest.approx((0.5 + 0.5 + 1) / 3)
    assert 0 < report.macro_f1 < 1
