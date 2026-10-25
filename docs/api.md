# API

La API sirve las previsiones del modelo final. Todas las rutas cuelgan de `/api/v1` y solo admiten
`GET`. Fuera de producción, la documentación interactiva está en `/docs`.

| Ruta | Qué devuelve |
| --- | --- |
| `GET /health` | Estado del servicio y si el modelo está cargado |
| `GET /stations` | Estaciones y sentidos con previsión |
| `GET /stations/{id}/forecast?direction=1&date=AAAA-MM-DD` | Previsión hora a hora de un día |
| `GET /model` | Último dato con el que se entrenó, umbral de aviso y métricas en test |

## Previsión de un día

Cada hora trae los vehículos previstos, el nivel de congestión (`low`, `medium`, `high`), la
probabilidad de atasco fuerte y los tres motivos que más pesan en esa probabilidad según SHAP.
`worst_hour` es la hora con más riesgo, la que la web y la app destacan.

```json
{
  "station": {"station_id": 57, "direction": 1, "direction_label": "creciente", "name": "Los Cristianos"},
  "date": "2026-10-27",
  "timezone": "Atlantic/Canary",
  "data_until": "2026-09-30T23:00:00",
  "hours": [
    {
      "time": "2026-10-27T08:00:00",
      "vehicles": 3120.5,
      "level": "high",
      "probability_high": 0.81,
      "factors": [
        {"feature": "recent_high", "label": "los atascos fuertes recientes a esa hora", "contribution": 1.92}
      ]
    }
  ],
  "worst_hour": {"time": "2026-10-27T08:00:00", "level": "high", "probability_high": 0.81}
}
```

Las horas son locales de Canarias. La fecha por defecto es hoy; se aceptan fechas desde una semana
atrás hasta `TFFLOW_MAX_FORECAST_DAYS` días después (14 por defecto). Una estación o sentido
desconocido da 404 y una fecha fuera de rango, 422.

## Modelo en servicio

El flujo **Entrenamiento** deja en su artefacto `serving.joblib` y `serving.joblib.sha256`. La API lo
carga al arrancar desde `TFFLOW_MODEL_PATH` y solo si su SHA-256 coincide con
`TFFLOW_MODEL_SHA256`: el paquete usa pickle, y cargar un fichero alterado podría ejecutar código.
Sin modelo configurado la API arranca igualmente, `/health` indica `model_loaded: false` y las
previsiones responden 503.

```bash
mkdir -p models && cp ~/Descargas/modelos/artifacts/serving.joblib* models/
export TFFLOW_MODEL_PATH=models/serving.joblib
export TFFLOW_MODEL_SHA256=$(cut -d' ' -f1 models/serving.joblib.sha256)
make api
```

## Protección

- Cada cliente puede hacer `TFFLOW_RATE_LIMIT_PER_MINUTE` peticiones por minuto (60 por defecto);
  al pasarse recibe 429 con `Retry-After`. `/health` no cuenta. Detrás de un proxy, uvicorn debe
  arrancar con `--proxy-headers --forwarded-allow-ips=<IP del proxy>` para limitar por la IP real.
- Todas las respuestas llevan cabeceras de seguridad (HSTS, `nosniff`, `X-Frame-Options`) y una
  política de contenido que impide al navegador cargar nada desde la API.
- CORS solo acepta los orígenes de `TFFLOW_CORS_ORIGINS` y los métodos `GET` y `POST`.
- Los parámetros se validan antes de llegar al modelo: estación entre 1 y 99 999, sentido -1, 0 o 1
  y fecha dentro del rango permitido.
