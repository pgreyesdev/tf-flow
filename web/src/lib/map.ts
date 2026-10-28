import type { Level, NetworkNow } from "@/lib/api/schemas";
import { stationKey } from "@/lib/stations";

/** Una estación en el mapa. Sus dos sentidos comparten punto: se pinta el que peor va. */
export interface MapPoint {
  stationId: number;
  name: string;
  latitude: number;
  longitude: number;
  level: Level;
  probabilityHigh: number;
  vehicles: number;
  /** Clave del sentido que peor va, para abrir su previsión. */
  key: string;
}

/** Recuadro de Tenerife: fuera de él, unas coordenadas son un error del catálogo. */
export const TENERIFE_BOUNDS = { west: -17, east: -16, south: 27.95, north: 28.65 } as const;

function insideTenerife(latitude: number, longitude: number): boolean {
  const b = TENERIFE_BOUNDS;
  return latitude >= b.south && latitude <= b.north && longitude >= b.west && longitude <= b.east;
}

export function mapPoints(network: NetworkNow): MapPoint[] {
  const points = new Map<number, MapPoint>();
  for (const { station, hour } of network.stations) {
    const { latitude, longitude } = station;
    if (latitude == null || longitude == null || !insideTenerife(latitude, longitude)) {
      continue;
    }
    const current = points.get(station.station_id);
    if (current && current.probabilityHigh >= hour.probability_high) {
      continue;
    }
    points.set(station.station_id, {
      stationId: station.station_id,
      name: station.name.trim() || `Estación ${station.station_id}`,
      latitude,
      longitude,
      level: hour.level,
      probabilityHigh: hour.probability_high,
      vehicles: hour.vehicles,
      key: stationKey(station),
    });
  }
  return [...points.values()].sort((a, b) => b.probabilityHigh - a.probabilityHigh);
}
