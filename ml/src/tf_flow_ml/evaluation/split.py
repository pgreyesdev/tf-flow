"""Particiones temporales: el modelo solo aprende del pasado y se evalúa en el futuro."""

import pandas as pd


def temporal_split(
    df: pd.DataFrame, cutoff: str | pd.Timestamp, time_column: str = "timestamp"
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Todo lo anterior a ``cutoff`` es entrenamiento; desde ``cutoff`` en adelante, test."""
    cutoff_ts = pd.Timestamp(cutoff)
    is_train = df[time_column] < cutoff_ts
    train, test = df[is_train], df[~is_train]
    if train.empty or test.empty:
        raise ValueError(f"La fecha de corte {cutoff_ts} deja vacío el entrenamiento o el test")
    return train, test
