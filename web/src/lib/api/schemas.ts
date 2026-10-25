/** Esquemas de las respuestas de la API. Se validan al llegar: la web no confía en su forma. */
import { z } from "zod";

export const LEVELS = ["low", "medium", "high"] as const;
export const levelSchema = z.enum(LEVELS);
export type Level = z.infer<typeof levelSchema>;

export const directionSchema = z.union([z.literal(-1), z.literal(0), z.literal(1)]);
export type Direction = z.infer<typeof directionSchema>;

/** Fecha y hora local sin zona, tal como la devuelve la API. */
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/);
const isoDate = z.iso.date();

export const stationSchema = z.object({
  station_id: z.number().int().positive(),
  direction: directionSchema,
  direction_label: z.string(),
  name: z.string(),
});
export type Station = z.infer<typeof stationSchema>;

export const factorSchema = z.object({
  feature: z.string(),
  label: z.string(),
  contribution: z.number(),
});
export type Factor = z.infer<typeof factorSchema>;

export const hourlyForecastSchema = z.object({
  time: localDateTime,
  vehicles: z.number().nonnegative(),
  level: levelSchema,
  probability_high: z.number().min(0).max(1),
  factors: z.array(factorSchema),
});
export type HourlyForecast = z.infer<typeof hourlyForecastSchema>;

export const dayForecastSchema = z.object({
  station: stationSchema,
  date: isoDate,
  timezone: z.string(),
  data_until: localDateTime,
  hours: z.array(hourlyForecastSchema),
  worst_hour: hourlyForecastSchema,
});
export type DayForecast = z.infer<typeof dayForecastSchema>;

export const modelInfoSchema = z.object({
  data_until: localDateTime,
  high_threshold: z.number(),
  metrics: z.record(z.string(), z.number()),
});
export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(1000),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatReplySchema = z.object({
  reply: z.string(),
  tools_used: z.array(z.string()),
  tokens_used: z.number().int().nonnegative(),
});
export type ChatReply = z.infer<typeof chatReplySchema>;

export const errorBodySchema = z.object({ detail: z.unknown() }).partial();
