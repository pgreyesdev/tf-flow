"""Descarga instantáneas del portal del Cabildo.

Uso: ``uv run python -m tf_flow_ml.ingestion traffic --years 2019-2026 --out data/raw``
"""

import argparse
import logging
from datetime import UTC, datetime
from pathlib import Path

from tf_flow_ml.ingestion.ckan import STATIONS_PACKAGE_ID, TRAFFIC_PACKAGE_IDS, CkanClient
from tf_flow_ml.ingestion.snapshot import download_snapshot


def parse_years(value: str) -> list[int]:
    """``2024`` o ``2019-2026``, limitado a los años publicados."""
    first, _, last = value.partition("-")
    years = list(range(int(first), int(last or first) + 1))
    unknown = [y for y in years if y not in TRAFFIC_PACKAGE_IDS]
    if unknown:
        raise argparse.ArgumentTypeError(f"Años sin datos publicados: {unknown}")
    return years


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dataset", choices=["stations", "traffic"])
    parser.add_argument(
        "--years",
        type=parse_years,
        default=sorted(TRAFFIC_PACKAGE_IDS),
        help="solo para traffic; por defecto todos los años",
    )
    parser.add_argument("--out", type=Path, default=Path("data/raw"))
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.dataset == "traffic":
        package_ids, file_format = [TRAFFIC_PACKAGE_IDS[y] for y in args.years], "TXT"
    else:
        package_ids, file_format = [STATIONS_PACKAGE_ID], "CSV"
    stamp = datetime.now(UTC).strftime("%Y%m%d")
    manifest = download_snapshot(
        CkanClient(), package_ids, file_format, args.out / args.dataset / stamp
    )
    print(f"{len(manifest.parts)} ficheros, {manifest.rows} filas")


if __name__ == "__main__":
    main()
