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
uv run python -m tf_flow_ml.ingestion traffic    # aforos -> data/raw/traffic/AAAAMMDD/
uv run python -m tf_flow_ml.ingestion stations   # catálogo de estaciones
```

Cada instantánea guarda `data.parquet` y un `manifest.json` con los ficheros de origen, la fecha de
descarga, el número de filas y las columnas. La carpeta `data/` no se versiona.
