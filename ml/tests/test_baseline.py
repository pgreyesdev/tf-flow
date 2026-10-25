import pandas as pd
import pytest

from tf_flow_ml.models.baseline import (
    HistoricalMeanBaseline,
    HistoricalModeBaseline,
    NotFittedError,
)


@pytest.fixture
def history() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "station_id": [1, 1, 1, 2],
            "direction": [1, 1, 1, -1],
            "day_of_week": [0, 0, 1, 0],
            "hour": [8, 8, 8, 8],
            "vehicles": [100.0, 200.0, 50.0, 10.0],
        }
    )


def test_uses_most_specific_mean(history: pd.DataFrame) -> None:
    model = HistoricalMeanBaseline().fit(history)
    query = pd.DataFrame({"station_id": [1], "direction": [1], "day_of_week": [0], "hour": [8]})

    assert model.predict(query).tolist() == [150.0]


def test_falls_back_to_station_direction_hour(history: pd.DataFrame) -> None:
    model = HistoricalMeanBaseline().fit(history)
    query = pd.DataFrame({"station_id": [1], "direction": [1], "day_of_week": [6], "hour": [8]})

    assert model.predict(query).tolist() == [pytest.approx(350 / 3)]


def test_falls_back_to_global_mean_for_unknown_station(history: pd.DataFrame) -> None:
    model = HistoricalMeanBaseline().fit(history)
    query = pd.DataFrame({"station_id": [99], "direction": [1], "day_of_week": [0], "hour": [3]})

    assert model.predict(query).tolist() == [90.0]


def test_predict_before_fit_fails() -> None:
    query = pd.DataFrame({"station_id": [1], "direction": [1], "day_of_week": [0], "hour": [8]})

    with pytest.raises(NotFittedError):
        HistoricalMeanBaseline().predict(query)


def test_mode_baseline_predicts_the_most_frequent_level() -> None:
    history = pd.DataFrame(
        {
            "station_id": [1, 1, 1, 1, 2],
            "direction": [1, 1, 1, 1, 1],
            "day_of_week": [0, 0, 0, 1, 0],
            "hour": [8, 8, 8, 8, 3],
            "level": ["high", "high", "low", "low", "low"],
        }
    )
    query = pd.DataFrame(
        {
            "station_id": [1, 1, 9],
            "direction": [1, 1, 1],
            "day_of_week": [0, 6, 0],
            "hour": [8, 8, 8],
        }
    )

    model = HistoricalModeBaseline().fit(history)

    assert model.predict(query).tolist() == ["high", "high", "low"]
