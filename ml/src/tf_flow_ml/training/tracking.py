"""Registro de cada entrenamiento en MLflow: configuración, métricas e informe."""

from dataclasses import asdict
from pathlib import Path

import mlflow

from tf_flow_ml.training.pipeline import TrainingConfig, TrainingResult

EXPERIMENT = "tf-flow"


def log_training(
    tracking_uri: str,
    config: TrainingConfig,
    result: TrainingResult,
    report: str,
    artifact_dir: Path,
) -> str:
    """Guarda la ejecución y devuelve su identificador. Los ficheros de las ejecuciones van a
    ``artifact_dir`` cuando el experimento se crea."""
    mlflow.set_tracking_uri(tracking_uri)
    if mlflow.get_experiment_by_name(EXPERIMENT) is None:
        mlflow.create_experiment(EXPERIMENT, artifact_location=artifact_dir.resolve().as_uri())
    mlflow.set_experiment(EXPERIMENT)
    params = {k: v for k, v in asdict(config).items() if k != "thresholds"}
    params |= {f"thresholds.{k}": v for k, v in asdict(config.thresholds).items()}
    params |= {
        "lag_days": result.features.lag_days,
        "window_days": result.features.window_days,
        "train_rows": result.train_rows,
        "test_rows": result.test_rows,
    }
    metrics = {"high_threshold": result.high_threshold}
    for task, models in (("volume", result.volume), ("level", result.level)):
        for model in models:
            for name, value in asdict(model.report).items():
                metrics[f"{task}.{model.name}.{name}"] = value
            metrics[f"{task}.{model.name}.seconds"] = model.seconds
    with mlflow.start_run() as run:
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        mlflow.log_text(report, "entrenamiento.md")
        return str(run.info.run_id)
