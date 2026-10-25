from dataclasses import dataclass

import numpy as np
import numpy.typing as npt
from sklearn.metrics import mean_absolute_error, mean_squared_error


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
