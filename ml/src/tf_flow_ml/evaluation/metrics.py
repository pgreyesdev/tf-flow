from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from sklearn.metrics import (
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    recall_score,
)


@dataclass(frozen=True, slots=True)
class RegressionReport:
    mae: float
    rmse: float
    wape: float
    """Error absoluto ponderado: suma de errores entre suma del volumen real. Robusto a ceros."""


def regression_report(y_true: npt.ArrayLike, y_pred: npt.ArrayLike) -> RegressionReport:
    true = np.asarray(y_true, dtype=float)
    pred = np.asarray(y_pred, dtype=float)
    total = np.abs(true).sum()
    return RegressionReport(
        mae=float(mean_absolute_error(true, pred)),
        rmse=float(np.sqrt(mean_squared_error(true, pred))),
        wape=float(np.abs(true - pred).sum() / total) if total else float("nan"),
    )


@dataclass(frozen=True, slots=True)
class ClassificationReport:
    macro_f1: float
    balanced_accuracy: float
    precision_high: float
    """De las horas que el modelo marca como atasco fuerte, cuántas lo fueron."""
    recall_high: float
    """De las horas con atasco fuerte, cuántas detectó el modelo."""


def classification_report(
    y_true: npt.ArrayLike, y_pred: npt.ArrayLike, positive: str = "high"
) -> ClassificationReport:
    true = np.asarray(y_true, dtype=object)
    pred = np.asarray(y_pred, dtype=object)
    return ClassificationReport(
        macro_f1=float(f1_score(true, pred, average="macro", zero_division=0)),
        balanced_accuracy=float(balanced_accuracy_score(true, pred)),
        precision_high=float(
            precision_score(true, pred, labels=[positive], average="micro", zero_division=0)
        ),
        recall_high=float(
            recall_score(true, pred, labels=[positive], average="micro", zero_division=0)
        ),
    )
