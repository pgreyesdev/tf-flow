import datetime as dt
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from tf_flow_api.api.deps import ForecastDep
from tf_flow_api.domain.forecast import DayForecast, ModelInfo, NetworkNow, Station
from tf_flow_api.services.forecast import DateOutOfRangeError, StationNotFoundError

router = APIRouter(tags=["previsiones"])


@router.get("/stations", summary="Estaciones de aforo con previsión")
def list_stations(service: ForecastDep) -> list[Station]:
    return service.stations()


@router.get(
    "/stations/{station_id}/forecast",
    summary="Previsión hora a hora de un día",
    responses={
        404: {"description": "Estación desconocida"},
        422: {"description": "Fecha fuera de rango"},
    },
)
def day_forecast(
    service: ForecastDep,
    station_id: Annotated[int, Path(ge=1, le=99_999)],
    direction: Annotated[
        int, Query(ge=-1, le=1, description="1 creciente, -1 decreciente, 0 único")
    ],
    date: Annotated[dt.date | None, Query(description="Por defecto, hoy en Tenerife")] = None,
) -> DayForecast:
    try:
        return service.day_forecast(station_id, direction, date)
    except StationNotFoundError as error:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(error)) from error
    except DateOutOfRangeError as error:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(error)) from error


@router.get("/network/now", summary="Previsión de la hora actual en todas las estaciones")
def network_now(service: ForecastDep) -> NetworkNow:
    return service.network_now()


@router.get("/model", summary="Datos y métricas del modelo en servicio")
def model_info(service: ForecastDep) -> ModelInfo:
    return service.model_info()
