# ADR 0010 · Web con Next.js, renderizado en servidor y CSP estricta

- **Estado:** aceptada
- **Fecha:** 2026-10-25

## Contexto

La web es la cara pública de TF-FLOW: presenta el proyecto y la app Android, muestra la previsión
por estación y da acceso al asistente. Tiene que ser rápida en el móvil, accesible y no exponer
nada que permita gastar el presupuesto del asistente o inyectar código.

## Decisión

- **Next.js 16 con App Router y TypeScript estricto.** Las páginas son Server Components que llaman
  a la API desde el servidor; el navegador solo recibe HTML y el JavaScript de los componentes
  interactivos (el chat). La búsqueda de previsión es un formulario `GET`, así que funciona sin
  JavaScript y cada consulta tiene su URL.
- **La API no se expone al navegador.** El asistente se llama con una Server Action que valida la
  conversación con Zod, limita las preguntas por visitante y añade el token de acceso, que nunca
  sale del servidor. Las respuestas de la API también se validan con Zod antes de pintarlas.
- **CSP con nonce por petición** (`script-src 'nonce-…' 'strict-dynamic'`, sin `unsafe-inline`), más
  HSTS, `nosniff`, `X-Frame-Options` y `Permissions-Policy`. Como el nonce cambia en cada petición,
  todas las páginas se generan al pedirlas y Cache Components queda desactivado: su prerenderizado
  parcial sirve un HTML estático sin nonce. Para que eso no cueste carga en la API, las respuestas de
  previsión se reutilizan diez minutos en la caché de datos de Next.js.
- **Única excepción de estilo en línea:** React esconde los trozos SVG que envía por partes con
  `style="display:none"`. Se permite ese atributo exacto por su huella SHA-256
  (`style-src-attr 'unsafe-hashes'`), no cualquier estilo.
- **Sistema de diseño accesible:** Atkinson Hyperlegible (servida desde el propio dominio), azul
  noche y azul océano para la marca, y verde, ámbar y rojo solo para el estado del tráfico, siempre
  con texto e icono. Contraste mínimo 4,5:1 en modo claro y oscuro, foco visible y respeto a
  `prefers-reduced-motion`. La gráfica hora a hora es SVG sin dependencias y lleva una tabla con
  los mismos datos.
- **Calidad:** ESLint con las reglas de Next.js y de accesibilidad, Prettier, Vitest con Testing
  Library (cobertura mínima del 90 %), `pnpm audit` y la imagen Docker escaneada con Trivy en el CI.

## Consecuencias

- No hay HTML estático en una CDN: cada visita pasa por el servidor de Next.js. Para el tráfico
  esperado de un TFG es asumible, y la caché de datos evita repetir llamadas a la API.
- El límite de preguntas al asistente vive en memoria del servidor de la web; con varias
  instancias habría que llevarlo a Redis, igual que el de la API.
- El proxy de delante debe fijar `X-Real-IP` con la IP del visitante para que ese límite sea por
  persona y no global.
