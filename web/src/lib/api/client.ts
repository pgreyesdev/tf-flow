import "server-only";

import type { z } from "zod";

import { serverEnv } from "@/lib/env";

import {
  type ChatMessage,
  type ChatReply,
  chatReplySchema,
  type DayForecast,
  dayForecastSchema,
  type Direction,
  errorBodySchema,
  type ModelInfo,
  modelInfoSchema,
  type NetworkNow,
  networkNowSchema,
  type Station,
  stationSchema,
} from "./schemas";

export type ApiErrorKind =
  "not_found" | "out_of_range" | "rate_limited" | "unavailable" | "forbidden" | "invalid_response";

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly retryAfter?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
  }
}

/** Las previsiones solo cambian cuando se publica un modelo nuevo: se reutilizan unos minutos. */
const FORECAST_REVALIDATE_SECONDS = 600;
const READ_TIMEOUT_MS = 10_000;
/** La primera previsión de una estación calcula su semana entera y en Fly puede tardar más. */
const FORECAST_TIMEOUT_MS = 25_000;
const CHAT_TIMEOUT_MS = 75_000;

const STATUS_KIND: Record<number, ApiErrorKind> = {
  403: "forbidden",
  404: "not_found",
  422: "out_of_range",
  429: "rate_limited",
};

async function errorFrom(response: Response): Promise<ApiError> {
  const kind = STATUS_KIND[response.status] ?? "unavailable";
  const body = errorBodySchema.safeParse(await response.json().catch(() => ({})));
  const detail = body.success ? body.data.detail : undefined;
  const message = typeof detail === "string" ? detail : `La API respondió ${response.status}`;
  const retryAfter = Number(response.headers.get("Retry-After")) || undefined;
  return new ApiError(kind, message, retryAfter);
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit & { next?: { revalidate?: number } },
  timeoutMs: number,
): Promise<T> {
  const url = new URL(path, serverEnv().TFFLOW_API_URL);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", ...init.headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new ApiError("unavailable", "No se pudo conectar con la API", undefined, { cause });
  }
  if (!response.ok) {
    throw await errorFrom(response);
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    throw new ApiError("invalid_response", `Respuesta inesperada de ${url.pathname}`);
  }
  return parsed.data;
}

const cached = { next: { revalidate: FORECAST_REVALIDATE_SECONDS } };

export function getStations(): Promise<Station[]> {
  return request("/api/v1/stations", stationSchema.array(), cached, READ_TIMEOUT_MS);
}

export function getModelInfo(): Promise<ModelInfo> {
  return request("/api/v1/model", modelInfoSchema, cached, READ_TIMEOUT_MS);
}

/** La hora actual en toda la red, para el mapa. Lee las previsiones ya calculadas. */
export function getNetworkNow(): Promise<NetworkNow> {
  return request("/api/v1/network/now", networkNowSchema, cached, FORECAST_TIMEOUT_MS);
}

export function getDayForecast(
  stationId: number,
  direction: Direction,
  date?: string,
): Promise<DayForecast> {
  const query = new URLSearchParams({ direction: String(direction) });
  if (date) {
    query.set("date", date);
  }
  return request(
    `/api/v1/stations/${stationId}/forecast?${query.toString()}`,
    dayForecastSchema,
    cached,
    FORECAST_TIMEOUT_MS,
  );
}

export function askAssistant(messages: ChatMessage[]): Promise<ChatReply> {
  const token = serverEnv().TFFLOW_ASSISTANT_TOKEN;
  return request(
    "/api/v1/assistant/chat",
    chatReplySchema,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "X-Assistant-Token": token } : {}),
      },
      body: JSON.stringify({ messages }),
    },
    CHAT_TIMEOUT_MS,
  );
}
