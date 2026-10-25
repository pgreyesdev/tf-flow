import "server-only";

import { serverEnv } from "@/lib/env";
import { findStation, parseStationKey, sortStations } from "@/lib/stations";

import { getDayForecast, getModelInfo, getStations } from "./client";
import type { DayForecast, ModelInfo, Station } from "./schemas";

export interface HomeData {
  stations: Station[];
  forecast?: DayForecast;
  model?: ModelInfo;
}

async function optional<T>(promise: Promise<T>): Promise<T | undefined> {
  try {
    return await promise;
  } catch {
    return undefined;
  }
}

/** Datos de la portada. Si la API no responde, la portada se muestra igual, sin previsión. */
export async function getHomeData(): Promise<HomeData> {
  const [stations = [], model] = await Promise.all([
    optional(getStations()),
    optional(getModelInfo()),
  ]);
  const wanted = parseStationKey(serverEnv().TFFLOW_FEATURED_STATION);
  const featured = (wanted && findStation(stations, wanted)) || sortStations(stations)[0];
  const forecast = featured
    ? await optional(getDayForecast(featured.station_id, featured.direction))
    : undefined;
  return { stations, forecast, model };
}
