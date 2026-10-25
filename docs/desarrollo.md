# Guía de desarrollo

## Requisitos

- [uv](https://docs.astral.sh/uv/) (instala Python 3.12 si hace falta)
- Node.js 22 y [pnpm](https://pnpm.io/) 10, para la web
- Docker, para el entorno completo con base de datos

## Primeros pasos

```bash
cp .env.example .env
make install   # dependencias y hooks de pre-commit
make check     # lint, tipos y tests, lo mismo que el CI
make api       # API en http://localhost:8000/docs
make web       # web en http://localhost:3000, contra la API local
```

La web lee su configuración de `web/.env.local` (copia `web/.env.example`). Sus comprobaciones son
`make web-check`: ESLint, Prettier, tipos y tests.

## Flujo de trabajo

1. Rama por cambio: `feat/...`, `fix/...`, `docs/...`.
2. Commits con [Conventional Commits](https://www.conventionalcommits.org/es/).
3. Pull request contra `main`; el CI tiene que pasar antes de fusionar.

## Calidad mínima

- Cobertura de tests de al menos el 90 %, en Python y en la web; el CI falla por debajo.
- `mypy --strict` y TypeScript estricto sin errores.
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

Los modelos usan el calendario, los festivos de Tenerife (nacionales, de Canarias y la Candelaria),
los puentes y el perfil histórico de cada estación. También reciben cómo fue el tráfico a esa misma
hora en las cuatro semanas que terminaron 45 días antes. El Cabildo publica los datos con retraso,
así que el modelo nunca usa datos que no estarían publicados en el momento de predecir.

El informe incluye la importancia de cada variable según SHAP, que LightGBM calcula de forma
exacta sobre sus árboles. Para el atasco fuerte, el modelo avisa cuando la probabilidad supera un
umbral que se elige con el último año de entrenamiento.

Con `--mlflow-uri` la ejecución queda registrada en MLflow con su configuración y sus métricas:

```bash
uv run python -m tf_flow_ml.training data/raw/traffic/AAAAMMDD --mlflow-uri sqlite:///mlflow.db
uvx mlflow ui --backend-store-uri sqlite:///mlflow.db   # interfaz web, sin instalarla en el proyecto
```

En GitHub, el flujo **Entrenamiento** hace lo mismo con la última instantánea descargada y conserva
el historial de MLflow entre ejecuciones.

## Despliegue

La web va en Vercel y la API en Fly.io. La web llama a la API desde su servidor, así que el
navegador nunca ve la dirección de la API ni el token del asistente.

### API en Fly.io

`fly.toml` describe la máquina (1 GB, París, se suspende sin tráfico y vuelve en menos de un
segundo con el modelo ya cargado) y monta el volumen `models` en
`/models`. La primera vez:

```bash
fly volumes create models --region cdg --size 1
fly deploy                                   # arranca sin modelo: /health dice model_loaded=false
fly ssh sftp shell                           # dentro: put models/serving.joblib /models/serving.joblib
fly secrets set \
  TFFLOW_MODEL_PATH=/models/serving.joblib \
  TFFLOW_MODEL_SHA256=$(cut -d' ' -f1 models/serving.joblib.sha256) \
  TFFLOW_ASSISTANT_ACCESS_TOKEN=$(openssl rand -hex 32) \
  TFFLOW_OPENAI_API_KEY=sk-...
```

`fly secrets set` reinicia la API con el modelo. Para publicar un modelo nuevo se repiten el `put` y
el secreto `TFFLOW_MODEL_SHA256`.

### Web en Vercel

Directorio raíz `web` y estas variables de entorno de producción:

| Variable | Valor |
| --- | --- |
| `TFFLOW_API_URL` | `https://<app>.fly.dev` |
| `TFFLOW_ASSISTANT_TOKEN` | El mismo `TFFLOW_ASSISTANT_ACCESS_TOKEN` de Fly |
| `TFFLOW_SITE_URL` | La URL pública de la web |

Vercel fija `X-Real-IP`, que la web usa para limitar las preguntas al asistente por visitante.
`web/vercel.json` ejecuta la web en París (`cdg1`), junto a la API: cada página hace hasta ocho
consultas y desde la región por defecto, en Washington, cada una cruzaría el Atlántico.
