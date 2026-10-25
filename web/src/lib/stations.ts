import type { Direction, Station } from "@/lib/api/schemas";

export interface StationRef {
  stationId: number;
  direction: Direction;
}

/** Valor con el que una estación y su sentido viajan en la URL: `57:1`. */
export function stationKey(station: StationRef | Station): string {
  const id = "stationId" in station ? station.stationId : station.station_id;
  return `${id}:${station.direction}`;
}

export function parseStationKey(value: string | undefined): StationRef | null {
  const match = /^(\d{1,5}):(-1|0|1)$/.exec(value ?? "");
  if (!match) {
    return null;
  }
  return { stationId: Number(match[1]), direction: Number(match[2]) as Direction };
}

export function stationLabel(station: Station): string {
  const name = station.name.trim() || `Estación ${station.station_id}`;
  return station.direction === 0 ? name : `${name} · sentido ${station.direction_label}`;
}

export function sortStations(stations: Station[]): Station[] {
  return [...stations].sort(
    (a, b) =>
      a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
      a.station_id - b.station_id ||
      b.direction - a.direction,
  );
}

export function findStation(stations: Station[], ref: StationRef): Station | undefined {
  return stations.find((s) => s.station_id === ref.stationId && s.direction === ref.direction);
}
