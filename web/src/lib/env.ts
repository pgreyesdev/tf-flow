import "server-only";

import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

const schema = z.object({
  TFFLOW_API_URL: httpUrl.default("http://localhost:8000"),
  TFFLOW_ASSISTANT_TOKEN: z.string().min(1).optional(),
  TFFLOW_SITE_URL: httpUrl.default("http://localhost:3000"),
  TFFLOW_FEATURED_STATION: z
    .string()
    .regex(/^\d{1,5}:(-1|0|1)$/)
    .optional(),
  TFFLOW_PLAY_STORE_URL: z.url({ protocol: /^https$/ }).optional(),
});

export type ServerEnv = z.infer<typeof schema>;

/** Variables de entorno del servidor, leídas en cada llamada. Las vacías cuentan como ausentes. */
export function serverEnv(): ServerEnv {
  const raw = Object.fromEntries(
    Object.keys(schema.shape).map((key) => [key, process.env[key] || undefined]),
  );
  return schema.parse(raw);
}
