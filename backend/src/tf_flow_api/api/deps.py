"""Dependencias compartidas por los endpoints."""

from typing import Annotated, cast

from fastapi import Depends, HTTPException, Request, status

from tf_flow_api.core.config import Settings
from tf_flow_api.services.forecast import ForecastService


def app_settings(request: Request) -> Settings:
    """La configuración con la que se creó la app, para que los tests puedan inyectar la suya."""
    return cast(Settings, request.app.state.settings)


def forecast_service(request: Request) -> ForecastService:
    service = cast(ForecastService | None, request.app.state.forecast)
    if service is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "El modelo no está cargado")
    return service


SettingsDep = Annotated[Settings, Depends(app_settings)]
ForecastDep = Annotated[ForecastService, Depends(forecast_service)]
