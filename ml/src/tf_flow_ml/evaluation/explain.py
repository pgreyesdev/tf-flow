"""Explicaciones SHAP de los modelos LightGBM.

LightGBM calcula los valores SHAP exactos de sus árboles (TreeSHAP) con ``pred_contrib``, así que
no hace falta otra dependencia. El valor de una variable en una fila es cuánto movió la predicción
respecto a la media; su media en valor absoluto mide la importancia global.
"""

from typing import Any

import numpy as np
import pandas as pd


def shap_values(model: Any, features: pd.DataFrame, class_name: str | None = None) -> pd.DataFrame:
    """Contribución de cada variable a cada predicción. En un clasificador, la de ``class_name``."""
    if class_name is not None and class_name not in list(model.classes_):
        return pd.DataFrame(0.0, columns=features.columns, index=features.index)
    contributions = np.asarray(model.predict(features, pred_contrib=True))
    width = features.shape[1] + 1
    if class_name is not None:
        position = list(model.classes_).index(class_name)
        contributions = contributions[:, position * width : (position + 1) * width]
    return pd.DataFrame(contributions[:, :-1], columns=features.columns, index=features.index)


def shap_importance(
    model: Any, features: pd.DataFrame, class_name: str | None = None, sample: int = 20_000
) -> pd.Series:
    """Media del valor SHAP absoluto por variable, sobre una muestra fija de filas."""
    rows = features.sample(min(sample, len(features)), random_state=0)
    values = shap_values(model, rows, class_name).abs().mean()
    return values.sort_values(ascending=False).rename("shap")
