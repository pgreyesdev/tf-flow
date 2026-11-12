import { type ChatEvent, chatEventSchema, type ChatMessage } from "@/lib/api/schemas";

/** La API acepta hasta 20 mensajes que empiecen y terminen con una pregunta. */
export const MAX_HISTORY = 19;
export const MAX_MESSAGE_LENGTH = 1000;

/** Ruta de la web que reenvía las preguntas a la API con la clave de acceso. */
export const ASSISTANT_ENDPOINT = "/api/asistente";

/** Últimos mensajes de la conversación que caben en una petición, empezando por una pregunta. */
export function historyForRequest(messages: ChatMessage[]): ChatMessage[] {
  const recent = messages.slice(-MAX_HISTORY);
  const start = recent.findIndex((m) => m.role === "user");
  return start === -1 ? [] : recent.slice(start);
}

export type ChatResult =
  | { ok: true; reply: string; toolsUsed: string[] }
  | { ok: false; error: string; retryAfter?: number };

/** Lo que lleva escrito el asistente mientras responde. */
export interface ChatProgress {
  text: string;
  toolsUsed: string[];
}

export type SendChat = (
  messages: ChatMessage[],
  onProgress: (progress: ChatProgress) => void,
  signal?: AbortSignal,
) => Promise<ChatResult>;

export const TOOL_LABELS: Record<string, string> = {
  find_stations: "buscó estaciones",
  get_day_forecast: "consultó la previsión",
  get_incidents: "consultó las incidencias",
  plan_route: "buscó rutas",
  get_model_info: "revisó el modelo",
};

/** Qué está haciendo el asistente mientras consulta cada herramienta. */
export const TOOL_ACTIVITY: Record<string, string> = {
  find_stations: "Buscando el punto de medida…",
  get_day_forecast: "Consultando la previsión…",
  get_incidents: "Mirando las incidencias de la DGT…",
  plan_route: "Buscando rutas…",
  get_model_info: "Revisando el modelo…",
};

export const UNAVAILABLE =
  "El asistente no está disponible ahora mismo. Puedes consultar la previsión directamente.";
export const UNREACHABLE =
  "No se ha podido contactar con el asistente. Revisa la conexión y vuelve a probar.";
export const CUT_OFF = "La respuesta se ha cortado a medias. Prueba a preguntar otra vez.";

/** Lee los eventos `data: {json}` de un flujo de Server-Sent Events. Ignora los que no entiende. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replaceAll("\r\n", "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const event = parseEvent(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event) {
          yield event;
        }
      }
      if (done) {
        return;
      }
    }
  } finally {
    // Si quien lee para antes de tiempo, se cierra la conexión en lugar de dejarla colgada.
    await reader.cancel().catch(() => undefined);
  }
}

function parseEvent(block: string): ChatEvent | undefined {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) {
    return undefined;
  }
  try {
    const parsed = chatEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Cuerpo de los errores de {@link ASSISTANT_ENDPOINT}. */
export interface ChatFailure {
  error: string;
  retryAfter?: number;
}

/** Pregunta al asistente y va avisando con el texto según llega. */
export const streamChat: SendChat = async (messages, onProgress, signal) => {
  let response: Response;
  try {
    response = await fetch(ASSISTANT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => ({}))) as Partial<ChatFailure>;
    return {
      ok: false,
      error: typeof body.error === "string" ? body.error : UNAVAILABLE,
      retryAfter: typeof body.retryAfter === "number" ? body.retryAfter : undefined,
    };
  }
  let text = "";
  const toolsUsed: string[] = [];
  try {
    for await (const event of readEvents(response.body)) {
      switch (event.type) {
        case "tool":
          toolsUsed.push(event.name);
          break;
        case "delta":
          text += event.text;
          break;
        case "replace":
          text = event.text;
          break;
        case "done":
          return { ok: true, reply: text.trim(), toolsUsed: event.tools_used };
        case "error":
          return { ok: false, error: CUT_OFF };
      }
      onProgress({ text, toolsUsed: [...toolsUsed] });
    }
  } catch {
    // La conexión se cortó: se trata igual que un final sin `done`.
  }
  return { ok: false, error: CUT_OFF };
};
