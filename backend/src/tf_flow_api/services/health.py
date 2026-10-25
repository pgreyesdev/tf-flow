"""Estado del servicio, usado por el orquestador de contenedores y por la monitorización."""

from pydantic import BaseModel

from tf_flow_api import __version__
from tf_flow_api.core.config import Settings


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str
    model_loaded: bool


def get_health(settings: Settings, model_loaded: bool) -> HealthStatus:
    return HealthStatus(
        status="ok",
        version=__version__,
        environment=settings.environment,
        model_loaded=model_loaded,
    )
