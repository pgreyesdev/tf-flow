import type {
  DayForecast,
  HourlyForecast,
  IncidentsNow,
  Level,
  ModelInfo,
  RoutePlan,
  Station,
} from "@/lib/api/schemas";

export const STATIONS: Station[] = [
  { station_id: 57, direction: 1, direction_label: "creciente", name: "Los Cristianos" },
  { station_id: 57, direction: -1, direction_label: "decreciente", name: "Los Cristianos" },
  { station_id: 12, direction: 0, direction_label: "único", name: "Anaga" },
];

export const MODEL: ModelInfo = {
  data_until: "2026-09-30T23:00:00",
  high_threshold: 0.25,
  metrics: { volume_wape: 0.1304, high_precision: 0.569, high_recall: 0.65 },
};

/** Un día con atasco fuerte de 7 a 9 y tráfico denso a las 6, a las 9 y a las 14. */
export function levelAt(hour: number): Level {
  if (hour === 7 || hour === 8) return "high";
  if (hour === 6 || hour === 9 || hour === 14) return "medium";
  return "low";
}

export function hourly(date: string, hour: number): HourlyForecast {
  const level = levelAt(hour);
  return {
    time: `${date}T${String(hour).padStart(2, "0")}:00:00`,
    vehicles: level === "high" ? 3000 + hour : level === "medium" ? 1800 : 300 + hour * 10,
    level,
    probability_high:
      level === "high" ? 0.8 + hour / 100 : level === "medium" ? 0.3 : 0.02 + hour / 1000,
    factors:
      level === "high"
        ? [
            { feature: "hour", label: "la hora del día", contribution: 1.4 },
            { feature: "is_holiday", label: "que no es festivo", contribution: -0.3 },
          ]
        : [],
  };
}

export function dayForecast(date = "2026-10-27", station: Station = STATIONS[0]!): DayForecast {
  const hours = Array.from({ length: 24 }, (_, h) => hourly(date, h));
  return {
    station,
    date,
    timezone: "Atlantic/Canary",
    data_until: "2026-09-30T23:00:00",
    hours,
    worst_hour: hours[8]!,
  };
}

/** Obras en la TF-82 y un accidente en la TF-5 junto a Los Cristianos (28.05, -16.71). */
export const INCIDENTS: IncidentsNow = {
  available: true,
  updated: "2026-10-27T08:30:00+00:00",
  source: "DGT · Punto de Acceso Nacional (DATEX II)",
  incidents: [
    {
      id: "1",
      kind: "accident",
      label: "Accidente",
      details: [],
      road: "TF-1",
      kilometer: 72,
      municipality: "Arona",
      latitude: 28.06,
      longitude: -16.7,
      start: "2026-10-27T07:50:00+00:00",
      end: null,
    },
    {
      id: "17264754",
      kind: "works",
      label: "Obras",
      details: ["Vía cortada"],
      road: "TF-82",
      kilometer: 9.5,
      municipality: "El Tanque",
      latitude: 28.352394,
      longitude: -16.780691,
      start: "2026-06-22T09:06:00+00:00",
      end: "2027-03-10T23:00:00+00:00",
    },
  ],
};

/** Santa Cruz a La Laguna: la TF-5 directa con un atasco y un accidente, y un rodeo sin aforos. */
export const ROUTE_PLAN: RoutePlan = {
  origin: {
    id: "santa-cruz-de-tenerife",
    name: "Santa Cruz de Tenerife",
    latitude: 28.4636,
    longitude: -16.2518,
  },
  destination: {
    id: "san-cristobal-de-la-laguna",
    name: "San Cristóbal de La Laguna",
    latitude: 28.4874,
    longitude: -16.3159,
  },
  departure: "2026-10-27T08:00:00",
  source: "© OpenStreetMap · rutas con OSRM",
  routes: [
    {
      name: "Por TF-5",
      roads: ["TF-5"],
      distance_km: 12.3,
      duration_minutes: 15,
      geometry: [
        [-16.2518, 28.4636],
        [-16.2736, 28.4483],
        [-16.3159, 28.4874],
      ],
      stations: [
        {
          station_id: 1,
          name: "Autopista Norte",
          latitude: 28.4483,
          longitude: -16.2736,
          passing: "2026-10-27T08:04:00",
          level: "high",
          probability_high: 0.81,
        },
        {
          station_id: 3,
          name: "Guamasa",
          latitude: 28.48,
          longitude: -16.3,
          passing: "2026-10-27T08:10:00",
          level: "medium",
          probability_high: 0.3,
        },
      ],
      incidents: [INCIDENTS.incidents[0]!],
      closed: false,
      score_minutes: 31,
      recommended: true,
    },
    {
      name: "Por TF-11 y TF-12",
      roads: ["TF-11", "TF-12"],
      distance_km: 15.8,
      duration_minutes: 21,
      geometry: [
        [-16.2518, 28.4636],
        [-16.26, 28.5],
        [-16.3159, 28.4874],
      ],
      stations: [],
      incidents: [],
      closed: false,
      score_minutes: 21,
      recommended: false,
    },
  ],
};
