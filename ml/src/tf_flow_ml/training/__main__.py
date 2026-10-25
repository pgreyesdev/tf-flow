"""Entrena y compara los modelos con una instantánea del Cabildo.

Uso: ``uv run python -m tf_flow_ml.training data/raw/traffic/AAAAMMDD --out artifacts``
"""

import argparse
import logging
from pathlib import Path
from typing import cast

import joblib

from tf_flow_ml.evaluation.metrics import ClassificationReport, RegressionReport
from tf_flow_ml.ingestion.snapshot import load_snapshot
from tf_flow_ml.processing.aggregation import aggregate_hourly
from tf_flow_ml.serving.bundle import build_bundle, save_bundle
from tf_flow_ml.training.pipeline import TrainingConfig, TrainingResult, train_and_evaluate
from tf_flow_ml.training.report import render_report

logger = logging.getLogger(__name__)


DEFAULTS = TrainingConfig()


def _serving_metrics(result: TrainingResult) -> dict[str, float]:
    """Métricas en test de los modelos que se sirven, para mostrarlas en la web."""
    volume = cast(RegressionReport, next(r.report for r in result.volume if r.name == "lightgbm"))
    level = cast(
        ClassificationReport, next(r.report for r in result.level if r.name == "lightgbm_threshold")
    )
    return {
        "volume_wape": volume.wape,
        "high_precision": level.precision_high,
        "high_recall": level.recall_high,
    }


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("--out", type=Path, default=Path("artifacts"))
    parser.add_argument("--test-from", default=DEFAULTS.test_from)
    parser.add_argument("--n-estimators", type=int, default=DEFAULTS.n_estimators)
    parser.add_argument(
        "--mlflow-uri",
        help="registra la ejecución en MLflow, por ejemplo sqlite:///artifacts/mlflow.db",
    )
    parser.add_argument(
        "--mlflow-artifacts",
        type=Path,
        help="carpeta de ficheros de MLflow; por defecto OUT/mlruns",
    )
    parser.add_argument(
        "--serving-bundle",
        type=Path,
        help="reentrena LightGBM con todo el histórico y guarda el paquete que sirve la API",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    raw = load_snapshot(args.snapshot_dir)
    names = raw.drop_duplicates("estacion_id").set_index("estacion_id")["estacion_nombre"]
    hourly = aggregate_hourly(raw, mainline_only=True)
    del raw
    logger.info("Entrenando con %s horas por estación y sentido", f"{len(hourly):,}")

    config = TrainingConfig(test_from=args.test_from, n_estimators=args.n_estimators)
    result = train_and_evaluate(hourly, config)

    args.out.mkdir(parents=True, exist_ok=True)
    report = render_report(result, names)
    (args.out / "entrenamiento.md").write_text(report, encoding="utf-8")
    joblib.dump(
        {
            "config": config,
            "features": result.features,
            "models": result.models,
            "high_threshold": result.high_threshold,
        },
        args.out / "modelos.joblib",
        compress=3,
    )
    logger.info("Informe y modelos guardados en %s", args.out)
    if args.serving_bundle:
        metrics = _serving_metrics(result)
        bundle = build_bundle(result.data, names, config, result.high_threshold, metrics)
        digest = save_bundle(bundle, args.serving_bundle)
        logger.info("Paquete para la API en %s (sha256 %s)", args.serving_bundle, digest)
    if args.mlflow_uri:
        from tf_flow_ml.training.tracking import log_training  # noqa: PLC0415 (extra opcional)

        artifacts = args.mlflow_artifacts or args.out / "mlruns"
        run_id = log_training(args.mlflow_uri, config, result, report, artifacts)
        logger.info("Ejecución %s registrada en MLflow", run_id)


if __name__ == "__main__":
    main()
