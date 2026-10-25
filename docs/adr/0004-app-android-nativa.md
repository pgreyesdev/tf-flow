# ADR 0004 · App Android nativa con Kotlin y Jetpack Compose

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

Se valoraron React Native y Flutter para compartir código con la web. El autor ya tiene experiencia
con Kotlin y Jetpack Compose, y toda la lógica pesada vive en el backend.

## Decisión

App nativa en Kotlin con Jetpack Compose y Material 3, Retrofit para la API, Hilt para inyección de
dependencias, Room para caché sin conexión y WorkManager para los avisos.

## Consecuencias

- Mejor rendimiento y acabado visual en Android sin curva de aprendizaje.
- No hay versión para iOS; queda fuera del alcance del TFG.
- El cliente de la API se genera desde OpenAPI para no desincronizarse del backend.
