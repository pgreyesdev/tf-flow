"""Arranca la API con un paquete de modelo real y comprueba que responde previsiones.

Uso: ``uv run python backend/scripts/smoke_test.py artifacts/serving.joblib``
"""

import sys
from pathlib import Path

from fastapi.testclient import TestClient

from tf_flow_api.core.config import Environment, Settings
from tf_flow_api.main import create_app


def main(bundle: Path) -> None:
    digest = bundle.with_name(bundle.name + ".sha256").read_text(encoding="utf-8").split()[0]
    settings = Settings(environment=Environment.TEST, model_path=bundle, model_sha256=digest)
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/health").json()["model_loaded"] is True
        stations = client.get("/api/v1/stations").json()
        station = stations[0]
        forecast = client.get(
            f"/api/v1/stations/{station['station_id']}/forecast",
            params={"direction": station["direction"]},
        )
        assert forecast.is_success, forecast.text
        worst = forecast.json()["worst_hour"]
        sys.stdout.write(
            f"{len(stations)} estaciones. {station['name']}: hora de más riesgo "
            f"{worst['time']} ({worst['level']}, {worst['probability_high']:.0%})\n"
        )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
