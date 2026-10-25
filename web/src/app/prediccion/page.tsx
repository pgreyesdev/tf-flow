import { ChevronDown, MapPin } from "lucide-react";
import type { Metadata } from "next";

import { ForecastForm } from "@/components/forecast-form";
import { Notice } from "@/components/notice";
import { Sky } from "@/components/sky";
import { TrafficWeather } from "@/components/traffic-weather";
import { ApiError, getStations } from "@/lib/api/client";
import { getOutlook, type Outlook } from "@/lib/api/outlook";
import type { Station } from "@/lib/api/schemas";
import { serverEnv } from "@/lib/env";
import { headlineHour } from "@/lib/forecast";
import { addDays, currentHourInTenerife, isIsoDate, todayInTenerife } from "@/lib/format";
import {
  findStation,
  parseStationKey,
  sortStations,
  stationKey,
  stationLabel,
} from "@/lib/stations";

export const metadata: Metadata = {
  title: "Previsión por estación",
  description: "Consulta hora a hora el tráfico previsto en cada punto de medida de Tenerife.",
};

const PAST_DAYS = 7;
const FUTURE_DAYS = 14;

const ERROR_MESSAGES: Record<ApiError["kind"], string> = {
  not_found: "No tenemos previsión para ese punto de medida.",
  out_of_range: "Solo hay previsión desde una semana atrás hasta dos semanas vista.",
  rate_limited: "Hay muchas consultas a la vez. Espera un momento y vuelve a intentarlo.",
  unavailable:
    "El servicio de previsión no está disponible ahora mismo. Inténtalo en unos minutos.",
  forbidden: "El servicio de previsión ha rechazado la consulta.",
  invalid_response: "El servicio de previsión ha devuelto una respuesta que no entendemos.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

type Result = Outlook | { error: string };

async function loadOutlook(station: Station, date: string, today: string): Promise<Result> {
  try {
    return await getOutlook(station, date, today);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: ERROR_MESSAGES[error.kind] };
    }
    throw error;
  }
}

export default async function ForecastPage({ searchParams }: PageProps<"/prediccion">) {
  const params = await searchParams;
  const today = todayInTenerife();
  const minDate = addDays(today, -PAST_DAYS);
  const maxDate = addDays(today, FUTURE_DAYS);

  let stations: Station[];
  try {
    stations = sortStations(await getStations());
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return (
      <PageShell>
        <Sky />
        <h1 className="pt-4 font-display text-3xl font-extrabold sm:text-4xl">
          Previsión por estación
        </h1>
        <Notice tone="error" title="No podemos cargar las estaciones">
          {ERROR_MESSAGES[error.kind]}
        </Notice>
      </PageShell>
    );
  }

  const requestedDate = first(params.fecha);
  const date = requestedDate && isIsoDate(requestedDate) ? requestedDate : today;
  const ref = parseStationKey(first(params.estacion));
  const featured = parseStationKey(serverEnv().TFFLOW_FEATURED_STATION);
  const station =
    (ref && findStation(stations, ref)) ||
    (featured && findStation(stations, featured)) ||
    stations[0];
  const unknownStation = ref !== null && !findStation(stations, ref);

  const result = station ? await loadOutlook(station, date, today) : undefined;
  const currentHour = currentHourInTenerife();

  const level =
    result && "forecast" in result
      ? headlineHour(result.forecast, result.forecast.date === today, currentHour).level
      : undefined;

  return (
    <PageShell>
      <Sky level={level} />

      {station && (
        <details
          className="glass group mx-auto w-full max-w-xl p-0"
          open={!(result && "forecast" in result)}
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold [&::-webkit-details-marker]:hidden">
            <MapPin aria-hidden="true" className="size-5 shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate">
              <span className="sr-only">Cambiar punto de medida o día. Ahora: </span>
              {stationLabel(station)}
            </span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-glass-line p-4">
            <ForecastForm
              stations={stations}
              selected={stationKey(station)}
              date={date}
              minDate={minDate}
              maxDate={maxDate}
            />
          </div>
        </details>
      )}

      {unknownStation && (
        <Notice tone="info" title="Ese punto de medida no está en la lista">
          Te mostramos {station ? stationLabel(station) : "otro punto"} en su lugar.
        </Notice>
      )}

      {!station && (
        <Notice tone="info" title="Todavía no hay estaciones con previsión">
          El modelo aún no está publicado. Vuelve a intentarlo más tarde.
        </Notice>
      )}

      {result && "error" in result && (
        <Notice tone="error" title="No hay previsión para esta consulta">
          {result.error}
        </Notice>
      )}

      {result && "forecast" in result ? (
        <TrafficWeather
          forecast={result.forecast}
          days={result.days}
          today={today}
          currentHour={currentHour}
        />
      ) : (
        <h1 className="pt-4 font-display text-3xl font-extrabold sm:text-4xl">
          Previsión por estación
        </h1>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-5xl space-y-4 px-4 pt-2 sm:px-6">{children}</div>;
}
