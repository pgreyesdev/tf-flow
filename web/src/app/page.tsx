import { ArrowRight, Brain, Database, MessageCircleQuestion, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppPromo } from "@/components/app-promo";
import { NetworkMap, NetworkMapSkeleton } from "@/components/network-map";
import { Sky } from "@/components/sky";
import { TrafficWeather } from "@/components/traffic-weather";
import { getHomeData } from "@/lib/api/featured";
import { serverEnv } from "@/lib/env";
import { headlineHour } from "@/lib/forecast";
import {
  currentHourInTenerife,
  formatPercent,
  formatShortDate,
  todayInTenerife,
} from "@/lib/format";
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
  const today = todayInTenerife();
  const currentHour = currentHourInTenerife();
  const { stations, outlook, model } = await getHomeData(today);
  const { TFFLOW_PLAY_STORE_URL } = serverEnv();
  const level = outlook && headlineHour(outlook.forecast, true, currentHour).level;

  return (
    <div className="mx-auto max-w-5xl space-y-20 px-4 pt-6 sm:px-6 sm:pt-10">
      <Sky level={level} />

      <section aria-labelledby="hero-title">
        <div className="text-center">
          <p className="text-sm font-bold tracking-wider text-accent uppercase">
            El tiempo del tráfico en Tenerife
          </p>
          <h1
            id="hero-title"
            className="mx-auto mt-2 max-w-2xl font-display text-3xl font-extrabold sm:text-5xl"
          >
            Anticípate al atasco antes de coger el coche
          </h1>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/prediccion" className={buttonStyles.primary}>
              Elegir otra carretera
              <ArrowRight aria-hidden="true" className="size-5" />
            </Link>
            <Link href="/asistente" className={buttonStyles.secondary}>
              Preguntar al asistente
            </Link>
          </div>
          {stations.length > 0 && (
            <p className="mt-4 text-sm text-ink-soft">
              {stations.length} puntos de medida con previsión
              {model && <> · datos hasta el {formatShortDate(model.data_until)}</>}
            </p>
          )}
        </div>

        <div className="mt-6">
          {outlook ? (
            <TrafficWeather
              forecast={outlook.forecast}
              days={outlook.days}
              today={today}
              currentHour={currentHour}
              headingLevel="h2"
            />
          ) : (
            <div className="glass mx-auto mt-6 max-w-lg p-8 text-center">
              <h2 className="text-xl font-bold">La previsión de hoy vuelve enseguida</h2>
              <p className="mt-2 text-ink-soft">
                Ahora mismo no podemos conectar con el modelo. Inténtalo de nuevo en unos minutos.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* El mapa llega después sin retrasar la previsión destacada. */}
      <Suspense fallback={<NetworkMapSkeleton />}>
        <NetworkMap />
      </Suspense>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="font-display text-3xl font-extrabold sm:text-4xl">
          Cómo funciona
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="glass p-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-glass-strong text-accent">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold">
                <span className="sr-only">Paso {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-2 text-ink-soft">{text}</p>
            </li>
          ))}
        </ol>
        {model && <ModelFigures metrics={model.metrics} />}
      </section>

      <AppPromo playStoreUrl={TFFLOW_PLAY_STORE_URL} forecast={outlook?.forecast} />

      <section
        aria-labelledby="assistant-title"
        className="glass grid items-center gap-10 p-6 sm:p-10 md:grid-cols-2"
      >
        <div>
          <span className="flex size-12 items-center justify-center rounded-2xl bg-glass-strong text-accent">
            <MessageCircleQuestion aria-hidden="true" className="size-6" />
          </span>
          <h2 id="assistant-title" className="mt-5 font-display text-3xl font-extrabold">
            Pregunta como se lo preguntarías a alguien
          </h2>
          <p className="mt-3 text-lg text-ink-soft">
            El asistente consulta las previsiones por ti y te responde en lenguaje natural, sin
            buscar estaciones ni fechas.
          </p>
          <Link href="/asistente" className={`${buttonStyles.primary} mt-7`}>
            Hablar con el asistente
            <ArrowRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
        <div aria-hidden="true" className="space-y-3">
          <p className="text-sm font-semibold text-ink-soft">Ejemplo de conversación</p>
          <p className="ml-auto max-w-xs rounded-3xl rounded-br-md bg-white px-4 py-3 text-night">
            ¿A qué hora salgo mañana de La Laguna para no pillar atasco en la autopista?
          </p>
          <p className="max-w-sm rounded-3xl rounded-bl-md bg-glass-strong px-4 py-3">
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
    <div className="mt-4">
      <dl className="glass grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col-reverse">
            <dt className="mt-1 text-ink-soft">{f.label}</dt>
            <dd className="text-5xl font-extralight tabular">{f.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink-soft">
        Medido con datos que el modelo no vio al entrenar.{" "}
        <Link href="/metodologia" className="font-semibold text-accent hover:underline">
          Ver la metodología
        </Link>
      </p>
    </div>
  );
}
