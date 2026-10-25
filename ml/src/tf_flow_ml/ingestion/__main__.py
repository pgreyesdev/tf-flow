"""Descarga instantáneas del portal del Cabildo.

Uso: ``uv run python -m tf_flow_ml.ingestion traffic --out data/raw``
"""

import argparse
import logging
from datetime import UTC, datetime
from pathlib import Path

from tf_flow_ml.ingestion.ckan import STATIONS_PACKAGE_ID, TRAFFIC_PACKAGE_ID, CkanClient
from tf_flow_ml.ingestion.snapshot import download_snapshot

DATASETS = {
    "traffic": (TRAFFIC_PACKAGE_ID, "TXT"),
    "stations": (STATIONS_PACKAGE_ID, "CSV"),
}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", choices=sorted(DATASETS))
    parser.add_argument("--out", type=Path, default=Path("data/raw"))
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    package_id, file_format = DATASETS[args.dataset]
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    manifest = download_snapshot(
        CkanClient(), package_id, file_format, args.out / args.dataset / stamp
    )
    print(f"{manifest.rows} filas, columnas: {', '.join(manifest.columns)}")


if __name__ == "__main__":
    main()
