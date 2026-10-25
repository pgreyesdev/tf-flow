import { ArrowDownRight, ArrowUpRight, Clock, Sunrise } from "lucide-react";

import type { DayForecast, Factor } from "@/lib/api/schemas";
import { calmestDaytimeHour, congestedRanges, dayFocus, formatRange } from "@/lib/forecast";
import { formatPercent, formatVehicles, hourLabel } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";

import { LevelBadge } from "./level-badge";

export function FactorList({ factors }: { factors: Factor[] }) {
  if (factors.length === 0) {
    return null;
  }
  return (
    <ul className="space-y-2">
      {[...factors]
        .sort((a, b) => b.contribution - a.contribution)
        .map((factor) => {
          const raises = factor.contribution > 0;
          const Icon = raises ? ArrowUpRight : ArrowDownRight;
          return (
            <li key={factor.feature} className="flex items-start gap-2.5">
              <Icon
                aria-hidden="true"
                className={
                  raises ? "mt-0.5 size-5 shrink-0 text-high" : "mt-0.5 size-5 shrink-0 text-low"
                }
              />
              <span>
                <span className="font-semibold">
                  {raises ? "Sube el riesgo" : "Baja el riesgo"}:
                </span>{" "}
                {factor.label}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

/** Lo que una persona quiere saber de un vistazo: la hora clave, por qué y cuándo salir. */
export function ForecastInsights({ forecast }: { forecast: DayForecast }) {
  const { hour: worst, kind } = dayFocus(forecast);
  const jams = congestedRanges(forecast.hours, "high");
  const dense = congestedRanges(forecast.hours, "medium");
  const calm = calmestDaytimeHour(forecast.hours);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section
        aria-labelledby="worst-hour"
        className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <h3 id="worst-hour" className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Clock aria-hidden="true" className="size-4" />
          {kind === "risk" ? "Hora con más riesgo" : "Hora con más tráfico"}
        </h3>
        <p className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-4xl font-bold tabular">{hourLabel(worst.time)}</span>
          <LevelBadge level={worst.level} size="lg" />
        </p>
        <p className="mt-2 text-muted">
          {kind === "risk"
            ? `${formatPercent(worst.probability_high)} de probabilidad de atasco fuerte. ${LEVEL_INFO[worst.level].description}.`
            : `No se espera atasco fuerte en todo el día. A esta hora pasarán unos ${formatVehicles(worst.vehicles)} vehículos.`}
        </p>
        {kind === "risk" && worst.factors.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <h4 className="mb-2 font-semibold">Por qué</h4>
            <FactorList factors={worst.factors} />
          </div>
        )}
      </section>

      <section
        aria-labelledby="day-summary"
        className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
      >
        <h3 id="day-summary" className="flex items-center gap-2 text-sm font-semibold text-muted">
          <Sunrise aria-hidden="true" className="size-4" />
          El día de un vistazo
        </h3>
        <dl className="mt-3 space-y-4">
          <div>
            <dt className="font-semibold">Atasco fuerte previsto</dt>
            <dd className="text-muted">
              {jams.length > 0 ? jams.map(formatRange).join(", ") : "Ninguna hora"}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Tráfico denso o peor</dt>
            <dd className="text-muted">
              {dense.length > 0 ? dense.map(formatRange).join(", ") : "Ninguna hora"}
            </dd>
          </div>
          {calm && (
            <div>
              <dt className="font-semibold">Hora más tranquila entre las 6 y las 22</dt>
              <dd className="text-muted">
                {hourLabel(calm.time)}, con {formatPercent(calm.probability_high)} de riesgo
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}
