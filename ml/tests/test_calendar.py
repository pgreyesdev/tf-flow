from datetime import date

import pandas as pd

from tf_flow_ml.processing.calendar import add_holiday_features, in_lockdown, tenerife_holidays


def test_includes_canary_and_island_holidays() -> None:
    days = tenerife_holidays([2025, 2025])

    assert date(2025, 5, 30) in days  # Día de Canarias
    assert date(2025, 2, 2) in days  # Candelaria, festivo insular
    assert date(2025, 1, 6) in days


def test_flags_holidays_and_bridges() -> None:
    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(
                ["2025-12-08 09:00", "2025-12-26 08:00", "2025-12-05 08:00", "2025-03-10 08:00"]
            )
        }
    )

    out = add_holiday_features(df)

    assert out["is_holiday"].tolist() == [True, False, False, False]
    # 26/12/2025 es viernes tras el jueves de Navidad; 5/12 es viernes pero el festivo es sábado.
    assert out["is_bridge"].tolist() == [False, True, False, False]


def test_monday_before_a_tuesday_holiday_is_a_bridge() -> None:
    out = add_holiday_features(pd.DataFrame({"timestamp": pd.to_datetime(["2026-12-07"])}))

    assert out["is_bridge"].tolist() == [True]


def test_lockdown_window() -> None:
    stamps = pd.Series(pd.to_datetime(["2020-03-13", "2020-04-01", "2020-06-21", "2021-04-01"]))

    assert in_lockdown(stamps).tolist() == [False, True, False, False]
