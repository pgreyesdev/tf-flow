import type { HourlyForecast } from "@/lib/api/schemas";
import { formatPercent, formatVehicles, hourLabel } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

import { LEVEL_TEXT, LevelIcon } from "./level-badge";

interface HourlyStripProps {
  hours: HourlyForecast[];
  /** Hora que se rotula «Ahora». */
  now?: string;
  highlight?: string;
}

/** Previsión hora a hora deslizable: hora, estado y riesgo de atasco, como el parte por horas. */
export function HourlyStrip({ hours, now, highlight }: HourlyStripProps) {
  return (
    <ol
      className="scroll-x relative -mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
      aria-label="Hora a hora"
    >
      {hours.map((hour) => {
        const label = hour.time === now ? "Ahora" : hourLabel(hour.time);
        return (
          <li
            key={hour.time}
            className={cx(
              "flex min-w-16 snap-start flex-col items-center gap-2 rounded-2xl px-2 py-3",
              hour.time === highlight && "bg-glass-strong ring-1 ring-glass-line",
            )}
          >
            <span className="text-sm font-bold tabular">{label}</span>
            <LevelIcon level={hour.level} className={cx("size-6", LEVEL_TEXT[hour.level])} />
            <span className="sr-only">{LEVEL_INFO[hour.level].label}, </span>
            <span className="text-base font-extrabold tabular">
              {formatPercent(hour.probability_high)}
            </span>
            <span className="text-xs text-ink-soft tabular">
              {formatVehicles(hour.vehicles)}
              <span className="sr-only"> vehículos</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
