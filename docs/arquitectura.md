# Arquitectura

Todas las interfaces (web, app Android y asistente conversacional) consumen una única API REST. Así
la lógica de predicción existe en un solo sitio y se prueba una sola vez.

```text
 Web (Next.js)      App Android (Compose)      API de Claude
        \                 /                         ^
         \   HTTPS/JSON  /                          | tool use
          v             v                           |
   +------------------- Backend FastAPI -----------------------+
   |  API REST /v1  ->  Servicio de predicción  <-  Asistente   |
   +-----------------------------------------------------------+
          |                      |
          v                      v
     PostgreSQL           Registro de modelos  <-  Pipeline de datos
                                                     ^
                          Aforos del Cabildo, AEMET, festivos
```

## Capas del backend

| Capa | Carpeta | Responsabilidad |
| --- | --- | --- |
| API | `tf_flow_api/api` | HTTP: rutas, validación de entrada, códigos de estado |
| Servicios | `tf_flow_api/services` | Casos de uso: predecir, buscar la mejor hora, estado |
| Dominio | `tf_flow_api/domain` | Conceptos puros: estación, sentido, nivel de riesgo |
| Núcleo | `tf_flow_api/core` | Configuración, logging y seguridad transversal |

Las dependencias solo apuntan hacia dentro: la API conoce los servicios, los servicios conocen el
dominio y el dominio no conoce a nadie.

## Paquete de ML

| Módulo | Responsabilidad |
| --- | --- |
| `ingestion` | Cliente CKAN del portal de datos abiertos del Cabildo |
| `processing` | Agregación por estación, sentido y hora, y variables de calendario |
| `models` | Baseline de media histórica y, desde la Fase 1, los modelos de ML |
| `evaluation` | Partición temporal y métricas (MAE, RMSE, WAPE) |
