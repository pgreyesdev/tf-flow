# ADR 0002 · Backend en Python con FastAPI y uv

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

El modelo y el preprocesado están en Python (pandas y scikit-learn). Servir el modelo desde otro
lenguaje obligaría a exportarlo o a mantener dos implementaciones del preprocesado.

## Decisión

API con FastAPI y Pydantic v2, empaquetada con uv como espacio de trabajo con dos paquetes:
`tf-flow-api` (servicio HTTP) y `tf-flow-ml` (datos y modelos). Ruff para lint y formato, mypy en
modo estricto y pytest con cobertura mínima del 90 %.

## Consecuencias

- El preprocesado que usa la API es exactamente el mismo que se usó para entrenar.
- OpenAPI se genera solo y sirve de contrato para la web y la app.
- uv con `uv.lock` hace las instalaciones reproducibles en local, CI y Docker.
