"""Dependencias compartidas por los endpoints."""

from typing import Annotated, cast

from fastapi import Depends, Request

from tf_flow_api.core.config import Settings


def app_settings(request: Request) -> Settings:
    """La configuración con la que se creó la app, para que los tests puedan inyectar la suya."""
    return cast(Settings, request.app.state.settings)


SettingsDep = Annotated[Settings, Depends(app_settings)]
