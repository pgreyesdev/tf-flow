"""Punto de entrada de la API: ``uvicorn tf_flow_api.main:app``."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tf_flow_api import __version__
from tf_flow_api.api.router import api_router
from tf_flow_api.core.config import Settings, get_settings
from tf_flow_api.core.logging import configure_logging
from tf_flow_api.core.security import add_security_headers
from tf_flow_api.services.forecast import ForecastService
from tf_flow_ml.serving.bundle import load_bundle
from tf_flow_ml.serving.predictor import Predictor

logger = logging.getLogger(__name__)


def load_forecast_service(settings: Settings) -> ForecastService | None:
    """Carga el modelo configurado. Sin modelo la API arranca, pero las previsiones dan 503."""
    if settings.model_path is None:
        logger.warning("TFFLOW_MODEL_PATH no está definido: las previsiones no estarán disponibles")
        return None
    if settings.model_sha256 is None:
        raise RuntimeError("Define TFFLOW_MODEL_SHA256 para cargar el modelo")
    bundle = load_bundle(settings.model_path, settings.model_sha256)
    logger.info("Modelo cargado con datos hasta %s", bundle.data_until)
    return ForecastService(Predictor(bundle), settings.max_forecast_days)


def create_app(
    settings: Settings | None = None, forecast: ForecastService | None = None
) -> FastAPI:
    """``forecast`` permite a los tests inyectar un servicio; si falta, se carga el modelo."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.forecast = forecast or load_forecast_service(settings)
        yield

    app = FastAPI(
        title="TF-FLOW API",
        version=__version__,
        description="Predicción de congestión en las carreteras de Tenerife.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    app.middleware("http")(add_security_headers)
    app.include_router(api_router)
    return app


app = create_app()
