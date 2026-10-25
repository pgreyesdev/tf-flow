"""Logging en una línea por evento: fácil de leer en local y de filtrar en producción."""

import logging
import sys

_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(_FORMAT))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
