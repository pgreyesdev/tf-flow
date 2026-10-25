import type { HourlyForecast, Level } from "@/lib/api/schemas";
import { hourLabel, hourOf } from "@/lib/format";

export interface HourRange {
  from: string;
  /** Hora en la que termina el tramo, exclusiva: `07:00–09:00` cubre las 7 y las 8. */
  to: string;
  level: Level;
}

/** Tramos de horas consecutivas con al menos `minimum` de congestión. */
export function congestedRanges(hours: HourlyForecast[], minimum: Level = "high"): HourRange[] {
  const rank: Record<Level, number> = { low: 0, medium: 1, high: 2 };
  const ranges: HourRange[] = [];
  let current: { start: number; end: number; level: Level } | null = null;

  for (const hour of hours) {
    const h = hourOf(hour.time);
    const hit = rank[hour.level] >= rank[minimum];
    if (hit && current && current.end === h) {
      current.end = h + 1;
      if (rank[hour.level] > rank[current.level]) {
        current.level = hour.level;
      }
    } else if (hit) {
      if (current) {
        ranges.push(toRange(current));
      }
      current = { start: h, end: h + 1, level: hour.level };
    } else if (current) {
      ranges.push(toRange(current));
      current = null;
    }
  }
  if (current) {
    ranges.push(toRange(current));
  }
  return ranges;
}

function toRange({ start, end, level }: { start: number; end: number; level: Level }): HourRange {
  const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
  return { from: pad(start), to: end === 24 ? "24:00" : pad(end), level };
}

export function formatRange(range: HourRange): string {
  return `${range.from}–${range.to}`;
}

/** La hora del día (de 6 a 22) con menos riesgo de atasco fuerte, para sugerir cuándo salir. */
export function calmestDaytimeHour(hours: HourlyForecast[]): HourlyForecast | undefined {
  const daytime = hours.filter((h) => hourOf(h.time) >= 6 && hourOf(h.time) <= 22);
  return daytime.reduce<HourlyForecast | undefined>(
    (best, h) => (!best || h.probability_high < best.probability_high ? h : best),
    undefined,
  );
}

export function peakVehicles(hours: HourlyForecast[]): number {
  return hours.reduce((max, h) => Math.max(max, h.vehicles), 0);
}

export function busiestHour(hours: HourlyForecast[]): HourlyForecast | undefined {
  return hours.reduce<HourlyForecast | undefined>(
    (best, h) => (!best || h.vehicles > best.vehicles ? h : best),
    undefined,
  );
}

export interface DayFocus {
  hour: HourlyForecast;
  /** `risk` si hay atasco fuerte previsto; si no, `traffic` y la hora es la de más tráfico. */
  kind: "risk" | "traffic";
}

/** La hora que hay que destacar: la de más riesgo si se espera atasco fuerte, o la más cargada. */
export function dayFocus(forecast: {
  hours: HourlyForecast[];
  worst_hour: HourlyForecast;
}): DayFocus {
  if (forecast.hours.some((h) => h.level === "high")) {
    return { hour: forecast.worst_hour, kind: "risk" };
  }
  return { hour: busiestHour(forecast.hours) ?? forecast.worst_hour, kind: "traffic" };
}

export interface DaySummary {
  date: string;
  /** Peor nivel previsto en el día. */
  level: Level;
  minRisk: number;
  maxRisk: number;
  peakVehicles: number;
}

const RANK: Record<Level, number> = { low: 0, medium: 1, high: 2 };

export function summarizeDay(forecast: { date: string; hours: HourlyForecast[] }): DaySummary {
  const risks = forecast.hours.map((h) => h.probability_high);
  return {
    date: forecast.date,
    level: forecast.hours.reduce<Level>(
      (worst, h) => (RANK[h.level] > RANK[worst] ? h.level : worst),
      "low",
    ),
    minRisk: risks.length ? Math.min(...risks) : 0,
    maxRisk: risks.length ? Math.max(...risks) : 0,
    peakVehicles: peakVehicles(forecast.hours),
  };
}

/** Mínimo de horas en la tira, para que a última hora no se quede casi vacía. */
const MIN_STRIP_HOURS = 8;

/**
 * Horas que se muestran en la tira horaria: hoy, desde la hora actual (o las últimas horas del día,
 * si quedan pocas); otro día, el día entero.
 */
export function upcomingHours(
  hours: HourlyForecast[],
  isToday: boolean,
  currentHour: number,
): HourlyForecast[] {
  if (!isToday) {
    return hours;
  }
  const start = Math.min(currentHour, 24 - MIN_STRIP_HOURS);
  const rest = hours.filter((h) => hourOf(h.time) >= start);
  return rest.length > 0 ? rest : hours;
}

/** La hora que representa «ahora» en la cabecera: la actual si es hoy, si no la clave del día. */
export function headlineHour(
  forecast: { hours: HourlyForecast[]; worst_hour: HourlyForecast },
  isToday: boolean,
  currentHour: number,
): HourlyForecast {
  if (isToday) {
    const now = forecast.hours.find((h) => hourOf(h.time) === currentHour);
    if (now) {
      return now;
    }
  }
  return dayFocus(forecast).hour;
}

/** Frase de resumen del día, como «Lluvia a partir de las 17:00» en una app del tiempo. */
export function daySentence(hours: HourlyForecast[]): string {
  const jams = congestedRanges(hours, "high");
  const dense = congestedRanges(hours, "medium");
  const calm = calmestDaytimeHour(hours);
  const advice = calm ? ` Hora más tranquila: ${hourLabel(calm.time)}.` : "";
  if (jams.length > 0) {
    return `Atasco fuerte previsto ${listRanges(jams)}.${advice}`;
  }
  if (dense.length > 0) {
    return `Sin atascos fuertes, pero con tráfico denso ${listRanges(dense)}.${advice}`;
  }
  return "Tráfico fluido durante todo el día.";
}

function listRanges(ranges: HourRange[]): string {
  const parts = ranges.map((r) => `de ${r.from} a ${r.to}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}` : (parts[0] ?? "");
}
