"""Paquete con todo lo que la API necesita para predecir.

Contiene los modelos LightGBM entrenados con todo el histórico, el constructor de variables, el
umbral de aviso de atasco fuerte, las últimas semanas de tráfico (para las variables recientes),
el catálogo de estaciones y las previsiones de los próximos meses ya calculadas. Se guarda con
joblib, que usa pickle: cargar un fichero de origen desconocido puede ejecutar código, así que
``load_bundle`` comprueba antes su SHA-256.
"""

import hashlib
import hmac
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from lightgbm import LGBMClassifier, LGBMRegressor

from tf_flow_ml.processing.calendar import in_lockdown
from tf_flow_ml.processing.congestion import STATION_KEYS, Level
from tf_flow_ml.training.features import CATEGORICAL, FeatureBuilder
from tf_flow_ml.training.pipeline import TrainingConfig, lightgbm_options

HISTORY_DAYS = 120
"""Días de tráfico que se guardan: de sobra para la ventana reciente más el retraso."""


class IntegrityError(RuntimeError):
    """El fichero del modelo no coincide con la huella esperada."""


@dataclass(slots=True)
class ServingBundle:
    features: FeatureBuilder
    volume_model: Any
    level_model: Any
    high_threshold: float
    history: pd.DataFrame
    stations: pd.DataFrame
    """Una fila por estación y sentido: ``station_id``, ``direction``, ``name``."""
    data_until: pd.Timestamp
    metrics: dict[str, float]
    forecasts: pd.DataFrame | None = None
    """Previsiones ya calculadas de cada estación para los próximos meses, con sus motivos. La API
    las sirve tal cual y solo usa los modelos para las horas que falten."""


def build_bundle(
    data: pd.DataFrame,
    names: pd.Series,
    config: TrainingConfig,
    high_threshold: float,
    metrics: dict[str, float],
) -> ServingBundle:
    """Entrena los modelos finales con todo ``data`` (ya con festivos y niveles)."""
    train = data[~in_lockdown(data["timestamp"])]
    features = FeatureBuilder().fit(train)
    x = features.transform(train, history=data)
    options = lightgbm_options(config)
    volume_model = LGBMRegressor(**options).fit(
        x, train["vehicles"], categorical_feature=CATEGORICAL
    )
    labeled = train["level"].isin([Level.LOW, Level.MEDIUM, Level.HIGH]).to_numpy()
    level_model = LGBMClassifier(**options).fit(
        x[labeled], train.loc[labeled, "level"].astype(str), categorical_feature=CATEGORICAL
    )

    data_until = data["timestamp"].max()
    recent = data[data["timestamp"] > data_until - pd.Timedelta(days=HISTORY_DAYS)]
    history_columns = [*STATION_KEYS, "timestamp", "hour", "is_weekend", "vehicles", "level"]
    stations = (
        data[STATION_KEYS]
        .drop_duplicates()
        .assign(name=lambda d: d["station_id"].map(names.to_dict()))
        .sort_values(STATION_KEYS)
        .reset_index(drop=True)
    )
    return ServingBundle(
        features=features,
        volume_model=volume_model,
        level_model=level_model,
        high_threshold=high_threshold,
        history=recent[history_columns].reset_index(drop=True),
        stations=stations,
        data_until=data_until,
        metrics=metrics,
    )


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def save_bundle(bundle: ServingBundle, path: Path) -> str:
    """Guarda el paquete y su huella en ``<path>.sha256``; devuelve la huella."""
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path, compress=3)
    digest = file_sha256(path)
    path.with_name(path.name + ".sha256").write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return digest


def load_bundle(path: Path, expected_sha256: str) -> ServingBundle:
    """Carga el paquete solo si su SHA-256 coincide con el esperado."""
    digest = file_sha256(path)
    if not hmac.compare_digest(digest, expected_sha256.strip().lower()):
        raise IntegrityError(f"La huella de {path.name} no coincide: {digest}")
    bundle = joblib.load(path)
    if not isinstance(bundle, ServingBundle):
        raise IntegrityError(f"{path.name} no es un paquete de TF-FLOW")
    return bundle
