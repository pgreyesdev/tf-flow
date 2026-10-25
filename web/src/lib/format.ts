/** Formato en español de horas, cifras y fechas. Las horas de la API ya son locales de Canarias. */

export const TIMEZONE = "Atlantic/Canary";
const LOCALE = "es-ES";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });
const longDate = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const isoInTenerife = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIMEZONE,
});

/** `2026-10-27T08:00:00` → `08:00`. */
export function hourLabel(localTime: string): string {
  return localTime.slice(11, 16);
}

/** Hora de la API como número, de 0 a 23. */
export function hourOf(localTime: string): number {
  return Number(localTime.slice(11, 13));
}

export function formatVehicles(vehicles: number): string {
  return integer.format(Math.round(vehicles));
}

export function formatPercent(fraction: number): string {
  return percent.format(fraction);
}

function utcDate(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
}

/** `2026-10-27` → `martes, 27 de octubre de 2026`. */
export function formatLongDate(isoDate: string): string {
  return longDate.format(utcDate(isoDate));
}

/** `2026-09-30T23:00:00` → `30 de septiembre de 2026`. */
export function formatShortDate(isoDate: string): string {
  return shortDate.format(utcDate(isoDate));
}

/** Fecha de hoy en Tenerife como `AAAA-MM-DD`. */
export function todayInTenerife(now: Date = new Date()): string {
  return isoInTenerife.format(now);
}

export function addDays(isoDate: string, days: number): string {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = utcDate(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
