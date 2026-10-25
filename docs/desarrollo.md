# Guía de desarrollo

## Requisitos

- [uv](https://docs.astral.sh/uv/) (instala Python 3.12 si hace falta)
- Docker, para el entorno completo con base de datos

## Primeros pasos

```bash
cp .env.example .env
make install   # dependencias y hooks de pre-commit
make check     # lint, tipos y tests, lo mismo que el CI
make api       # API en http://localhost:8000/docs
```

## Flujo de trabajo

1. Rama por cambio: `feat/...`, `fix/...`, `docs/...`.
2. Commits con [Conventional Commits](https://www.conventionalcommits.org/es/).
3. Pull request contra `main`; el CI tiene que pasar antes de fusionar.

## Calidad mínima

- Cobertura de tests de al menos el 90 %; el CI falla por debajo.
- `mypy --strict` sin errores.
- Ninguna vulnerabilidad alta o crítica en la imagen Docker.

## Datos

Los experimentos trabajan sobre instantáneas locales del portal del Cabildo, nunca directamente
contra la API:

```bash
uv run python -m tf_flow_ml.ingestion traffic    # aforos 2019-2026 -> data/raw/traffic/AAAAMMDD/
uv run python -m tf_flow_ml.ingestion traffic --years 2025-2026   # solo esos años
uv run python -m tf_flow_ml.ingestion stations   # catálogo de estaciones
```

Cada instantánea guarda un Parquet por fichero mensual y un `manifest.json` con el origen, la fecha de
descarga, el número de filas y las columnas. La carpeta `data/` no se versiona.

## Entrenamiento

```bash
uv run python -m tf_flow_ml.training data/raw/traffic/AAAAMMDD --out artifacts
```

Entrena con los datos anteriores a 2025 (sin el estado de alarma de 2020) y evalúa con 2025-2026.
Compara el baseline histórico con Random Forest y LightGBM en dos tareas: el volumen horario y el
nivel de congestión del [ADR 0006](adr/0006-indice-de-congestion.md). Deja en `artifacts/` el
informe `entrenamiento.md` y los modelos en `modelos.joblib`.

Los modelos solo usan variables conocidas para cualquier fecha futura: calendario, festivos de
Tenerife (nacionales, de Canarias y la Candelaria), puentes y el perfil histórico de cada estación.
El Cabildo publica los datos con un mes de retraso, así que el tráfico reciente no sirve como
variable en el momento de predecir.

En GitHub, el flujo **Entrenamiento** hace lo mismo con la última instantánea descargada.
