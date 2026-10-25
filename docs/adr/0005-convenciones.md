# ADR 0005 · Idioma del código y convenciones

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Decisión

- Código, nombres de la API y mensajes de commit en inglés, que es el estándar de las librerías que
  usamos.
- Documentación, comentarios explicativos, mensajes al usuario y memoria en español.
- Commits con Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Python formateado con Ruff (100 columnas); Kotlin con ktlint; TypeScript con ESLint y Prettier.

## Consecuencias

El código es fácil de leer para cualquier desarrollador y la documentación queda lista para
reutilizarse en la memoria.
