"""Configuración de la aplicación, leída de variables de entorno con prefijo ``TFFLOW_``."""

from enum import StrEnum
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TFFLOW_", env_file=".env", extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    log_level: str = "INFO"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    model_path: Path | None = None
    """Paquete del modelo generado por el flujo de entrenamiento (``serving.joblib``)."""
    model_sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    """Huella esperada del paquete; sin ella no se carga."""
    max_forecast_days: int = Field(default=14, ge=1, le=60)
    incidents_feed_url: str = "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v36.xml"
    """Incidencias en directo de la DGT (DATEX II v3.6)."""
    incidents_refresh_seconds: int = Field(default=300, ge=60)
    """Cada cuánto se vuelve a leer como mucho la DGT: el fichero es de toda España."""
    rate_limit_per_minute: int = Field(default=60, ge=1)
    """Peticiones por minuto y cliente; ``/health`` no cuenta."""

    openai_api_key: SecretStr | None = None
    """Sin clave, el asistente está desactivado y su ruta responde 503."""
    assistant_model: str = "gpt-5.4-mini"
    assistant_effort: Literal["low", "medium", "high"] = "low"
    assistant_access_token: SecretStr | None = None
    """Si se define, el asistente exige la cabecera ``X-Assistant-Token`` con este valor."""
    assistant_daily_token_budget: int = Field(default=300_000, ge=1)
    """Tokens (entrada y salida) que el asistente puede gastar al día entre todos los usuarios."""
    assistant_rate_limit_per_minute: int = Field(default=6, ge=1)

    @property
    def docs_enabled(self) -> bool:
        """La documentación interactiva solo se expone fuera de producción."""
        return self.environment is not Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
