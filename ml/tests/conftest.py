import numpy as np
import pandas as pd
import pytest

from tf_flow_ml.processing.aggregation import BIN_COLUMNS, add_calendar_features


@pytest.fixture
def raw_traffic() -> pd.DataFrame:
    """Muestra con la forma del fichero del Cabildo: un registro por carril y hora."""
    return pd.DataFrame(
        {
            "fecha": [
                "2026-03-02 08:00",
                "2026-03-02 08:00",
                "2026-03-02 08:00",
                "2026-03-02 09:00",
                "2026-03-07 08:00",
                None,
            ],
            "estacion_id": [11, 11, 11, 11, 11, 11],
            "estacion_nombre": ["AÑAZA"] * 6,
            "carril_id": [1, 2, -1, 1, 1, 1],
            "carril_descripcion": ["C. Lento", "Salida a Añaza", "D. Lento"] + ["C. Lento"] * 3,
            "ligeros": [100, 50, 80, 60, 20, 5],
            "pesados": [10, 5, 8, 6, None, 1],
            "rango1_vehiculos": [0, 0, 8, 0, 0, 0],
            "rango2_vehiculos": [10, 5, 80, 6, 20, 6],
            "rango3_vehiculos": [100, 50, 0, 60, 0, 0],
            "rango4_vehiculos": [0, 0, 0, 0, 0, 0],
            "rango5_vehiculos": [0, 0, 0, 0, 0, 0],
            "rango6_vehiculos": [0, 0, 0, 0, 0, 0],
        }
    )


@pytest.fixture(scope="session")
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
