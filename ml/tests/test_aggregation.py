import pandas as pd
import pytest

from tf_flow_ml.processing.aggregation import SchemaError, aggregate_hourly


def test_lanes_of_the_same_direction_are_summed(raw_traffic: pd.DataFrame) -> None:
    hourly = aggregate_hourly(raw_traffic)

    row = hourly[(hourly["timestamp"] == "2026-03-02 08:00") & (hourly["direction"] == 1)]
    assert row["vehicles"].item() == 165
    assert row["heavy"].item() == 15


def test_direction_comes_from_lane_sign(raw_traffic: pd.DataFrame) -> None:
    hourly = aggregate_hourly(raw_traffic)

    assert set(hourly["direction"]) == {-1, 1}


def test_rows_without_date_are_dropped_and_missing_counts_are_zero(
    raw_traffic: pd.DataFrame,
) -> None:
    hourly = aggregate_hourly(raw_traffic)

    assert len(hourly) == 4
    saturday = hourly[hourly["timestamp"] == "2026-03-07 08:00"]
    assert saturday["vehicles"].item() == 20


def test_calendar_features_use_monday_as_zero(raw_traffic: pd.DataFrame) -> None:
    hourly = aggregate_hourly(raw_traffic).set_index("timestamp")

    assert hourly.loc["2026-03-02 09:00", "day_of_week"] == 0
    assert hourly.loc["2026-03-02 09:00", "hour"] == 9
    assert bool(hourly.loc["2026-03-07 08:00", "is_weekend"])


def test_missing_columns_raise_a_clear_error(raw_traffic: pd.DataFrame) -> None:
    with pytest.raises(SchemaError, match="pesados"):
        aggregate_hourly(raw_traffic.drop(columns=["pesados"]))


def test_range_bins_are_summed_per_direction(raw_traffic: pd.DataFrame) -> None:
    hourly = aggregate_hourly(raw_traffic)

    row = hourly[(hourly["timestamp"] == "2026-03-02 08:00") & (hourly["direction"] == 1)]
    assert row[[f"range_{i}" for i in range(1, 7)]].to_numpy().tolist() == [[0, 15, 150, 0, 0, 0]]
    assert (hourly[[f"range_{i}" for i in range(1, 7)]].sum(axis=1) == hourly["vehicles"]).all()
