# Web

Web pública de TF-FLOW con Next.js 16: portada que presenta el proyecto y la app Android, previsión
hora a hora por estación, asistente conversacional y explicación del modelo. Las decisiones de
diseño y seguridad están en el [ADR 0010](../docs/adr/0010-web-nextjs.md).

## Desarrollo

```bash
cp .env.example .env.local
pnpm install
pnpm dev          # http://localhost:3000, con la API en TFFLOW_API_URL
pnpm check        # ESLint, Prettier, tipos y tests
```

| Variable                                 | Para qué                                                           |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `TFFLOW_API_URL`                         | Dirección de la API vista desde el servidor de la web              |
| `TFFLOW_ASSISTANT_TOKEN`                 | Token de acceso al asistente, si la API lo exige                   |
| `TFFLOW_SITE_URL`                        | URL pública, para metadatos y el sitemap                           |
| `TFFLOW_FEATURED_STATION`                | Estación y sentido de la portada, como `57:1`                      |
| `TFFLOW_PLAY_STORE_URL`                  | Ficha de la app en Google Play; sin ella se muestra «Próximamente» |
| `TFFLOW_ASSISTANT_RATE_LIMIT_PER_MINUTE` | Preguntas al asistente por visitante y minuto (6)                  |

## Estructura

| Carpeta           | Contenido                                                  |
| ----------------- | ---------------------------------------------------------- |
| `src/app/`        | Páginas: portada, `prediccion`, `asistente`, `metodologia` |
| `src/components/` | Gráfica hora a hora, chat, tarjetas y elementos comunes    |
| `src/lib/api/`    | Cliente de la API, solo de servidor, con validación Zod    |
| `src/lib/`        | Formato en español, estaciones, CSP y límite de peticiones |
| `src/proxy.ts`    | Genera el nonce de la CSP en cada petición                 |

## Producción

`docker build -t tf-flow-web web` crea una imagen con el servidor standalone de Next.js, que corre
como usuario sin privilegios en el puerto 3000. Delante debe ir un proxy con HTTPS que fije
`X-Real-IP`.
