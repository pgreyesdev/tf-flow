from fastapi import APIRouter

from tf_flow_api.api.deps import IncidentDep
from tf_flow_api.domain.incidents import IncidentsNow

router = APIRouter(tags=["incidencias"])


@router.get("/incidents", summary="Incidencias de tráfico en Tenerife ahora, según la DGT")
async def incidents(service: IncidentDep) -> IncidentsNow:
    return await service.current()
