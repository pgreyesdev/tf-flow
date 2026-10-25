import pandas as pd
import pytest


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
