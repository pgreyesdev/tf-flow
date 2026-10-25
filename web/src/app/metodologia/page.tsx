import { Sky } from "@/components/sky";
import type { Metadata } from "next";

import { getModelInfo } from "@/lib/api/client";
import type { ModelInfo } from "@/lib/api/schemas";
import { formatPercent, formatShortDate } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";

export const metadata: Metadata = {
  title: "Cómo funciona",
  description: "Datos, modelo y fiabilidad de las previsiones de tráfico de TF-FLOW.",
};

async function modelInfo(): Promise<ModelInfo | undefined> {
  try {
    return await getModelInfo();
  } catch {
    return undefined;
  }
}

const SECTIONS = [
  {
    title: "De dónde salen los datos",
    body: [
      "El Cabildo de Tenerife publica en su portal de datos abiertos el recuento de vehículos de sus estaciones de aforo: puntos de la red insular que cuentan, cada pocos minutos y en cada sentido, cuántos vehículos pasan y a qué velocidad.",
      "TF-FLOW usa los datos desde 2019, agregados por hora: unos 4,7 millones de horas. Los meses del confinamiento de 2020 se excluyen del entrenamiento porque el tráfico de entonces no se parece al de ningún otro momento.",
    ],
  },
  {
    title: "Qué es un atasco",
    body: [
      "Cada estación tiene su propia capacidad: lo que es mucho tráfico en una carretera de montaña es normal en la autopista. Por eso el nivel de cada hora se calcula comparando el tráfico con el máximo habitual de esa misma estación y sentido, revisado cada año.",
    ],
  },
  {
    title: "Cómo predice el modelo",
    body: [
      "El modelo es un conjunto de árboles de decisión (LightGBM) que aprende el ritmo de cada estación a partir de la hora, el día de la semana, el mes, los festivos de Canarias y de Tenerife, los puentes y la tendencia de las últimas semanas publicadas.",
      "Los datos del Cabildo se publican con retraso. Para que la previsión sea honesta, el modelo solo usa lo que ya estaría publicado el día que se hace la previsión, nunca datos del futuro.",
      "Cada previsión llega con sus motivos: el modelo descompone la probabilidad de atasco con valores SHAP y la web muestra los que más pesan en cada hora.",
    ],
  },
  {
    title: "Cómo se ha comprobado",
    body: [
      "El modelo se entrena con los datos hasta 2024 y se evalúa con los de 2025 y 2026, que no ha visto nunca. Se compara con una referencia sencilla, la media histórica de cada estación a cada hora, para demostrar que aporta algo más que el calendario.",
    ],
  },
] as const;

export default async function MethodologyPage() {
  const model = await modelInfo();
  const metrics = model?.metrics ?? {};

  return (
    <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 sm:pt-14">
      <Sky />
      <header>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Cómo funciona</h1>
        <p className="mt-2 text-lg text-ink-soft">
          Qué datos usa TF-FLOW, cómo decide que habrá atasco y hasta qué punto puedes fiarte.
        </p>
      </header>

      <div className="mt-10 space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-display text-2xl font-extrabold">{section.title}</h2>
            <div className="mt-3 space-y-3 text-lg">
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        <section aria-labelledby="levels-title">
          <h2 id="levels-title" className="text-2xl font-bold">
            Los tres niveles
          </h2>
          <dl className="glass mt-4 divide-y divide-glass-line">
            {Object.values(LEVEL_INFO).map((level) => (
              <div key={level.label} className="grid gap-1 p-4 sm:grid-cols-[8rem_1fr]">
                <dt className="font-semibold">{level.label}</dt>
                <dd className="text-ink-soft">{level.description}.</dd>
              </div>
            ))}
          </dl>
        </section>

        {model && (
          <section aria-labelledby="metrics-title">
            <h2 id="metrics-title" className="text-2xl font-bold">
              El modelo en servicio
            </h2>
            <dl className="glass mt-4 divide-y divide-glass-line">
              <Row label="Datos hasta">{formatShortDate(model.data_until)}</Row>
              {metrics.volume_wape !== undefined && (
                <Row label="Error en el número de vehículos">
                  {formatPercent(metrics.volume_wape)} de error absoluto ponderado (WAPE)
                </Row>
              )}
              {metrics.high_recall !== undefined && (
                <Row label="Atascos fuertes detectados">
                  {formatPercent(metrics.high_recall)} de los que hubo (exhaustividad)
                </Row>
              )}
              {metrics.high_precision !== undefined && (
                <Row label="Avisos acertados">
                  {formatPercent(metrics.high_precision)} de los avisos de atasco fuerte (precisión)
                </Row>
              )}
              <Row label="Umbral de aviso">
                Se avisa de atasco fuerte cuando su probabilidad supera el{" "}
                {formatPercent(model.high_threshold)}. Se eligió con datos de entrenamiento para
                avisar de más atascos a cambio de alguna falsa alarma.
              </Row>
            </dl>
          </section>
        )}

        <section>
          <h2 className="font-display text-2xl font-extrabold">Lo que el modelo no sabe</h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 text-lg">
            <li>Accidentes, obras, cortes o eventos que no siguen el calendario.</li>
            <li>El tiempo que hará: la lluvia todavía no forma parte de la previsión.</li>
            <li>
              El tráfico entre estaciones: la previsión es para el punto de medida, no para todo el
              trayecto.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr]">
      <dt className="font-semibold">{label}</dt>
      <dd className="text-ink-soft">{children}</dd>
    </div>
  );
}
