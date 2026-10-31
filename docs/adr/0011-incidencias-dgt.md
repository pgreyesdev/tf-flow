# ADR 0011 · Incidencias en directo de la DGT

- **Estado:** aceptada
- **Fecha:** 2026-10-31

## Contexto

La previsión dice cómo suele estar una vía a una hora, pero no sabe de un accidente de hace diez
minutos. Para completar la foto hacía falta una fuente de incidencias en tiempo real para Tenerife
que se pueda usar legalmente:

- El Centro de Información de Carreteras del Cabildo (CIC) publica incidencias en su web, pero no
  tiene API ni licencia de reutilización. Copiarlas de su web («scraping») choca con sus condiciones
  de uso y se rompería con cualquier cambio de la página; queda descartado salvo permiso expreso.
- El Cabildo publica en su portal de datos abiertos un histórico mensual de incidencias (CC BY),
  útil para el análisis pero no en directo.
- La DGT publica en el Punto de Acceso Nacional (NAP) un fichero DATEX II v3 con todas las
  incidencias de España, actualizado cada pocos minutos, en abierto y sin registro. En él aparecen
  las de Tenerife que comunica el Cabildo (obras, cortes, accidentes, límites de velocidad).

## Decisión

- **Fuente:** el fichero `SituationPublication` de la DGT
  (`nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v36.xml`), configurable con
  `TFFLOW_INCIDENTS_FEED_URL`. Se cita siempre la fuente en la web y en las respuestas.
- **La API hace de intermediaria** (`GET /api/v1/incidents`). Descarga el fichero como mucho cada
  cinco minutos (`TFFLOW_INCIDENTS_REFRESH_SECONDS`) y solo cuando alguien pregunta, así que la DGT
  recibe una petición cada cinco minutos aunque haya muchos visitantes, y ninguna si no hay nadie.
- **Lectura segura y ligera:** se lee con `defusedxml` (sin entidades externas ni expansiones) y por
  partes, descartando cada registro al terminarlo; el fichero ronda los 3 MB. Se queda con lo que
  cae en el recuadro de Tenerife (la provincia incluye otras islas), está activo y no ha caducado.
- **Una incidencia por suceso:** la DGT reparte un suceso en varios registros (uno por sentido, el
  corte y el límite de velocidad de unas obras...). Se agrupan por `situation` y se muestran como
  uno, con sus efectos («Vía cortada», «Carril cortado», «Velocidad limitada»). El tipo sale de la
  causa cuando la hay: un corte de carril por obras se cuenta como obras.
- **Si la DGT falla** se siguen sirviendo las últimas incidencias leídas durante 30 minutos; después
  la respuesta dice `available: false` y la web oculta la sección en lugar de decir que no hay nada.
- **Dónde se usan:** capa propia en el mapa de la portada (blanco con borde naranja, distinto de los
  tres niveles) y lista «Incidencias ahora»; aviso en la previsión de hoy si hay alguna a menos de
  3 km de la estación; y una herramienta `get_incidents` para el asistente.
- **No entran en el modelo.** La previsión sigue siendo la del modelo entrenado; la web avisa de que
  una incidencia cercana puede hacer que haya más tráfico del previsto.

## Consecuencias

- Hay información en directo sin depender de una fuente sin licencia ni de un servicio de pago.
- Las incidencias son las que la DGT recibe: si el Cabildo no comunica algo, no aparece. La web lo
  presenta como «comunicadas por la DGT», no como todas las que hay.
- Usar las incidencias como variable del modelo queda para trabajo futuro: haría falta el histórico
  del Cabildo alineado con los aforos.
