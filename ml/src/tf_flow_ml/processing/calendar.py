"""Festivos de Tenerife y periodos anómalos que el modelo tiene que conocer."""

from collections.abc import Iterable
from datetime import date, timedelta
from typing import Final

import holidays
import pandas as pd

ISLAND_HOLIDAY: Final = (2, 2)
"""Virgen de la Candelaria, festivo insular de Tenerife (2 de febrero)."""

LOCKDOWN: Final = (pd.Timestamp("2020-03-14"), pd.Timestamp("2020-06-21"))
"""Estado de alarma de 2020: el tráfico de esas semanas no representa el comportamiento normal."""


def tenerife_holidays(years: Iterable[int]) -> set[date]:
    """Festivos nacionales y de Canarias más el insular de Tenerife."""
    years = sorted(set(years))
    days = set(holidays.country_holidays("ES", subdiv="CN", years=years))
    days |= {date(year, *ISLAND_HOLIDAY) for year in years}
    return days


def add_holiday_features(df: pd.DataFrame) -> pd.DataFrame:
    """Añade ``is_holiday`` e ``is_bridge``.

    Un puente es un lunes antes de un martes festivo o un viernes después de un jueves festivo:
    mucha gente no trabaja y el tráfico se parece más al de un festivo que al de un laborable.
    """
    out = df.copy()
    day = out["timestamp"].dt.normalize()
    festive = {pd.Timestamp(d) for d in tenerife_holidays(day.dt.year.unique().tolist())}
    out["is_holiday"] = day.isin(festive)
    next_day = (day + timedelta(days=1)).isin(festive)
    previous_day = (day - timedelta(days=1)).isin(festive)
    weekday = day.dt.day_of_week
    out["is_bridge"] = ~out["is_holiday"] & (
        ((weekday == 0) & next_day) | ((weekday == 4) & previous_day)  # noqa: PLR2004
    )
    return out


def in_lockdown(timestamps: pd.Series) -> pd.Series:
    start, end = LOCKDOWN
    return timestamps.between(start, end, inclusive="left")
