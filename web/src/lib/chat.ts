import type { ChatMessage } from "@/lib/api/schemas";

/** La API acepta hasta 20 mensajes que empiecen y terminen con una pregunta. */
export const MAX_HISTORY = 19;
export const MAX_MESSAGE_LENGTH = 1000;

/** Últimos mensajes de la conversación que caben en una petición, empezando por una pregunta. */
export function historyForRequest(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  const start = recent.findIndex((m) => m.role === "user");
  return start === -1 ? [] : recent.slice(start);
}

export type ChatResult =
  | { ok: true; reply: string; toolsUsed: string[] }
  | { ok: false; error: string; retryAfter?: number };

export const TOOL_LABELS: Record<string, string> = {
  find_stations: "buscó estaciones",
  get_day_forecast: "consultó la previsión",
  get_model_info: "revisó el modelo",
};
