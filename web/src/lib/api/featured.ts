import "server-only";

import { serverEnv } from "@/lib/env";
import { todayInTenerife } from "@/lib/format";
import { findStation, parseStationKey, sortStations } from "@/lib/stations";

import { getModelInfo, getStations } from "./client";
import { getOutlook, type Outlook } from "./outlook";
import type { ModelInfo, Station } from "./schemas";

export interface HomeData {
  stations: Station[];
  outlook?: Outlook;
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
export async function getHomeData(today: string = todayInTenerife()): Promise<HomeData> {
  const [stations = [], model] = await Promise.all([
    optional(getStations()),
    optional(getModelInfo()),
  ]);
  const wanted = parseStationKey(serverEnv().TFFLOW_FEATURED_STATION);
  const featured = (wanted && findStation(stations, wanted)) || sortStations(stations)[0];
  const outlook = featured ? await optional(getOutlook(featured, today, today)) : undefined;
  return { stations, outlook, model };
}
