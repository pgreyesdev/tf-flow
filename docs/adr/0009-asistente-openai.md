# ADR 0009 · Asistente conversacional con OpenAI y herramientas

- **Estado:** aceptada
- **Fecha:** 2026-10-25
- **Sustituye a:** [ADR 0008](0008-asistente-claude.md)

## Contexto

El ADR 0008 eligió Claude para el asistente. El autor ya tiene cuenta y clave de la API de OpenAI,
así que el asistente pasa a usarla. Ninguna de las dos API va incluida en las suscripciones de chat
(ChatGPT, Claude): las dos se pagan por uso, y el control de gasto sigue siendo imprescindible.

## Decisión

- El asistente usa la API Responses de OpenAI con `gpt-5.4-mini` por defecto (configurable con
  `TFFLOW_ASSISTANT_MODEL`) y tres herramientas propias: buscar estaciones, previsión de un día e
  información del modelo. Las cifras salen siempre del modelo de TF-FLOW; el modelo de lenguaje solo
  elige qué consultar y lo explica.
- Las herramientas usan `strict: true` y el backend vuelve a validar los argumentos con Pydantic.
  Un error (estación inexistente, fecha fuera de rango, JSON roto) vuelve al modelo como salida que
  empieza por `ERROR:`, para que lo explique en lugar de inventar.
- El bucle de herramientas es manual y acotado: como mucho seis rondas, 4 096 tokens de salida por
  respuesta y razonamiento de esfuerzo bajo.
- No se guarda nada en OpenAI (`store: false`); el razonamiento viaja cifrado entre rondas
  (`reasoning.encrypted_content`).
- El coste se controla en tres capas: presupuesto diario de tokens para todo el servicio, límite
  de preguntas por minuto y cliente, y un token de acceso opcional para no abrirlo al público.
- Las instrucciones y las herramientas son fijas, para que OpenAI cachee el prefijo; la fecha de hoy
  va en un mensaje `developer` al final.
- Una negativa del modelo o un corte por el filtro de contenido se convierte en una respuesta amable.
- La conversación no se guarda en el servidor: el cliente envía el historial (como mucho 20
  mensajes de 1 000 caracteres).

## Consecuencias

- Las respuestas son tan buenas como el modelo de previsión, y el asistente avisa de que no conoce
  accidentes ni obras de hoy.
- Los mensajes del usuario se envían a OpenAI. La web debe decirlo junto al chat.
- Con una sola instancia, el presupuesto y los límites viven en memoria. Si la API escala a varias
  instancias, hay que moverlos a la base de datos o a Redis.
- Cambiar de proveedor afecta solo a `services/assistant.py`: las herramientas, los límites y la
  ruta de la API no dependen de él.
