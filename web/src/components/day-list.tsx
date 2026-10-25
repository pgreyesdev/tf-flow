import Link from "next/link";

import type { DaySummary } from "@/lib/forecast";
import { formatPercent, shortWeekday } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

import { LEVEL_TEXT, LevelIcon } from "./level-badge";

interface DayListProps {
  days: DaySummary[];
  today: string;
  selected: string;
  href: (date: string) => { pathname: "/prediccion"; query: Record<string, string> };
}

/**
 * Los próximos días con la franja de riesgo de cada uno sobre una escala común de 0 a 100 %, como
 * las temperaturas mínima y máxima de una app del tiempo.
 */
export function DayList({ days, today, selected, href }: DayListProps) {
  return (
    <ul className="divide-y divide-glass-line">
      {days.map((day) => {
        const name = day.date === today ? "Hoy" : shortWeekday(day.date);
        const left = Math.round(day.minRisk * 100);
        const width = Math.max(Math.round((day.maxRisk - day.minRisk) * 100), 3);
        return (
          <li key={day.date}>
            <Link
              href={href(day.date)}
              aria-current={day.date === selected ? "date" : undefined}
              className={cx(
                "grid min-h-12 grid-cols-[3.5rem_1.75rem_2.75rem_1fr_2.75rem] items-center gap-2 rounded-xl px-1 py-2 transition-colors duration-200 hover:bg-glass",
                day.date === selected && "bg-glass",
              )}
            >
              <span className="font-bold capitalize">{name}</span>
              <LevelIcon level={day.level} className={cx("size-5", LEVEL_TEXT[day.level])} />
              <span className="text-right text-sm text-ink-soft tabular">
                <span className="sr-only">{LEVEL_INFO[day.level].label}. Riesgo entre </span>
                {formatPercent(day.minRisk)}
              </span>
              <svg
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
                aria-hidden="true"
                className="h-1.5 w-full"
              >
                <rect x="0" y="0" width="100" height="6" rx="3" className="fill-glass-strong" />
                <rect
                  x={left}
                  y="0"
                  width={Math.min(width, 100 - left)}
                  height="6"
                  rx="3"
                  className={cx(
                    day.level === "high"
                      ? "fill-high"
                      : day.level === "medium"
                        ? "fill-medium"
                        : "fill-low",
                  )}
                />
              </svg>
              <span className="text-sm font-bold tabular">
                <span className="sr-only"> y </span>
                {formatPercent(day.maxRisk)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
