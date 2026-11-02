import type { Metadata } from "next";
import { Suspense, ViewTransition } from "react";

import { loadIncidents, NearbyIncidents } from "@/components/incidents";
import { Notice } from "@/components/notice";
import { PageTransition } from "@/components/page-transition";
import { Sky } from "@/components/sky";
import { StationPicker } from "@/components/station-picker";
import { StationSwitcher } from "@/components/station-switcher";
import { TrafficWeather } from "@/components/traffic-weather";
import { ApiError, getNetworkNow, getStations } from "@/lib/api/client";
import { getOutlook, type Outlook } from "@/lib/api/outlook";
import type { Station } from "@/lib/api/schemas";
import { headlineHour } from "@/lib/forecast";
import { addDays, currentHourInTenerife, isIsoDate, todayInTenerife } from "@/lib/format";
import { pickerMarkers } from "@/lib/map";
import { findStation, parseStationKey, sortStations, stationKey } from "@/lib/stations";

export const metadata: Metadata = {
  title: "Previsión por tramo",
  description: "Elige tu tramo en el mapa de Tenerife y consulta hora a hora el tráfico previsto.",
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
          Previsión por tramo
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
  const station = ref ? findStation(stations, ref) : undefined;
  const unknownStation = first(params.estacion) !== undefined && !station;

  const [result, network, incidents] = await Promise.all([
    station ? loadOutlook(station, date, today) : undefined,
    getNetworkNow().catch(() => undefined),
    loadIncidents(),
  ]);
  const markers = pickerMarkers(stations, network);
  const currentHour = currentHourInTenerife();

  const level =
    result && "forecast" in result
      ? headlineHour(result.forecast, result.forecast.date === today, currentHour).level
      : undefined;

  const picker = (
    <StationPicker
      stations={stations}
      markers={markers}
      incidents={incidents?.incidents}
      selected={station}
      date={date}
      minDate={minDate}
      maxDate={maxDate}
    />
  );

  if (!station) {
    return (
      <PageShell>
        <Sky />
        <header className="pt-6 text-center sm:pt-10">
          <p className="animate-rise text-sm font-bold tracking-wider text-accent uppercase">
            Previsión por tramo
          </p>
          <h1 className="stagger-1 mt-2 animate-rise font-display text-4xl font-extrabold sm:text-5xl">
            ¿Por dónde vas a pasar?
          </h1>
          <p className="stagger-2 mx-auto mt-3 max-w-xl animate-rise text-lg text-ink-soft">
            Toca tu tramo en el mapa de la isla y elige el sentido. Si lo prefieres, búscalo por
            nombre en la lista.
          </p>
        </header>
        {unknownStation && (
          <Notice tone="info" title="Ese punto de medida no está en la lista">
            Elige otro en el mapa o en la lista.
          </Notice>
        )}
        {stations.length > 0 ? (
          <div className="stagger-3 animate-rise">{picker}</div>
        ) : (
          <Notice tone="info" title="Todavía no hay estaciones con previsión">
            El modelo aún no está publicado. Vuelve a intentarlo más tarde.
          </Notice>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Sky level={level} />

      <StationSwitcher key={stationKey(station)} station={station}>
        {picker}
      </StationSwitcher>

      {result && "error" in result && (
        <Notice tone="error" title="No hay previsión para esta consulta">
          {result.error}
        </Notice>
      )}

      <Suspense fallback={null}>
        <NearbyIncidents station={station} date={date} today={today} />
      </Suspense>

      {result && "forecast" in result ? (
        <ViewTransition
          key={`${stationKey(station)}/${date}`}
          enter="page-enter"
          exit="page-exit"
          default="none"
        >
          <TrafficWeather
            forecast={result.forecast}
            days={result.days}
            today={today}
            currentHour={currentHour}
          />
        </ViewTransition>
      ) : (
        <h1 className="pt-4 font-display text-3xl font-extrabold sm:text-4xl">
          Previsión por tramo
        </h1>
      )}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-2 sm:px-6">{children}</div>
    </PageTransition>
  );
}
