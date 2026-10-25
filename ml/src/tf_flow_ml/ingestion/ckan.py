"""Cliente del portal de datos abiertos del Cabildo de Tenerife (CKAN).

El Cabildo publica la intensidad de tráfico como un paquete por año y, dentro de cada paquete, un
fichero por mes. Por eso el cliente devuelve todos los recursos que coinciden en vez de quedarse
con el primero.
"""

import io
import logging
from dataclasses import dataclass
from typing import Any, Final

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

TENERIFE_CKAN_URL: Final = "https://datos.tenerife.es/ckan"
TRAFFIC_PACKAGE_IDS: Final = {
    2019: "d3cabcfa-e2dc-48c5-8203-3a254d4505d6",
    2020: "49114bab-de2a-4541-9952-c53cd9c752f6",
    2021: "24bd44b1-1a43-4182-bad5-8be793964941",
    2022: "b5534fca-4dfd-4721-9407-24e2adf23150",
    2023: "68d71276-ddf6-4be9-9cee-7f56637b71e7",
    2024: "e4cf320e-dda5-4b9a-bae3-ec3d6a252c80",
    2025: "94a021a2-1dea-4526-9e17-3290b3b9add3",
    2026: "d02ccf54-aca2-4a82-9ef0-fbd285b5f401",
}
"""Paquete de intensidad de tráfico de cada año en el portal."""
STATIONS_PACKAGE_ID: Final = "a114f82b-bb62-47e0-94bb-bebb484514a7"


class CkanError(RuntimeError):
    """El portal respondió con un error o con un formato inesperado."""


@dataclass(frozen=True, slots=True)
class Resource:
    id: str
    name: str
    format: str
    url: str


class CkanClient:
    def __init__(
        self,
        base_url: str = TENERIFE_CKAN_URL,
        *,
        timeout: float = 30.0,
        client: httpx.Client | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = client or httpx.Client(timeout=timeout, follow_redirects=True)

    def list_resources(self, package_id: str, file_format: str) -> list[Resource]:
        """Recursos del paquete con el formato pedido (sin distinguir mayúsculas)."""
        package = self._action("package_show", {"id": package_id})
        resources = [
            Resource(
                id=r["id"], name=r.get("name") or r["id"], format=r.get("format", ""), url=r["url"]
            )
            for r in package.get("resources", [])
            if r.get("format", "").upper() == file_format.upper()
        ]
        if not resources:
            raise CkanError(f"El paquete {package_id} no tiene recursos en formato {file_format}")
        return resources

    def read_csv(self, resource: Resource) -> pd.DataFrame:
        logger.info("Descargando recurso %s (%s)", resource.name, resource.url)
        response = self._client.get(resource.url)
        response.raise_for_status()
        return pd.read_csv(io.BytesIO(response.content))

    def read_package(self, package_id: str, file_format: str) -> pd.DataFrame:
        """Descarga y concatena todos los recursos del formato pedido."""
        frames = [self.read_csv(r) for r in self.list_resources(package_id, file_format)]
        return pd.concat(frames, ignore_index=True)

    def _action(self, action: str, params: dict[str, str]) -> dict[str, Any]:
        try:
            response = self._client.get(f"{self._base_url}/api/3/action/{action}", params=params)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise CkanError(f"Fallo al llamar a {action}: {exc}") from exc
        if not body.get("success"):
            raise CkanError(f"{action} devolvió un error: {body.get('error')}")
        result: dict[str, Any] = body["result"]
        return result
