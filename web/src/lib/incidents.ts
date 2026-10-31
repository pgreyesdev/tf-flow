/** Cómo se cuentan en la web las incidencias de la DGT. */
import type { Incident } from "@/lib/api/schemas";
import { TIMEZONE, todayInTenerife } from "@/lib/format";

/** Distancia a la que una incidencia se considera «cerca» de una estación. */
export const NEARBY_KM = 3;

const time = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIMEZONE,
});
const day = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  timeZone: TIMEZONE,
});
const kilometer = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/** «Obras · Vía cortada». */
export function incidentTitle(incident: Incident): string {
  return [incident.label, ...incident.details].join(" · ");
}

/** «TF-82, km 9,5 · El Tanque». */
export function incidentPlace(incident: Incident): string {
  const road =
    incident.road && incident.kilometer != null
      ? `${incident.road}, km ${kilometer.format(incident.kilometer)}`
      : incident.road;
  return [road, incident.municipality].filter(Boolean).join(" · ") || "Tenerife";
}

/** «Desde las 07:50» si empezó hoy; «desde el 22 jun.» si no. */
export function incidentSince(incident: Incident, now: Date = new Date()): string | undefined {
  if (!incident.start) {
    return undefined;
  }
  const start = new Date(incident.start);
  return todayInTenerife(start) === todayInTenerife(now)
    ? `Desde las ${time.format(start)}`
    : `Desde el ${day.format(start)}`;
}

/** Distancia en kilómetros entre dos puntos (fórmula del semiverseno). */
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Las incidencias a menos de `km` del punto, de la más cercana a la más lejana. */
export function incidentsNear(
  incidents: Incident[],
  point: { latitude: number; longitude: number },
  km: number = NEARBY_KM,
): Incident[] {
  return incidents
    .map((incident) => ({ incident, distance: distanceKm(point, incident) }))
    .filter(({ distance }) => distance <= km)
    .sort((a, b) => a.distance - b.distance)
    .map(({ incident }) => incident);
}
