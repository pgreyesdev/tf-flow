"""Punto de entrada de la API: ``uvicorn tf_flow_api.main:app``."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tf_flow_api import __version__
from tf_flow_api.api.router import api_router
from tf_flow_api.core.config import Settings, get_settings
from tf_flow_api.core.logging import configure_logging
from tf_flow_api.core.security import add_security_headers


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="TF-FLOW API",
        version=__version__,
        description="Predicción de congestión en las carreteras de Tenerife.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
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
