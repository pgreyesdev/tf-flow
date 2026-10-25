import { CalendarDays, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ForecastForm } from "@/components/forecast-form";
import { ForecastInsights } from "@/components/forecast-insights";
import { HourlyChart } from "@/components/hourly-chart";
import { Notice } from "@/components/notice";
import { ApiError, getDayForecast, getStations } from "@/lib/api/client";
import { dayFocus } from "@/lib/forecast";
import type { DayForecast, Station } from "@/lib/api/schemas";
import { serverEnv } from "@/lib/env";
import { addDays, formatLongDate, formatShortDate, isIsoDate, todayInTenerife } from "@/lib/format";
import {
  findStation,
  parseStationKey,
  sortStations,
  stationKey,
  stationLabel,
} from "@/lib/stations";
import { cx } from "@/lib/ui";

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

type Result = { forecast: DayForecast } | { error: string };

async function loadForecast(station: Station, date: string): Promise<Result> {
  try {
    return { forecast: await getDayForecast(station.station_id, station.direction, date) };
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

  const result = station ? await loadForecast(station, date) : undefined;

  return (
    <PageShell>
      <ForecastForm
        stations={stations}
        selected={station && stationKey(station)}
        date={date}
        minDate={minDate}
        maxDate={maxDate}
      />
      {station && <DayLinks station={station} today={today} current={date} />}

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

      {result && "forecast" in result && <ForecastResult forecast={result.forecast} />}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Previsión por estación</h1>
        <p className="mt-2 max-w-2xl text-lg text-muted">
          Elige un punto de medida y un día para ver cuántos vehículos se esperan cada hora y cuándo
          hay riesgo de atasco.
        </p>
      </header>
      {children}
    </div>
  );
}

function DayLinks({
  station,
  today,
  current,
}: {
  station: Station;
  today: string;
  current: string;
}) {
  const days = [
    { label: "Hoy", date: today },
    { label: "Mañana", date: addDays(today, 1) },
    { label: "Pasado mañana", date: addDays(today, 2) },
  ];
  return (
    <nav aria-label="Días cercanos" className="-mt-4 flex flex-wrap gap-2">
      {days.map((day) => (
        <Link
          key={day.date}
          href={{
            pathname: "/prediccion",
            query: { estacion: stationKey(station), fecha: day.date },
          }}
          aria-current={day.date === current ? "page" : undefined}
          className={cx(
            "inline-flex min-h-11 items-center rounded-full border px-4 font-semibold transition-colors duration-200",
            day.date === current
              ? "border-accent bg-accent-soft text-accent"
              : "border-border-strong text-muted hover:bg-surface-muted hover:text-foreground",
          )}
        >
          {day.label}
        </Link>
      ))}
    </nav>
  );
}

function ForecastResult({ forecast }: { forecast: DayForecast }) {
  const title = `${stationLabel(forecast.station)}, ${formatLongDate(forecast.date)}`;
  const focus = dayFocus(forecast);
  return (
    <section aria-labelledby="result-title" className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-7">
        <h2 id="result-title" className="text-2xl font-bold">
          {stationLabel(forecast.station)}
        </h2>
        <p className="mt-1 flex items-center gap-2 text-muted">
          <CalendarDays aria-hidden="true" className="size-4" />
          <span className="first-letter:uppercase">{formatLongDate(forecast.date)}</span>
        </p>
        <div className="mt-6">
          <HourlyChart
            hours={forecast.hours}
            highlight={focus.hour.time}
            highlightLabel={focus.kind === "risk" ? "Hora con más riesgo" : "Hora con más tráfico"}
            title={title}
          />
        </div>
      </div>
      <ForecastInsights forecast={forecast} />
      <p className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Previsión hecha con los datos publicados hasta el {formatShortDate(forecast.data_until)}. Es
        orientativa: un accidente, una obra o un evento pueden cambiar el tráfico real.
      </p>
    </section>
  );
}
