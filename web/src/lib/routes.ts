/** Cómo se cuentan en la web las rutas y lo que se sabe de cada una. */
import type { RouteOption, RoutePlan } from "@/lib/api/schemas";

/** `65` → `1 h 5 min`. */
export function formatDuration(minutes: number): string {
  const total = Math.max(1, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

const kilometers = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

export function formatDistance(km: number): string {
  return `${kilometers.format(km)} km`;
}

/** Qué dicen los aforos de la ruta: «3 aforos: 1 con atasco y 1 con tráfico denso». */
export function trafficSummary(route: RouteOption): string {
  const { stations } = route;
  if (stations.length === 0) {
    return "No pasa por ningún aforo: no sabemos cómo estará el tráfico.";
  }
  const high = stations.filter((s) => s.level === "high").length;
  const medium = stations.filter((s) => s.level === "medium").length;
  const count = stations.length === 1 ? "1 aforo" : `${stations.length} aforos`;
  const parts = [
    high > 0 && `${high} con atasco`,
    medium > 0 && `${medium} con tráfico denso`,
  ].filter(Boolean);
  return parts.length === 0
    ? `${count}, todo fluido a tu paso.`
    : `${count}: ${parts.join(" y ")} a tu paso.`;
}

/** Por qué se recomienda la ruta, en una frase. */
export function recommendationReason(plan: RoutePlan): string | undefined {
  const [best, ...others] = plan.routes;
  if (!best || others.length === 0) {
    return undefined;
  }
  if (others.some((r) => r.closed) && !best.closed) {
    return "Las otras rutas tienen la vía cortada.";
  }
  const fastest = Math.min(...plan.routes.map((r) => r.duration_minutes));
  if (best.duration_minutes <= fastest) {
    return "Es la más rápida y no se esperan más problemas en ella que en las otras.";
  }
  return "No es la más corta, pero se esperan menos atascos o incidencias en ella.";
}

/** Recuadro que contiene todas las rutas: [oeste, sur, este, norte]. */
export function planBounds(plan: RoutePlan): [number, number, number, number] {
  const points = plan.routes.flatMap((route) => route.geometry);
  const longitudes = points.map(([lon]) => lon);
  const latitudes = points.map(([, lat]) => lat);
  return [
    Math.min(...longitudes),
    Math.min(...latitudes),
    Math.max(...longitudes),
    Math.max(...latitudes),
  ];
}
