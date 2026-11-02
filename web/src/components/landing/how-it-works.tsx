import { Brain, Database, Sparkles } from "lucide-react";
import Link from "next/link";

import { CountUp } from "../count-up";

const STEPS = [
  {
    icon: Database,
    title: "Datos abiertos del Cabildo",
    text: "Las estaciones de aforo de la red insular cuentan, en cada sentido, cuántos vehículos pasan y a qué velocidad. TF-FLOW usa millones de horas registradas desde 2019.",
  },
  {
    icon: Brain,
    title: "Un modelo que conoce cada vía",
    text: "Aprende el ritmo de cada estación: la hora, el día, el mes, los festivos y puentes de Canarias y cómo ha ido el tráfico en las últimas semanas publicadas.",
  },
  {
    icon: Sparkles,
    title: "Una previsión que se explica",
    text: "Calcula cuántos vehículos pasarán y la probabilidad de atasco fuerte, y te cuenta qué lo provoca para que decidas con criterio.",
  },
] as const;

/** Los tres pasos del sistema y lo bien que acierta, medido con datos que no vio al entrenar. */
export function HowItWorks({ metrics }: { metrics?: Record<string, number> }) {
  return (
    <section aria-labelledby="how-title">
      <div className="reveal max-w-3xl">
        <p className="text-sm font-bold tracking-wider text-accent uppercase">Cómo funciona</p>
        <h2 id="how-title" className="mt-2 font-display text-3xl font-extrabold sm:text-5xl">
          De un contador en la carretera a tu previsión
        </h2>
      </div>
      <ol className="relative mt-10 grid gap-5 md:grid-cols-3">
        <span
          aria-hidden="true"
          className="grow-bar-x absolute top-12 right-[16%] left-[16%] hidden h-px bg-linear-to-r from-accent/0 via-accent/60 to-accent/0 md:block"
        />
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="glass lift reveal relative p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-glass-strong text-accent">
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <span
                aria-hidden="true"
                className="font-display text-4xl font-extrabold text-white/15"
              >
                0{i + 1}
              </span>
            </div>
            <h3 className="mt-5 text-lg font-bold">
              <span className="sr-only">Paso {i + 1}: </span>
              {title}
            </h3>
            <p className="mt-2 text-ink-soft">{text}</p>
          </li>
        ))}
      </ol>
      {metrics && <ModelFigures metrics={metrics} />}
    </section>
  );
}

function ModelFigures({ metrics }: { metrics: Record<string, number> }) {
  const figures = [
    metrics.volume_wape !== undefined && {
      value: metrics.volume_wape,
      label: "de error medio al prever cuántos vehículos pasarán",
    },
    metrics.high_recall !== undefined && {
      value: metrics.high_recall,
      label: "de los atascos fuertes avisados con antelación",
    },
    metrics.high_precision !== undefined && {
      value: metrics.high_precision,
      label: "de los avisos de atasco que acaban siéndolo",
    },
  ].filter((f): f is { value: number; label: string } => Boolean(f));

  if (figures.length === 0) {
    return null;
  }
  return (
    <div className="reveal mt-5">
      <dl className="glass grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col-reverse">
            <dt className="mt-1 text-ink-soft">{f.label}</dt>
            <dd className="text-5xl font-extralight">
              <CountUp value={Math.round(f.value * 100)} suffix=" %" />
            </dd>
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
