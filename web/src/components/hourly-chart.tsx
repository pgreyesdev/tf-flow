import type { HourlyForecast, Level } from "@/lib/api/schemas";
import { peakVehicles } from "@/lib/forecast";
import { formatPercent, formatVehicles, hourLabel, hourOf } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

import { LevelIcon } from "./level-badge";

const FILLS: Record<Level, string> = {
  low: "fill-low",
  medium: "fill-medium",
  high: "fill-high",
};

const SWATCHES: Record<Level, string> = {
  low: "bg-low",
  medium: "bg-medium",
  high: "bg-high",
};

const TEXTS: Record<Level, string> = {
  low: "text-low",
  medium: "text-medium",
  high: "text-high",
};

const HEIGHT = 100;
const SLOT = 10;
const BAR = 7;

interface HourlyChartProps {
  hours: HourlyForecast[];
  /** Hora destacada, normalmente la de más riesgo. */
  highlight?: string;
  /** Texto de la leyenda para la hora destacada. */
  highlightLabel?: string;
  title: string;
  compact?: boolean;
}

/**
 * Vehículos previstos por hora, coloreados por nivel. Las barras se dibujan en SVG y los textos en
 * HTML para que no se deformen al estirar la gráfica. Los datos completos están en una tabla.
 */
export function HourlyChart({
  hours,
  highlight,
  highlightLabel = "Hora con más riesgo",
  title,
  compact = false,
}: HourlyChartProps) {
  const peak = peakVehicles(hours) || 1;
  const width = hours.length * SLOT;
  const summary = `${title}. Máximo de ${formatVehicles(peak)} vehículos por hora.`;

  return (
    <figure className="w-full">
      <div className="flex items-baseline justify-between gap-4 text-sm text-ink-soft">
        <span className="tabular">{formatVehicles(peak)} veh/h</span>
        {!compact && <span aria-hidden="true">Vehículos por hora</span>}
      </div>
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={summary}
        className={cx("mt-1 w-full", compact ? "h-28" : "h-44 sm:h-56")}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={width}
            y1={HEIGHT * f}
            y2={HEIGHT * f}
            className="stroke-glass-line"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hours.map((hour, i) => {
          const h = Math.max((hour.vehicles / peak) * (HEIGHT - 4), 1.5);
          const isHighlight = hour.time === highlight;
          return (
            <rect
              key={hour.time}
              x={i * SLOT + (SLOT - BAR) / 2}
              y={HEIGHT - h}
              width={BAR}
              height={h}
              rx="1.2"
              className={cx(FILLS[hour.level], isHighlight && "stroke-ink")}
              strokeWidth={isHighlight ? 2 : 0}
              vectorEffect="non-scaling-stroke"
              data-level={hour.level}
            >
              <title>
                {`${hourLabel(hour.time)} · ${formatVehicles(hour.vehicles)} vehículos · ${LEVEL_INFO[hour.level].label}`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div aria-hidden="true" className="mt-1.5 flex text-xs text-ink-soft tabular">
        {hours.map((hour) => (
          <span key={hour.time} className="flex-1 text-center">
            {hourOf(hour.time) % (compact ? 6 : 3) === 0 ? hourOf(hour.time) : ""}
          </span>
        ))}
      </div>
      {!compact && (
        <>
          <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {(Object.keys(LEVEL_INFO) as Level[]).map((level) => (
              <span key={level} className="inline-flex items-center gap-1.5">
                <span className={cx("size-3 rounded-sm", SWATCHES[level])} />
                <LevelIcon level={level} className={TEXTS[level]} />
                {LEVEL_INFO[level].label}
              </span>
            ))}
            {highlight && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-sm border-2 border-ink" />
                {highlightLabel}
              </span>
            )}
          </figcaption>
          <details className="mt-4 rounded-xl border border-glass-line bg-glass">
            <summary className="cursor-pointer px-4 py-3 font-semibold">
              Ver los datos hora a hora
            </summary>
            <div className="overflow-x-auto px-4 pb-4">
              <table className="w-full text-left text-sm tabular">
                <caption className="sr-only">{title}</caption>
                <thead className="text-ink-soft">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Hora
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-semibold">
                      Vehículos
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Estado
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
                      Riesgo de atasco
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map((hour) => (
                    <tr key={hour.time} className="border-t border-glass-line">
                      <th scope="row" className="py-1.5 pr-4 font-normal">
                        {hourLabel(hour.time)}
                      </th>
                      <td className="py-1.5 pr-4 text-right">{formatVehicles(hour.vehicles)}</td>
                      <td className="py-1.5 pr-4">{LEVEL_INFO[hour.level].label}</td>
                      <td className="py-1.5 text-right">{formatPercent(hour.probability_high)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </figure>
  );
}
