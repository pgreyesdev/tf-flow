# ADR 0007 · LightGBM como modelo en servicio

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

Siguiendo el [ADR 0003](0003-validacion-temporal-y-baseline.md), se compararon el baseline
histórico, Random Forest y LightGBM entrenando con 2019-2024 (sin el estado de alarma de 2020) y
evaluando con enero de 2025 a septiembre de 2026: 3,5 millones de horas de entrenamiento y
1 millón de test.

Con solo calendario y perfil histórico, los modelos apenas mejoraban al baseline (WAPE 17,1 %
frente a 17,8 %): las estaciones cambian con los años y el perfil medio no lo recoge. Al añadir la
tendencia reciente de cada estación, la de las cuatro semanas que terminaron 45 días antes por el
retraso de publicación del Cabildo, el error bajó claramente:

| Volumen horario | MAE | WAPE | Entrenamiento |
| --- | ---: | ---: | ---: |
| Baseline | 181 | 17,8 % | <1 s |
| Random Forest | 131 | 12,8 % | 198 s |
| LightGBM | 133 | 13,0 % | 40 s |

| Atasco fuerte | F1 macro | Precisión | Detección |
| --- | ---: | ---: | ---: |
| Baseline | 0,61 | 62 % | 40 % |
| Random Forest | 0,69 | 54 % | 63 % |
| LightGBM | 0,70 | 68 % | 52 % |
| LightGBM con umbral 0,25 | 0,69 | 57 % | 65 % |

## Decisión

- Se sirve **LightGBM** para las dos tareas. Su error queda a dos décimas de Random Forest, entrena
  cinco veces más rápido, ocupa mucho menos y calcula SHAP exacto de sus árboles sin dependencias
  extra, lo que permite explicar cada predicción.
- El aviso de atasco fuerte salta cuando su probabilidad supera un umbral elegido con el último
  año de entrenamiento (0,25 en esta ejecución). Sube la detección del 52 % al 65 % a cambio de más
  falsas alarmas: para quien planifica un trayecto, perderse un atasco es peor que un aviso de más.
- El modelo final se reentrena con todo el histórico y se empaqueta junto con las últimas semanas
  de tráfico y el catálogo de estaciones. La API solo lo carga si su SHA-256 coincide.

## Consecuencias

- Las estaciones con poco historial (San Isidro desde 2025, Túnel de la TF-24 desde 2024) y la
  Dársena Pesquera tienen errores del 30-45 %; mejorarán al acumular datos.
- En festivos y puentes el error sube al 22 %: es el siguiente punto de mejora, junto con la
  meteorología.
- Cada reentrenamiento queda registrado en MLflow, así que los cambios de modelo se comparan con
  estos números.
