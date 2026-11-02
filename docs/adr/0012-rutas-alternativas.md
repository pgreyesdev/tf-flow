# ADR 0012 · Rutas alternativas con OpenStreetMap

- **Estado:** aceptada
- **Fecha:** 2026-11-01

## Contexto

Con la previsión por estación y las incidencias de la DGT, la pregunta natural es «¿por dónde
voy?». Para responderla hacen falta rutas reales entre dos lugares y un mapa de calles, sin pagar
por un servicio comercial ni pedir claves que acaben en el navegador.

## Decisión

- **Rutas con OSRM y datos de OpenStreetMap.** La API pide al servidor OSRM (por defecto el público
  del proyecto, `router.project-osrm.org`; configurable con `TFFLOW_ROUTING_URL`) hasta tres rutas
  alternativas en coche. Cada trayecto se pide una sola vez y se guarda en memoria: las carreteras
  no cambian de un minuto a otro y así se respeta el uso razonable del servidor público. Si hiciera
  falta más capacidad, se puede montar un OSRM propio con el extracto de Canarias sin tocar código.
- **Lugares cerrados.** Origen y destino se eligen de una lista de 44 lugares (los 31 municipios y
  los destinos más habituales) en lugar de geocodificar texto libre: no depende de otro servicio,
  cada ruta tiene una URL estable y el asistente puede resolver «La Laguna» o «aeropuerto sur».
- **Cada ruta se cruza con el modelo.** Se buscan las estaciones de aforo a menos de 120 m del
  trazado, se estima a qué hora se pasaría por cada una (en proporción al tiempo de OSRM) y se lee
  su previsión a esa hora. Como el sentido del aforo va por punto kilométrico y no se sabe cuál
  coincide con el de la ruta, se toma el peor de los dos. Se añaden las incidencias de la DGT a
  menos de 200 m: hoy, todas las activas; otro día, las obras y cortes que siguen ese día.
- **Recomendación transparente.** Las rutas se ordenan por el tiempo sin tráfico más una
  penalización orientativa: 8 minutos por aforo con atasco previsto, 3 por tráfico denso, 5 por
  incidencia y 60 si la DGT informa de un corte. La web explica la regla y no la presenta como un
  tiempo de llegada.
- **Mapa de calles de OpenFreeMap** (teselas vectoriales abiertas de OpenStreetMap, sin clave),
  con la ruta elegida en azul encima y las demás en gris, como en los navegadores. La CSP solo abre
  `tiles.openfreemap.org` para imágenes y conexiones.
- **El asistente** tiene la herramienta `plan_route` y termina sus respuestas con un enlace a la
  página `/rutas` de esa consulta. El chat solo convierte en enlace las rutas internas de la web.

## Consecuencias

- Solo se sabe el tráfico donde hay estación de aforo: una ruta sin aforos aparece como «no
  sabemos cómo estará el tráfico» y puede salir recomendada solo por ser más corta. La web lo dice.
- Los tiempos son los de OSRM sin tráfico; la previsión no se convierte en minutos de retraso
  porque el modelo no se entrenó para eso.
- El servidor público de OSRM no tiene garantías de servicio. Si falla, la página y el asistente lo
  dicen y el resto de la web sigue funcionando.
- Las coordenadas de cada lugar importan: OSRM lleva el punto a la vía más cercana, y si esa vía es
  un vial interno la ruta puede dar un rodeo. Pasó con el Aeropuerto Sur (salía por Los Abrigos y
  El Médano: 1 h 05 hacia el Norte en vez de unos 48 min), y por eso los aeropuertos van en su vía
  de acceso. La API avisa en el log cuando un lugar queda a más de 150 m de la carretera.
- Las obras solo aparecen si la DGT las publica. Las carreteras de Tenerife las gestiona el
  Cabildo, que publica sus incidencias como datos abiertos históricos (por años), no en directo,
  así que obras como las de la TF-1 a la altura de Las Caletillas pueden no salir aunque Google
  Maps (que también usa avisos de conductores) sí las marque.
