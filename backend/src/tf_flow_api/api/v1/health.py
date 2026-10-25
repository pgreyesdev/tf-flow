from fastapi import APIRouter

from tf_flow_api.api.deps import SettingsDep
from tf_flow_api.services.health import HealthStatus, get_health

router = APIRouter(tags=["health"])


@router.get("/health", summary="Estado del servicio")
def health(settings: SettingsDep) -> HealthStatus:
    return get_health(settings)
