import { ArrowRight, Brain, Database, MessageCircleQuestion, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppPromo } from "@/components/app-promo";
import { HourlyChart } from "@/components/hourly-chart";
import { LevelBadge } from "@/components/level-badge";
import { getHomeData } from "@/lib/api/featured";
import { serverEnv } from "@/lib/env";
import { dayFocus } from "@/lib/forecast";
import { formatLongDate, formatPercent, formatShortDate, hourLabel } from "@/lib/format";
import { stationKey, stationLabel } from "@/lib/stations";
import { buttonStyles } from "@/lib/ui";

const STEPS = [
  {
    icon: Database,
    title: "Datos abiertos del Cabildo",
    text: "Millones de horas de tráfico registradas desde 2019 por las estaciones de aforo de la red insular.",
  },
  {
    icon: Brain,
    title: "Un modelo que conoce cada vía",
    text: "Aprende el ritmo de cada estación: la hora, el día, los festivos y puentes de Canarias y cómo ha ido el tráfico en las últimas semanas.",
  },
  {
    icon: Sparkles,
    title: "Una previsión que se explica",
    text: "No solo te dice cuándo habrá atasco: te cuenta qué lo provoca, para que decidas con criterio.",
  },
] as const;

export default async function HomePage() {
  const { stations, forecast, model } = await getHomeData();
  const { TFFLOW_PLAY_STORE_URL } = serverEnv();
  const focus = forecast && dayFocus(forecast);

  return (
    <div className="mx-auto max-w-6xl space-y-24 px-4 pt-12 sm:px-6 sm:pt-20">
      <section
        aria-labelledby="hero-title"
        className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]"
      >
        <div>
          <p className="text-sm font-semibold tracking-wider text-accent uppercase">
            Tráfico de Tenerife, hora a hora
          </p>
          <h1 id="hero-title" className="mt-3 text-4xl font-bold sm:text-5xl lg:text-6xl">
            Anticípate al atasco antes de coger el coche
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted sm:text-xl">
            TF-FLOW predice el tráfico de las carreteras de la isla para cada hora de los próximos
            días y te dice cuándo conviene salir.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/prediccion" className={buttonStyles.primary}>
              Consultar la previsión
              <ArrowRight aria-hidden="true" className="size-5" />
            </Link>
            <Link href="/#app" className={buttonStyles.secondary}>
              Conoce la app
            </Link>
          </div>
          {stations.length > 0 && (
            <p className="mt-6 text-sm text-muted">
              {stations.length} puntos de medida con previsión
              {model && <> · datos hasta el {formatShortDate(model.data_until)}</>}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-border bg-surface p-5 shadow-xl shadow-slate-900/5 sm:p-7">
          {forecast && focus ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-muted">
                    Hoy, {formatLongDate(forecast.date)}
                  </p>
                  <h2 className="mt-1 text-xl font-bold">{stationLabel(forecast.station)}</h2>
                </div>
                <LevelBadge level={focus.hour.level} />
              </div>
              <p className="mt-4 text-muted">
                {focus.kind === "risk"
                  ? "Hora con más riesgo"
                  : "Sin atasco fuerte previsto. Hora con más tráfico"}
                : <strong className="text-foreground tabular">{hourLabel(focus.hour.time)}</strong>
                {focus.kind === "risk" &&
                  ` (${formatPercent(focus.hour.probability_high)} de probabilidad de atasco fuerte)`}
              </p>
              <div className="mt-5">
                <HourlyChart
                  compact
                  hours={forecast.hours}
                  highlight={focus.hour.time}
                  title={`Previsión de hoy en ${stationLabel(forecast.station)}`}
                />
              </div>
              <Link
                href={{
                  pathname: "/prediccion",
                  query: { estacion: stationKey(forecast.station) },
                }}
                className="mt-5 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent hover:underline"
              >
                Ver el detalle y por qué
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </>
          ) : (
            <div className="py-10 text-center">
              <h2 className="text-xl font-bold">La previsión de hoy vuelve enseguida</h2>
              <p className="mx-auto mt-2 max-w-sm text-muted">
                Ahora mismo no podemos conectar con el modelo. Inténtalo de nuevo en unos minutos.
              </p>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="text-3xl font-bold sm:text-4xl">
          Cómo funciona
        </h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl border border-border bg-surface p-6">
              <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold">
                <span className="sr-only">Paso {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-2 text-muted">{text}</p>
            </li>
          ))}
        </ol>
        {model && <ModelFigures metrics={model.metrics} />}
      </section>

      <AppPromo playStoreUrl={TFFLOW_PLAY_STORE_URL} forecast={forecast} />

      <section
        aria-labelledby="assistant-title"
        className="grid items-center gap-10 rounded-3xl border border-border bg-surface p-6 sm:p-10 md:grid-cols-2"
      >
        <div>
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <MessageCircleQuestion aria-hidden="true" className="size-6" />
          </span>
          <h2 id="assistant-title" className="mt-5 text-3xl font-bold">
            Pregunta como se lo preguntarías a alguien
          </h2>
          <p className="mt-3 text-lg text-muted">
            El asistente consulta las previsiones por ti y te responde en lenguaje natural, sin
            buscar estaciones ni fechas.
          </p>
          <Link href="/asistente" className={`${buttonStyles.primary} mt-7`}>
            Hablar con el asistente
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
        <div aria-hidden="true" className="space-y-3">
          <p className="text-sm font-semibold text-muted">Ejemplo de conversación</p>
          <p className="ml-auto max-w-xs rounded-2xl rounded-br-md bg-accent px-4 py-3 text-on-accent">
            ¿A qué hora salgo mañana de La Laguna para no pillar atasco en la autopista?
          </p>
          <p className="max-w-sm rounded-2xl rounded-bl-md bg-surface-muted px-4 py-3">
            Mañana se espera atasco fuerte de 07:00 a 09:00. Si puedes, sal antes de las 6:30 o
            espera a las 9:30, cuando el riesgo baja por debajo del 10 %.
          </p>
        </div>
      </section>
    </div>
  );
}

function ModelFigures({ metrics }: { metrics: Record<string, number> }) {
  const figures = [
    metrics.volume_wape !== undefined && {
      value: formatPercent(metrics.volume_wape),
      label: "de error medio al prever cuántos vehículos pasarán",
    },
    metrics.high_recall !== undefined && {
      value: formatPercent(metrics.high_recall),
      label: "de los atascos fuertes avisados con antelación",
    },
    metrics.high_precision !== undefined && {
      value: formatPercent(metrics.high_precision),
      label: "de los avisos de atasco que acaban siéndolo",
    },
  ].filter((f): f is { value: string; label: string } => Boolean(f));

  if (figures.length === 0) {
    return null;
  }
  return (
    <div className="mt-8">
      <dl className="grid gap-6 rounded-2xl bg-surface-muted p-6 sm:grid-cols-3 sm:p-8">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col-reverse">
            <dt className="mt-1 text-muted">{f.label}</dt>
            <dd className="text-4xl font-bold tabular">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">
        Medido con datos que el modelo no vio al entrenar.{" "}
        <Link href="/metodologia" className="font-semibold text-accent hover:underline">
          Ver la metodología
        </Link>
      </p>
    </div>
  );
}
