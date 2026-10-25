import "server-only";

import { type DaySummary, summarizeDay } from "@/lib/forecast";
import { addDays } from "@/lib/format";

import { getDayForecast } from "./client";
import type { DayForecast, Station } from "./schemas";

export const OUTLOOK_DAYS = 7;

export interface Outlook {
  forecast: DayForecast;
  /** Resumen de los próximos días desde hoy; faltan los que la API no pudo prever. */
  days: DaySummary[];
}

/**
 * Previsión del día elegido y resumen de la semana, como el parte de una app del tiempo.
 * Si falla el día elegido, falla todo; si falla otro día, solo se omite de la lista.
 */
export async function getOutlook(station: Station, date: string, today: string): Promise<Outlook> {
  const dates = Array.from({ length: OUTLOOK_DAYS }, (_, i) => addDays(today, i));
  const fetchDay = (day: string) => getDayForecast(station.station_id, station.direction, day);

  const [selected, ...week] = await Promise.allSettled([
    fetchDay(date),
    ...dates.filter((d) => d !== date).map(fetchDay),
  ]);
  if (selected?.status !== "fulfilled") {
    throw selected?.reason;
  }
  const forecasts = [
    selected.value,
    ...week.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
  ];
  const days = forecasts
    .filter((f) => dates.includes(f.date))
    .map(summarizeDay)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { forecast: selected.value, days };
}
