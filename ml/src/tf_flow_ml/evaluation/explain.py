"""Explicaciones SHAP de los modelos LightGBM.

LightGBM calcula los valores SHAP exactos de sus árboles (TreeSHAP) con ``pred_contrib``, así que
no hace falta otra dependencia. El valor de una variable en una fila es cuánto movió la predicción
respecto a la media; su media en valor absoluto mide la importancia global.
"""

from typing import Any

import numpy as np
import pandas as pd

BINARY = 2


def shap_values(model: Any, features: pd.DataFrame, class_name: str | None = None) -> pd.DataFrame:
    """Contribución de cada variable a cada predicción.

    En un clasificador, a la puntuación bruta de ``class_name``. LightGBM resume un clasificador
    binario en una sola puntuación, la de la segunda clase; la de la primera es su opuesta.
    """
    classes = list(model.classes_) if class_name is not None else []
    if class_name is not None and class_name not in classes:
        return pd.DataFrame(0.0, columns=features.columns, index=features.index)
    contributions = np.asarray(model.predict(features, pred_contrib=True))
    width = features.shape[1] + 1
    if len(classes) == BINARY:
        contributions = contributions if classes.index(class_name) == 1 else -contributions
    elif class_name is not None:
        position = classes.index(class_name)
        contributions = contributions[:, position * width : (position + 1) * width]
    return pd.DataFrame(contributions[:, :-1], columns=features.columns, index=features.index)


def shap_log_odds(
    model: Any, features: pd.DataFrame, positive: str, reference: str
) -> pd.DataFrame:
    """Contribución de cada variable a ``log(p(positive) / p(reference))``.

    En multiclase la puntuación de una clase sola no es una probabilidad: puede subir la de atasco
    fuerte solo porque baja la de las otras. La diferencia con la clase de referencia sí es exacta y
    aditiva, y responde a «¿qué empuja hacia el atasco fuerte en vez de hacia el tráfico fluido?».
    """
    classes = list(model.classes_)
    if positive not in classes or reference not in classes:
        return pd.DataFrame(0.0, columns=features.columns, index=features.index)
    if len(classes) == BINARY:
        return shap_values(model, features, positive)
    return shap_values(model, features, positive) - shap_values(model, features, reference)


def shap_importance(
    model: Any, features: pd.DataFrame, class_name: str | None = None, sample: int = 20_000
) -> pd.Series:
    """Media del valor SHAP absoluto por variable, sobre una muestra fija de filas."""
    rows = features.sample(min(sample, len(features)), random_state=0)
    values = shap_values(model, rows, class_name).abs().mean()
    return values.sort_values(ascending=False).rename("shap")
