"""Instantáneas del dataset: se descarga una vez, se guarda en Parquet y se trabaja en local.

Así los experimentos son reproducibles aunque el Cabildo actualice o retire ficheros, y no se
depende del portal cada vez que se entrena.
"""

import json
import logging
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

from tf_flow_ml.ingestion.ckan import CkanClient

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class SnapshotManifest:
    package_id: str
    file_format: str
    downloaded_at: str
    resources: list[str]
    rows: int
    columns: list[str]


def download_snapshot(
    client: CkanClient, package_id: str, file_format: str, out_dir: Path
) -> SnapshotManifest:
    """Descarga todos los recursos del paquete y escribe ``data.parquet`` y ``manifest.json``."""
    resources = client.list_resources(package_id, file_format)
    df = client.read_package(package_id, file_format)

    out_dir.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out_dir / "data.parquet", index=False)
    manifest = SnapshotManifest(
        package_id=package_id,
        file_format=file_format,
        downloaded_at=datetime.now(UTC).isoformat(timespec="seconds"),
        resources=[r.url for r in resources],
        rows=len(df),
        columns=[str(c) for c in df.columns],
    )
    (out_dir / "manifest.json").write_text(
        json.dumps(asdict(manifest), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    logger.info("Instantánea guardada en %s (%d filas)", out_dir, len(df))
    return manifest
