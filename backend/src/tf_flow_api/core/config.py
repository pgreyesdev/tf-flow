"""Configuración de la aplicación, leída de variables de entorno con prefijo ``TFFLOW_``."""

from enum import StrEnum
from functools import lru_cache

from pydantic import Field
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

    @property
    def docs_enabled(self) -> bool:
        """La documentación interactiva solo se expone fuera de producción."""
        return self.environment is not Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
