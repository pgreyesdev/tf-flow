# ADR 0003 · Validación temporal y baseline obligatorio

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

La primera versión evaluaba el Random Forest con una partición aleatoria. En una serie temporal eso
mete en el test horas vecinas a las de entrenamiento y da un error optimista. Además no había
ninguna referencia con la que comparar el modelo.

## Decisión

1. Toda evaluación usa particiones temporales: se entrena con el pasado y se mide en el futuro
   (`tf_flow_ml.evaluation.split.temporal_split`).
2. Cualquier modelo candidato se compara con el baseline de media histórica por estación, sentido,
   día de la semana y hora (`HistoricalMeanBaseline`). Si no lo mejora, no se usa.
3. Las métricas se dan en global y por estación: MAE, RMSE y WAPE.

## Consecuencias

- Las cifras de la memoria serán más bajas que las de la primera versión, pero defendibles ante el
  tribunal.
- El baseline también sirve de respaldo en producción si el modelo falla.
