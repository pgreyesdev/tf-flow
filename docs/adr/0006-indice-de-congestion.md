# ADR 0006 · Índice de congestión basado en la velocidad

- **Estado:** propuesta, en validación con 2025-2026
- **Fecha:** 2026-10-25

## Contexto

La primera versión llamaba "atasco" a un volumen alto. Pero en una congestión fuerte el volumen
baja, porque los coches avanzan despacio, y un volumen alto a buena velocidad no es un atasco.

El dataset del Cabildo trae, para cada carril y hora, cuántos vehículos pasaron en cada uno de seis
rangos de velocidad. El análisis exploratorio de 2019-2026 (10,6 millones de registros) mostró:

- El rango 1 es el más lento: concentra el 79 % de los vehículos en los accesos y el 27 % en los
  carriles rápidos.
- Los límites de los rangos **no son comparables entre estaciones**. En autovías como La Matanza
  (TF-5) o los túneles de Güímar (TF-1), más del 95 % de los vehículos cae siempre en los rangos 1-2,
  también de madrugada. Lo mismo pasa en vías urbanas como Padre Anchieta o la Vía de Ronda.
- Donde los rangos sí discriminan, la proporción de lentos sube con el volumen: la mediana pasa del
  29 % con poco tráfico al 55 % cerca de la capacidad, que es la forma esperada del diagrama
  fundamental del tráfico.
- Algunos carriles de accesos y carriles bus tienen una dinámica propia y meten ruido.

## Decisión

1. Se usan solo los carriles del tronco de la vía; se excluyen accesos, salidas y carriles bus.
2. Por estación, sentido y hora se calcula la **proporción de lentos**: vehículos en los rangos 1-2
   entre el total de los seis rangos.
3. La señal es el **exceso de lentos**: esa proporción menos la que tiene la misma estación y
   sentido con **tráfico fluido** (horas con un volumen entre el 15 % y el 40 % de la capacidad
   observada, que es el percentil 99 del volumen).
4. Hay riesgo **medio** con un exceso de 15 puntos y **alto** con 30, siempre que el volumen sea
   al menos el 30 % de la capacidad observada, para descartar las madrugadas.
5. Si con tráfico fluido más del 90 % de los vehículos ya cae en los rangos lentos, la velocidad no
   aporta información y el nivel sale del volumen: medio desde el 75 % de la capacidad observada y
   alto desde el 90 %.
6. Las referencias (capacidad y lentos en fluido) se calculan solo con los datos de entrenamiento y
   con su último año, y se recalculan en cada reentrenamiento.

### Alternativa descartada

Una primera versión comparaba con la mediana de lentos a la misma hora y tipo de día. La validación
con 2025-2026 mostró dos problemas: un atasco que se repite cada mañana quedaba como "normal", que
es justo lo que el conductor quiere saber, y las estaciones que cambiaron de comportamiento tras
2024 (Depuradora S/C, Al Campo La Laguna) salían en riesgo alto entre el 60 % y el 70 % de las
horas. Por eso la referencia es el tráfico fluido y solo se usa el último año.

Los umbrales son la propuesta inicial y se ajustarán con la validación sobre 2025-2026 y con
episodios conocidos. La implementación está en `tf_flow_ml.processing.congestion`.

## Consecuencias

- El modelo deja de predecir solo volumen: predice el nivel de congestión, que es lo que le importa
  al conductor.
- Cada predicción puede explicar su motivo: "un 30 % más de vehículos lentos de lo normal".
- Hay que pedir al Servicio Técnico de Carreteras y Movilidad del Cabildo los límites en km/h de
  cada rango por estación. Con ellos se podría pasar a umbrales de velocidad absolutos.
