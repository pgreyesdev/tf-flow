import pandas as pd
import pytest

from tf_flow_ml.processing.aggregation import BIN_COLUMNS
from tf_flow_ml.processing.congestion import (
    CongestionLabeler,
    Level,
    Method,
    NotFittedError,
    Thresholds,
    slow_share,
)


def _hour(
    station: int, vehicles: int, slow: int, when: str = "2025-01-01 08:00"
) -> dict[str, object]:
    bins = [slow, 0, vehicles - slow, 0, 0, 0]
    return {
        "timestamp": pd.Timestamp(when),
        "station_id": station,
        "direction": 1,
        "vehicles": vehicles,
        **dict(zip(BIN_COLUMNS, bins, strict=True)),
    }


@pytest.fixture
def history() -> pd.DataFrame:
    """Estación 1 con 10 % de lentos en fluido; estación 2 urbana, siempre lenta."""
    rows = [_hour(1, v, v // 10) for v in range(100, 1100, 10)]
    rows += [_hour(2, v, v) for v in range(100, 1100, 10)]
    return pd.DataFrame(rows)


def test_slow_share_uses_the_two_slowest_bins_and_handles_empty_hours() -> None:
    df = pd.DataFrame([_hour(1, 100, 30), _hour(1, 0, 0)])

    assert slow_share(df).tolist()[0] == pytest.approx(0.3)
    assert pd.isna(slow_share(df).tolist()[1])


def test_stations_always_slow_have_no_speed_signal(history: pd.DataFrame) -> None:
    labeler = CongestionLabeler().fit(history)

    assert labeler.stations["speed_informative"].to_dict() == {(1, 1): True, (2, 1): False}


@pytest.mark.parametrize(
    ("slow", "expected"),
    [(100, Level.LOW), (200, Level.LOW), (260, Level.MEDIUM), (410, Level.HIGH)],
)
def test_speed_levels_follow_the_excess_over_the_usual(
    history: pd.DataFrame, slow: int, expected: Level
) -> None:
    labeled = CongestionLabeler().fit(history).transform(pd.DataFrame([_hour(1, 1000, slow)]))

    assert labeled["method"].item() == Method.SPEED
    assert labeled["level"].item() == expected
    assert labeled["slow_excess"].item() == pytest.approx(slow / 1000 - 0.1, abs=0.001)


def test_quiet_hours_are_never_congested(history: pd.DataFrame) -> None:
    labeled = CongestionLabeler().fit(history).transform(pd.DataFrame([_hour(1, 100, 100)]))

    assert labeled["level"].item() == Level.LOW


@pytest.mark.parametrize(
    ("vehicles", "expected"), [(500, Level.LOW), (850, Level.MEDIUM), (1000, Level.HIGH)]
)
def test_volume_levels_without_speed_signal(
    history: pd.DataFrame, vehicles: int, expected: Level
) -> None:
    query = pd.DataFrame([_hour(2, vehicles, vehicles)])

    labeled = CongestionLabeler().fit(history).transform(query)

    assert labeled["method"].item() == Method.VOLUME
    assert labeled["level"].item() == expected


def test_unknown_station_is_flagged(history: pd.DataFrame) -> None:
    labeled = CongestionLabeler().fit(history).transform(pd.DataFrame([_hour(9, 500, 50)]))

    assert labeled["level"].item() == Level.UNKNOWN


def test_thresholds_are_configurable(history: pd.DataFrame) -> None:
    strict = CongestionLabeler(Thresholds(speed_medium=0.03)).fit(history)

    assert strict.transform(pd.DataFrame([_hour(1, 1000, 150)]))["level"].item() == Level.MEDIUM


def test_references_use_only_the_most_recent_window() -> None:
    old = [_hour(1, v, v, when="2023-01-01 08:00") for v in range(100, 1100, 10)]
    recent = [_hour(1, v, v // 10, when="2025-01-01 08:00") for v in range(100, 1100, 10)]
    history = pd.DataFrame(old + recent)

    windowed = CongestionLabeler().fit(history)
    everything = CongestionLabeler(Thresholds(window_days=None)).fit(history)

    assert windowed.stations.loc[(1, 1), "baseline_slow"] == pytest.approx(0.1, abs=0.001)
    assert everything.stations.loc[(1, 1), "baseline_slow"] > 0.1


def test_must_fit_first() -> None:
    labeler = CongestionLabeler()

    with pytest.raises(NotFittedError):
        labeler.transform(pd.DataFrame([_hour(1, 100, 10)]))
    with pytest.raises(NotFittedError):
        _ = labeler.stations
