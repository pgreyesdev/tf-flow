import type { DayForecast, Level } from "@/lib/api/schemas";
import { dayFocus } from "@/lib/forecast";
import { formatPercent, hourLabel, hourOf } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

import { LevelIcon } from "./level-badge";

const SKIES: Record<Level, string> = {
  low: "sky-low",
  medium: "sky-medium",
  high: "sky-high",
};

/** Horas de ejemplo para cuando la API no responde: una mañana típica de día laborable. */
const SAMPLE: { label: string; level: Level; probability: number }[] = [
  { label: "06:00", level: "low", probability: 0.04 },
  { label: "07:00", level: "medium", probability: 0.38 },
  { label: "08:00", level: "high", probability: 0.81 },
  { label: "09:00", level: "medium", probability: 0.42 },
  { label: "10:00", level: "low", probability: 0.09 },
];

function rows(forecast?: DayForecast) {
  if (!forecast) {
    return SAMPLE;
  }
  const focus = hourOf(dayFocus(forecast).hour.time);
  const start = Math.min(Math.max(focus - 2, 0), Math.max(forecast.hours.length - 5, 0));
  return forecast.hours.slice(start, start + 5).map((h) => ({
    label: hourLabel(h.time),
    level: h.level,
    probability: h.probability_high,
  }));
}

/** Ilustración de la app. Es decorativa: el texto de alrededor ya cuenta lo que hace. */
export function PhoneMockup({ forecast }: { forecast?: DayForecast }) {
  const name = forecast ? forecast.station.name : "La Laguna";
  const shown = rows(forecast);
  const top = shown.reduce((a, b) => (b.probability > a.probability ? b : a));
  return (
    <div aria-hidden="true" className="w-[17rem] select-none">
      <div className="overflow-hidden rounded-[2.6rem] border-[10px] border-night shadow-2xl ring-1 shadow-black/50 ring-white/15">
        <div className={cx("sky relative! inset-auto! z-auto! px-4 pt-3 pb-5", SKIES[top.level])}>
          <div className="relative">
            <div className="mx-auto mb-5 h-1.5 w-16 rounded-full bg-white/30" />
            <div className="text-center">
              <p className="truncate font-bold">{name}</p>
              <p className="mt-1 text-6xl leading-none font-extralight tabular">
                {formatPercent(top.probability)}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {LEVEL_INFO[top.level].label} a las {top.label}
              </p>
            </div>
            <ul className="glass mt-5 flex justify-between px-2 py-3">
              {shown.map((row) => (
                <li key={row.label} className="flex flex-col items-center gap-1.5 text-xs">
                  <span className="font-semibold tabular">{row.label.slice(0, 2)}</span>
                  <LevelIcon level={row.level} className="size-4" />
                  <span className="tabular">{formatPercent(row.probability)}</span>
                </li>
              ))}
            </ul>
            <div className="glass mt-3 px-3 py-2.5 text-xs">
              <p className="font-bold">Aviso de tu trayecto</p>
              <p className="mt-0.5 text-ink-soft">
                {top.level === "low"
                  ? "Hoy no se espera atasco. Sal a tu hora de siempre."
                  : `Sal antes de las ${top.label} para evitar el tráfico.`}
              </p>
            </div>
            <div className="mx-auto mt-5 h-1 w-24 rounded-full bg-white/30" />
          </div>
        </div>
      </div>
    </div>
  );
}
