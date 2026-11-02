import type { Level, NetworkNow, Station } from "@/lib/api/schemas";
import { stationKey, sortStations } from "@/lib/stations";

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

/** Un sentido de una estación, para elegirlo desde el globo del mapa o desde la lista. */
export interface MapDirection {
  key: string;
  label: string;
}

/**
 * Una estación en el mapa para elegir tramo. A diferencia de `MapPoint`, el nivel puede faltar (si
 * no hay previsión de la red) y lleva todos sus sentidos.
 */
export interface MapMarker {
  stationId: number;
  name: string;
  latitude: number;
  longitude: number;
  key: string;
  level?: Level;
  probabilityHigh?: number;
  directions?: MapDirection[];
}

export function directionLabel(station: Station): string {
  return station.direction === 0 ? "Ambos sentidos" : `Sentido ${station.direction_label}`;
}

/**
 * Las estaciones del catálogo con coordenadas, una por punto, con sus sentidos y el nivel de esta
 * hora si se conoce. Las que no tienen coordenadas solo se pueden elegir desde la lista.
 */
export function pickerMarkers(stations: Station[], network?: NetworkNow): MapMarker[] {
  const levels = new Map(network ? mapPoints(network).map((p) => [p.stationId, p]) : []);
  const markers = new Map<number, MapMarker>();
  for (const station of sortStations(stations)) {
    const { latitude, longitude } = station;
    if (latitude == null || longitude == null || !insideTenerife(latitude, longitude)) {
      continue;
    }
    const direction = { key: stationKey(station), label: directionLabel(station) };
    const current = markers.get(station.station_id);
    if (current) {
      current.directions?.push(direction);
      continue;
    }
    const level = levels.get(station.station_id);
    markers.set(station.station_id, {
      stationId: station.station_id,
      name: station.name.trim() || `Estación ${station.station_id}`,
      latitude,
      longitude,
      key: level?.key ?? direction.key,
      level: level?.level,
      probabilityHigh: level?.probabilityHigh,
      directions: [direction],
    });
  }
  return [...markers.values()];
}
