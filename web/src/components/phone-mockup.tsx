import type { DayForecast, HourlyForecast, Level } from "@/lib/api/schemas";
import { dayFocus } from "@/lib/forecast";
import { formatPercent, hourLabel, hourOf } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { stationLabel } from "@/lib/stations";
import { cx } from "@/lib/ui";

import { LevelIcon } from "./level-badge";

const ROW_TONES: Record<Level, string> = {
  low: "bg-low-soft text-low",
  medium: "bg-medium-soft text-medium",
  high: "bg-high-soft text-high",
};

/** Horas de ejemplo para cuando la API no responde: una mañana típica de día laborable. */
const SAMPLE: { hour: number; level: Level; probability: number }[] = [
  { hour: 6, level: "low", probability: 0.04 },
  { hour: 7, level: "medium", probability: 0.38 },
  { hour: 8, level: "high", probability: 0.81 },
  { hour: 9, level: "medium", probability: 0.42 },
  { hour: 10, level: "low", probability: 0.09 },
];

function rows(forecast?: DayForecast) {
  if (!forecast) {
    return SAMPLE.map((s) => ({
      label: `${String(s.hour).padStart(2, "0")}:00`,
      level: s.level,
      probability: s.probability,
    }));
  }
  const focus = hourOf(dayFocus(forecast).hour.time);
  const start = Math.min(Math.max(focus - 2, 0), Math.max(forecast.hours.length - 5, 0));
  return forecast.hours.slice(start, start + 5).map((h: HourlyForecast) => ({
    label: hourLabel(h.time),
    level: h.level,
    probability: h.probability_high,
  }));
}

/** Ilustración de la app. Es decorativa: el texto de alrededor ya cuenta lo que hace. */
export function PhoneMockup({ forecast }: { forecast?: DayForecast }) {
  const title = forecast ? stationLabel(forecast.station) : "TF-5 · La Laguna";
  const shown = rows(forecast);
  const firstBusy = shown.find((r) => r.level !== "low");
  return (
    <div aria-hidden="true" className="w-[17rem] select-none">
      <div className="rounded-[2.6rem] border-[10px] border-slate-800 bg-background p-4 text-foreground shadow-2xl ring-1 shadow-black/40 ring-white/10">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-border-strong" />
        <p className="text-xs font-semibold text-muted">Tu trayecto de hoy</p>
        <p className="mt-0.5 truncate font-bold">{title}</p>
        {firstBusy ? (
          <div className="mt-4 rounded-2xl bg-high-soft p-3 text-high">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <LevelIcon level="high" />
              Sal antes de las {firstBusy.label}
            </p>
            <p className="mt-0.5 text-xs font-medium">Se espera tráfico denso en la hora punta</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-low-soft p-3 text-low">
            <p className="flex items-center gap-1.5 text-sm font-bold">
              <LevelIcon level="low" />
              Hoy no se espera atasco
            </p>
            <p className="mt-0.5 text-xs font-medium">Puedes salir a tu hora de siempre</p>
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {shown.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
            >
              <span className="font-semibold tabular">{row.label}</span>
              <span
                className={cx(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                  ROW_TONES[row.level],
                )}
              >
                <LevelIcon level={row.level} className="size-3.5" />
                {LEVEL_INFO[row.level].label}
              </span>
              <span className="w-10 text-right text-xs text-muted tabular">
                {formatPercent(row.probability)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-border-strong" />
      </div>
    </div>
  );
}
