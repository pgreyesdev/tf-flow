# ADR 0001 · Monorepo para todo el proyecto

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

La primera versión estaba repartida en dos repositorios (modelo con Streamlit y un frontend en
Vite) unidos por un submódulo, y el contrato entre ambos no estaba escrito en ningún sitio: el
frontend enviaba campos que el modelo no esperaba.

## Decisión

Un único repositorio con `backend/`, `ml/`, `web/`, `android/` y `docs/`. El contrato de la API se
genera desde FastAPI (OpenAPI) y los clientes web y Android se generan a partir de él.

## Consecuencias

- Un cambio que rompe el contrato se detecta en el mismo pull request.
- Un solo CI, un solo historial y una sola versión para la memoria del TFG.
- El CI tiene que filtrar por carpeta para no ejecutar todo en cada cambio cuando crezca.
