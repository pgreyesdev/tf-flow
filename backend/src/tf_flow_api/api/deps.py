"""Dependencias compartidas por los endpoints."""

import hmac
import math
from typing import Annotated, cast

from fastapi import Depends, Header, HTTPException, Request, status

from tf_flow_api.core.config import Settings
from tf_flow_api.core.rate_limit import RateLimiter
from tf_flow_api.services.assistant import AssistantService
from tf_flow_api.services.forecast import ForecastService


def app_settings(request: Request) -> Settings:
    """La configuración con la que se creó la app, para que los tests puedan inyectar la suya."""
    return cast(Settings, request.app.state.settings)


def forecast_service(request: Request) -> ForecastService:
    service = cast(ForecastService | None, request.app.state.forecast)
    if service is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "El modelo no está cargado")
    return service


def assistant_service(
    request: Request,
    settings: Annotated[Settings, Depends(app_settings)],
    token: Annotated[str | None, Header(alias="X-Assistant-Token")] = None,
) -> AssistantService:
    """El asistente gasta dinero: puede exigir un token y tiene su propio límite por cliente."""
    expected = settings.assistant_access_token
    if expected is not None and not hmac.compare_digest(
        (token or "").encode(), expected.get_secret_value().encode()
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token del asistente")
    service = cast(AssistantService | None, request.app.state.assistant)
    if service is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "El asistente no está activado")
    limiter = cast(RateLimiter, request.app.state.assistant_limiter)
    wait = limiter.acquire(request.client.host if request.client else "desconocido")
    if wait:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Demasiadas preguntas seguidas, espera un momento",
            headers={"Retry-After": str(math.ceil(wait))},
        )
    return service


SettingsDep = Annotated[Settings, Depends(app_settings)]
ForecastDep = Annotated[ForecastService, Depends(forecast_service)]
AssistantDep = Annotated[AssistantService, Depends(assistant_service)]
