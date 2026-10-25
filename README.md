# TF-FLOW

[![CI](https://github.com/pgreyesdev/tf-flow/actions/workflows/ci.yml/badge.svg)](https://github.com/pgreyesdev/tf-flow/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)

**Predicción de congestión en las carreteras de Tenerife** a partir de los datos abiertos de las
estaciones de aforo del Cabildo. Trabajo de Fin de Grado en Ingeniería Informática, Universidad de
La Laguna.

Eliges carretera, sentido, día y hora, y TF-FLOW te dice cuántos vehículos se esperan, si hay riesgo
de atasco y a qué hora te conviene salir. Disponible como web, app Android y asistente
conversacional.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| [`backend/`](backend) | API REST con FastAPI |
| [`ml/`](ml) | Ingesta de datos, preprocesado, modelos y evaluación |
| [`web/`](web) | Web con Next.js |
| [`android/`](android) | App Android con Kotlin y Jetpack Compose |
| [`docs/`](docs) | Documentación técnica y decisiones de arquitectura (ADR) |

## Empezar

```bash
cp .env.example .env
make install
make check
make api      # http://localhost:8000/docs
```

Con Docker: `make up`. Más detalles en la [guía de desarrollo](docs/desarrollo.md).

## Datos

- [Intensidad de tráfico de las estaciones de aforo](https://datos.tenerife.es/ckan/dataset/d02ccf54-aca2-4a82-9ef0-fbd285b5f401)
- [Catálogo de estaciones de aforo](https://datos.tenerife.es/ckan/dataset/a114f82b-bb62-47e0-94bb-bebb484514a7)

Fuente: portal de datos abiertos del Cabildo de Tenerife.

## Licencia

[MIT](LICENSE) © Pablo García de los Reyes
