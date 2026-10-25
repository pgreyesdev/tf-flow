# ADR 0008 · Asistente conversacional con Claude y herramientas

- **Estado:** sustituida por el [ADR 0009](0009-asistente-openai.md)
- **Fecha:** 2026-10-25

## Contexto

La web y la app enseñan la previsión de una estación y un día. Mucha gente pregunta de otra forma:
"¿a qué hora salgo de La Laguna para no pillar atasco en la TF-5?". Un asistente conversacional
puede traducir esas preguntas a consultas al modelo, pero un modelo de lenguaje no debe inventar
cifras de tráfico, y cada llamada cuesta dinero.

## Decisión

- El asistente usa Claude (`claude-opus-5-5` por defecto, configurable con
  `TFFLOW_ASSISTANT_MODEL`) con tres herramientas propias: buscar estaciones, previsión de un día e
  información del modelo. Las cifras salen siempre del modelo de TF-FLOW; Claude solo elige qué
  consultar y lo explica.
- Las herramientas usan `strict: true` y el backend vuelve a validar sus argumentos con Pydantic.
  Un error (estación inexistente, fecha fuera de rango) vuelve a Claude como `tool_result` con
  `is_error`, para que lo explique en lugar de fallar.
- El bucle de herramientas es manual y acotado: como mucho seis rondas, 4 096 tokens por respuesta
  y esfuerzo bajo, suficiente para una conversación.
- El coste se controla en tres capas: presupuesto diario de tokens para todo el servicio
  (`TFFLOW_ASSISTANT_DAILY_TOKEN_BUDGET`), límite de preguntas por minuto y cliente, y un token de
  acceso opcional (`TFFLOW_ASSISTANT_ACCESS_TOKEN`) para no abrirlo al público.
- El prompt de sistema y las herramientas son fijos y se cachean; la fecha de hoy va en un mensaje
  de sistema al final de la conversación para no invalidar la caché.
- Se activan las alternativas del servidor (`fallbacks: "default"`) para que una negativa de los
  clasificadores de seguridad se reintente en otro modelo; si aun así se niega, el usuario recibe
  una respuesta amable.
- La conversación no se guarda en el servidor: el cliente envía el historial (como mucho 20
  mensajes de 1 000 caracteres).

## Consecuencias

- Las respuestas son tan buenas como el modelo de previsión, y el asistente lo deja claro: avisa
  de que no conoce accidentes ni obras de hoy.
- Los mensajes del usuario se envían a Anthropic. La web debe decirlo junto al chat.
- Con una sola instancia, el presupuesto y los límites viven en memoria. Si la API escala a varias
  instancias, hay que moverlos a la base de datos o a Redis.
