# TF-FLOW

TF-FLOW predice el riesgo de congestión en las carreteras de Tenerife a partir de los datos
abiertos de las estaciones de aforo del Cabildo. El conductor elige carretera, sentido, día y hora,
y recibe el volumen esperado, el nivel de riesgo y la mejor hora para salir.

El sistema tiene cuatro piezas:

| Pieza | Carpeta | Estado |
| --- | --- | --- |
| Pipeline de datos y modelos | `ml/` | Fase 0: ingesta, agregación y baseline |
| API REST | `backend/` | Fase 0: esqueleto, seguridad y salud |
| Web | `web/` | Fase 3 |
| App Android | `android/` | Fase 4 |

Las decisiones de diseño se registran como [ADR](adr/index.md).
