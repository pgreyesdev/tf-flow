import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from tf_flow_api.api.deps import RouteDep
from tf_flow_api.domain.routes import Place, RoutePlan
from tf_flow_api.services.forecast import DateOutOfRangeError
from tf_flow_api.services.places import PLACES, place_by_id
from tf_flow_api.services.routes import RoutingUnavailableError

router = APIRouter(tags=["rutas"])

PlaceId = Annotated[str, Query(min_length=1, max_length=60, pattern=r"^[a-z0-9-]+$")]


@router.get("/places", summary="Lugares que se pueden usar como origen o destino")
def list_places() -> list[Place]:
    return PLACES


@router.get(
    "/routes",
    summary="Rutas entre dos lugares con la previsión de sus aforos y las incidencias",
    responses={
        404: {"description": "Lugar desconocido"},
        422: {"description": "Mismo origen y destino, o fecha fuera de rango"},
        503: {"description": "El servidor de rutas no responde"},
    },
)
async def routes(
    service: RouteDep,
    origin: PlaceId,
    destination: PlaceId,
    date: Annotated[dt.date | None, Query(description="Por defecto, hoy en Tenerife")] = None,
    hour: Annotated[
        int | None, Query(ge=0, le=23, description="Hora de salida; por defecto, ahora")
    ] = None,
) -> RoutePlan:
    start, end = place_by_id(origin), place_by_id(destination)
    if start is None or end is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lugar desconocido")
    if start.id == end.id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "El origen y el destino son el mismo"
        )
    try:
        return await service.plan(start, end, service.departure(date, hour))
    except DateOutOfRangeError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error
    except RoutingUnavailableError as error:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(error)) from error
