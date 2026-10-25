"""Instantáneas del dataset: se descarga una vez, se guarda en Parquet y se trabaja en local.

Así los experimentos son reproducibles aunque el Cabildo actualice o retire ficheros, y no se
depende del portal cada vez que se entrena. Cada recurso se guarda en su propio fichero, de modo
que años de datos no tienen que caber a la vez en memoria y una descarga cortada se puede retomar.
"""

import json
import logging
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import pandas as pd

from tf_flow_ml.ingestion.ckan import CkanClient

logger = logging.getLogger(__name__)

MANIFEST_NAME = "manifest.json"


@dataclass(frozen=True, slots=True)
class SnapshotPart:
    package_id: str
    name: str
    url: str
    file: str
    rows: int
    columns: list[str]


@dataclass(frozen=True, slots=True)
class SnapshotManifest:
    file_format: str
    downloaded_at: str
    parts: list[SnapshotPart]

    @property
    def rows(self) -> int:
        return sum(part.rows for part in self.parts)


def download_snapshot(
    client: CkanClient, package_ids: Sequence[str], file_format: str, out_dir: Path
) -> SnapshotManifest:
    """Guarda cada recurso de los paquetes en ``<id>.parquet`` y escribe ``manifest.json``.

    Los recursos que ya están en ``out_dir`` no se vuelven a descargar.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    parts: list[SnapshotPart] = []
    for package_id in package_ids:
        for resource in client.list_resources(package_id, file_format):
            path = out_dir / f"{resource.id}.parquet"
            if path.exists():
                df = pd.read_parquet(path)
            else:
                df = client.read_csv(resource)
                df.to_parquet(path, index=False)
            parts.append(
                SnapshotPart(
                    package_id=package_id,
                    name=resource.name,
                    url=resource.url,
                    file=path.name,
                    rows=len(df),
                    columns=[str(c) for c in df.columns],
                )
            )

    manifest = SnapshotManifest(
        file_format=file_format,
        downloaded_at=datetime.now(UTC).isoformat(timespec="seconds"),
        parts=parts,
    )
    (out_dir / MANIFEST_NAME).write_text(
        json.dumps(asdict(manifest), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    logger.info(
        "Instantánea guardada en %s (%d ficheros, %d filas)", out_dir, len(parts), manifest.rows
    )
    return manifest


def load_snapshot(snapshot_dir: Path, columns: Sequence[str] | None = None) -> pd.DataFrame:
    """Une todos los ficheros de la instantánea, leyendo solo las columnas pedidas."""
    files = sorted(snapshot_dir.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"No hay ficheros Parquet en {snapshot_dir}")
    selected = list(columns) if columns is not None else None
    return pd.concat([pd.read_parquet(f, columns=selected) for f in files], ignore_index=True)
