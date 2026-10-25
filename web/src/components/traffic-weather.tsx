import { CalendarDays, Car, Clock, Info, Sparkles, Sunrise } from "lucide-react";

import type { DayForecast } from "@/lib/api/schemas";
import {
  calmestDaytimeHour,
  type DaySummary,
  daySentence,
  dayFocus,
  headlineHour,
  upcomingHours,
} from "@/lib/forecast";
import {
  addDays,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatVehicles,
  hourLabel,
  hourOf,
} from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { stationKey } from "@/lib/stations";

import { DayList } from "./day-list";
import { FactorList } from "./forecast-insights";
import { GlassCard } from "./glass-card";
import { HourlyChart } from "./hourly-chart";
import { HourlyStrip } from "./hourly-strip";
import { LevelBadge } from "./level-badge";

interface TrafficWeatherProps {
  forecast: DayForecast;
  days: DaySummary[];
  today: string;
  currentHour: number;
  /** Nivel del encabezado: `h1` en la página de previsión, `h2` dentro de la portada. */
  headingLevel?: "h1" | "h2";
}

/** El parte del tráfico de un punto de medida, con la estructura de una app del tiempo. */
export function TrafficWeather({
  forecast,
  days,
  today,
  currentHour,
  headingLevel: Heading = "h1",
}: TrafficWeatherProps) {
  const isToday = forecast.date === today;
  const headline = headlineHour(forecast, isToday, currentHour);
  const focus = dayFocus(forecast);
  const calm = calmestDaytimeHour(forecast.hours);
  const peak = forecast.hours.reduce((a, b) => (b.vehicles > a.vehicles ? b : a));
  const key = stationKey(forecast.station);
  const isNow = isToday && hourOf(headline.time) === currentHour;
  const dayLabel = isToday
    ? "Hoy"
    : forecast.date === addDays(today, 1)
      ? "Mañana"
      : formatLongDate(forecast.date).replace(/ de \d{4}$/, "");
  const title = `${forecast.station.name}, ${formatLongDate(forecast.date)}`;

  return (
    <div className="space-y-4">
      <header className="pt-6 pb-4 text-center sm:pt-10 sm:pb-8">
        <p className="text-sm font-bold tracking-wider text-ink-soft uppercase first-letter:uppercase">
          {dayLabel}
        </p>
        <Heading className="mt-1 text-3xl font-extrabold sm:text-4xl">
          {forecast.station.name}
        </Heading>
        <p className="text-ink-soft">Sentido {forecast.station.direction_label}</p>
        <p className="mt-2 text-8xl leading-none font-extralight tracking-tighter tabular sm:text-9xl">
          {Math.round(headline.probability_high * 100)}
          <span className="align-top text-5xl font-light sm:text-6xl">%</span>
        </p>
        <p className="mt-2 text-xl font-bold">
          {LEVEL_INFO[headline.level].label}
          <span className="font-medium text-ink-soft">
            {" "}
            · riesgo de atasco {isNow ? "ahora" : `a las ${hourLabel(headline.time)}`}
          </span>
        </p>
        <p className="mt-1 text-ink-soft tabular">
          Máx. {formatPercent(focus.hour.probability_high)} a las {hourLabel(focus.hour.time)}
          {calm && (
            <>
              {" "}
              · Mín. {formatPercent(calm.probability_high)} a las {hourLabel(calm.time)}
            </>
          )}
        </p>
      </header>

      <section aria-labelledby="hourly-title" className="glass p-4 sm:p-5">
        <h2 id="hourly-title" className="sr-only">
          Hora a hora
        </h2>
        <p className="border-b border-glass-line pb-3 font-semibold">
          {daySentence(forecast.hours)}
        </p>
        <div className="mt-3">
          <HourlyStrip
            hours={upcomingHours(forecast.hours, isToday, currentHour)}
            now={isNow ? headline.time : undefined}
            highlight={focus.kind === "risk" ? focus.hour.time : undefined}
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {days.length > 1 && (
          <GlassCard title={`Próximos ${days.length} días`} icon={CalendarDays}>
            <DayList
              days={days}
              today={today}
              selected={forecast.date}
              href={(date) => ({ pathname: "/prediccion", query: { estacion: key, fecha: date } })}
            />
          </GlassCard>
        )}

        <div className="grid grid-cols-2 content-start gap-4">
          <GlassCard title="Mejor hora para salir" icon={Sunrise}>
            {calm ? (
              <>
                <p className="text-4xl font-light tabular">{hourLabel(calm.time)}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  {formatPercent(calm.probability_high)} de riesgo, entre las 6 y las 22
                </p>
              </>
            ) : (
              <p className="text-ink-soft">Sin datos de día</p>
            )}
          </GlassCard>
          <GlassCard title="Hora punta" icon={Car}>
            <p className="text-4xl font-light tabular">{hourLabel(peak.time)}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {formatVehicles(peak.vehicles)} vehículos previstos
            </p>
          </GlassCard>
          <GlassCard
            title={focus.kind === "risk" ? "Por qué hay riesgo" : "Lo que más pesa"}
            icon={Sparkles}
            className="col-span-2"
          >
            <p className="mb-3 flex flex-wrap items-center gap-2">
              <span className="font-bold tabular">{hourLabel(focus.hour.time)}</span>
              <LevelBadge level={focus.hour.level} />
            </p>
            {focus.hour.factors.length > 0 ? (
              <FactorList factors={focus.hour.factors} />
            ) : (
              <p className="text-ink-soft">El modelo no destaca ningún motivo.</p>
            )}
          </GlassCard>
        </div>
      </div>

      <GlassCard title="Vehículos por hora" icon={Clock}>
        <HourlyChart
          hours={forecast.hours}
          highlight={focus.hour.time}
          highlightLabel={focus.kind === "risk" ? "Hora con más riesgo" : "Hora con más tráfico"}
          title={title}
        />
      </GlassCard>

      <p className="flex items-start justify-center gap-2 px-2 text-center text-sm text-ink-soft">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Previsión con los datos publicados hasta el {formatShortDate(forecast.data_until)}. Es
        orientativa: un accidente, una obra o un evento pueden cambiar el tráfico real.
      </p>
    </div>
  );
}
