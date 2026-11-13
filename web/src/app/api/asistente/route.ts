import { z } from "zod";

import { ApiError, streamAssistant } from "@/lib/api/client";
import { chatMessageSchema } from "@/lib/api/schemas";
import { type ChatFailure, historyForRequest, UNAVAILABLE } from "@/lib/chat";
import { clientAddress, RateLimiter } from "@/lib/rate-limit";

/**
 * Reenvía la conversación al asistente desde el servidor, para que la clave de acceso nunca llegue
 * al navegador, y devuelve la respuesta en streaming según la va generando el modelo.
 */

const limiter = new RateLimiter(Number(process.env.TFFLOW_ASSISTANT_RATE_LIMIT_PER_MINUTE) || 6);

const requestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(40)
    .refine((messages) => messages.at(-1)?.role === "user", "La última debe ser una pregunta")
    .refine(
      (messages) => messages.every((m, i) => i === 0 || m.role !== messages[i - 1]?.role),
      "Preguntas y respuestas deben alternarse",
    ),
});

const RATE_LIMITED = "Has hecho muchas preguntas seguidas. Espera un minuto y vuelve a probar.";
const INVALID = "La conversación no es válida. Prueba a empezar una nueva.";

const ERRORS: Partial<Record<ApiError["kind"], [number, string]>> = {
  rate_limited: [429, RATE_LIMITED],
  forbidden: [503, "El asistente no acepta preguntas desde esta web ahora mismo."],
  out_of_range: [400, "No he podido entender la conversación. Prueba a empezar una nueva."],
};

function failure(status: number, error: string, retryAfter?: number): Response {
  const body: ChatFailure = retryAfter ? { error, retryAfter } : { error };
  return Response.json(body, {
    status,
    headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
  });
}

/** Solo se aceptan preguntas desde la propia web (lo mismo que hacen las Server Actions). */
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) {
    return true;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!fromThisSite(request)) {
    return failure(403, "Solo se puede preguntar al asistente desde TF-FLOW.");
  }
  const wait = limiter.acquire(clientAddress(request.headers));
  if (wait > 0) {
    return failure(429, RATE_LIMITED, wait);
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return failure(400, INVALID);
  }
  try {
    const stream = await streamAssistant(historyForRequest(parsed.data.messages), request.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        // `no-transform` evita que la compresión de Next junte los trozos antes de enviarlos.
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    const [status, message] = ERRORS[error.kind] ?? [503, UNAVAILABLE];
    return failure(status, message, error.retryAfter);
  }
}
