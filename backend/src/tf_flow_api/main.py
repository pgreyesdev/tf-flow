"""Punto de entrada de la API: ``uvicorn tf_flow_api.main:app``."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from threading import Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from tf_flow_api import __version__
from tf_flow_api.api.router import api_router
from tf_flow_api.core.config import Settings, get_settings
from tf_flow_api.core.logging import configure_logging
from tf_flow_api.core.rate_limit import RateLimiter, rate_limit_middleware
from tf_flow_api.core.security import add_security_headers
from tf_flow_api.services.assistant import AssistantService, TokenBudget
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


def build_assistant(
    settings: Settings, forecast: ForecastService | None
) -> AssistantService | None:
    """El asistente necesita la clave de OpenAI y el modelo de previsión."""
    if settings.openai_api_key is None or forecast is None:
        return None
    client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=60)
    return AssistantService(
        client.responses,
        forecast,
        model=settings.assistant_model,
        effort=settings.assistant_effort,
        budget=TokenBudget(settings.assistant_daily_token_budget),
    )


def create_app(
    settings: Settings | None = None,
    forecast: ForecastService | None = None,
    assistant: AssistantService | None = None,
) -> FastAPI:
    """``forecast`` y ``assistant`` permiten a los tests inyectar servicios; si faltan, se crean
    a partir de la configuración."""
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.forecast = forecast or load_forecast_service(settings)
        if forecast is None and app.state.forecast is not None:
            # En segundo plano: la API responde desde el primer momento y, mientras, va dejando
            # calculada la semana de cada estación.
            Thread(target=app.state.forecast.warm_up, name="warm-up", daemon=True).start()
        app.state.assistant = assistant or build_assistant(settings, app.state.forecast)
        app.state.assistant_limiter = RateLimiter(settings.assistant_rate_limit_per_minute)
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
        allow_headers=["Content-Type", "X-Assistant-Token"],
    )
    app.middleware("http")(rate_limit_middleware(RateLimiter(settings.rate_limit_per_minute)))
    app.middleware("http")(add_security_headers)
    app.include_router(api_router)
    return app


app = create_app()
