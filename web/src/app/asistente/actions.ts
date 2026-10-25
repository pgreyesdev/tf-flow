"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { ApiError, askAssistant } from "@/lib/api/client";
import { chatMessageSchema } from "@/lib/api/schemas";
import { type ChatResult, historyForRequest } from "@/lib/chat";
import { clientAddress, RateLimiter } from "@/lib/rate-limit";

const limiter = new RateLimiter(Number(process.env.TFFLOW_ASSISTANT_RATE_LIMIT_PER_MINUTE) || 6);

const historySchema = z
  .array(chatMessageSchema)
  .min(1)
  .max(40)
  .refine((messages) => messages.at(-1)?.role === "user", "La última debe ser una pregunta")
  .refine(
    (messages) => messages.every((m, i) => i === 0 || m.role !== messages[i - 1]?.role),
    "Preguntas y respuestas deben alternarse",
  );

const RATE_LIMITED = "Has hecho muchas preguntas seguidas. Espera un minuto y vuelve a probar.";

const ERRORS: Partial<Record<ApiError["kind"], string>> = {
  rate_limited: RATE_LIMITED,
  forbidden: "El asistente no acepta preguntas desde esta web ahora mismo.",
  out_of_range: "No he podido entender la conversación. Prueba a empezar una nueva.",
};

/** Envía la conversación al asistente desde el servidor: la clave de acceso nunca llega al navegador. */
export async function sendToAssistant(messages: unknown): Promise<ChatResult> {
  const wait = limiter.acquire(clientAddress(await headers()));
  if (wait > 0) {
    return { ok: false, error: RATE_LIMITED, retryAfter: wait };
  }
  const parsed = historySchema.safeParse(messages);
  if (!parsed.success) {
    return { ok: false, error: "La conversación no es válida. Prueba a empezar una nueva." };
  }
  try {
    const reply = await askAssistant(historyForRequest(parsed.data));
    return { ok: true, reply: reply.reply, toolsUsed: reply.tools_used };
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return {
      ok: false,
      error:
        ERRORS[error.kind] ??
        "El asistente no está disponible ahora mismo. Puedes consultar la previsión directamente.",
      retryAfter: error.retryAfter,
    };
  }
}
