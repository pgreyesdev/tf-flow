import {
  CalendarDays,
  Clock,
  MessageCircleQuestion,
  Route,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type { Level } from "@/lib/api/schemas";
import { cx } from "@/lib/ui";

import { LEVEL_TEXT, LevelIcon } from "../level-badge";

/** Una mañana de ejemplo para las ilustraciones. No son datos reales. */
const SAMPLE_HOURS: { hour: string; level: Level; risk: number }[] = [
  { hour: "06", level: "low", risk: 4 },
  { hour: "07", level: "medium", risk: 41 },
  { hour: "08", level: "high", risk: 83 },
  { hour: "09", level: "medium", risk: 37 },
  { hour: "10", level: "low", risk: 9 },
  { hour: "11", level: "low", risk: 5 },
];

const BAR_HEIGHTS = [28, 46, 70, 92, 100, 84, 62, 50, 44, 48, 58, 66, 72, 60, 40, 30];
const BAR_LEVEL = (h: number): Level => (h >= 90 ? "high" : h >= 65 ? "medium" : "low");
const FILL: Record<Level, string> = { low: "fill-low", medium: "fill-medium", high: "fill-high" };

const SMALL: {
  icon: typeof Sparkles;
  title: string;
  text: string;
  href?: "/rutas" | "/asistente";
}[] = [
  {
    icon: Sparkles,
    title: "Te explica el porqué",
    text: "Festivo, puente, hora punta o semanas de más tráfico: ves qué empuja el riesgo arriba o abajo.",
  },
  {
    icon: TriangleAlert,
    title: "Incidencias en directo",
    text: "Accidentes, obras y cortes que comunica la DGT, en el mapa y junto a la previsión de tu tramo.",
  },
  {
    icon: Route,
    title: "Rutas alternativas",
    text: "Dinos de dónde sales y adónde vas: comparamos las rutas por los aforos que cruzan.",
    href: "/rutas",
  },
  {
    icon: MessageCircleQuestion,
    title: "Un asistente que responde",
    text: "Pregunta «¿a qué hora salgo mañana hacia el sur?» y te contesta con la previsión.",
    href: "/asistente",
  },
];

/** Lo que trae cada previsión, con maquetas pequeñas de la interfaz. */
export function Features() {
  return (
    <section aria-labelledby="features-title">
      <div className="reveal max-w-3xl">
        <p className="text-sm font-bold tracking-wider text-accent uppercase">Qué te dice</p>
        <h2 id="features-title" className="mt-2 font-display text-3xl font-extrabold sm:text-5xl">
          Todo lo que necesitas saber de tu tramo, de un vistazo
        </h2>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        <article className="glass lift reveal p-6 sm:p-8 lg:col-span-2">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-glass-strong text-accent">
            <Clock aria-hidden="true" className="size-5" />
          </span>
          <h3 className="mt-4 text-2xl font-bold">El riesgo de atasco, hora a hora</h3>
          <p className="mt-2 max-w-xl text-ink-soft">
            Para cada hora del día ves si el tráfico irá fluido, denso o con atasco, la probabilidad
            de atasco fuerte y cuántos vehículos se esperan. Los colores siempre van con icono y
            texto.
          </p>
          <ol aria-hidden="true" className="cascade mt-6 grid grid-cols-6 gap-2">
            {SAMPLE_HOURS.map((h) => (
              <li
                key={h.hour}
                className={cx(
                  "flex animate-rise flex-col items-center gap-2 rounded-2xl bg-glass px-1 py-3",
                  h.level === "high" && "bg-glass-strong ring-1 ring-glass-line",
                )}
              >
                <span className="text-sm font-bold tabular">{h.hour}:00</span>
                <LevelIcon level={h.level} className={cx("size-6", LEVEL_TEXT[h.level])} />
                <span className="font-extrabold tabular">{h.risk} %</span>
              </li>
            ))}
          </ol>
        </article>

        <article className="glass lift reveal flex flex-col p-6 sm:p-8">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-glass-strong text-accent">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <h3 className="mt-4 text-2xl font-bold">Dos semanas vista</h3>
          <p className="mt-2 text-ink-soft">
            Planifica con tiempo: la previsión llega hasta 14 días y marca la mejor hora para salir.
          </p>
          <div aria-hidden="true" className="mt-auto pt-6">
            <svg viewBox="0 0 160 60" className="grow-bars h-24 w-full" preserveAspectRatio="none">
              {BAR_HEIGHTS.map((h, i) => (
                <rect
                  key={i}
                  x={i * 10 + 1.5}
                  y={60 - (h / 100) * 58}
                  width="7"
                  height={(h / 100) * 58}
                  rx="1.5"
                  data-level={BAR_LEVEL(h)}
                  className={FILL[BAR_LEVEL(h)]}
                />
              ))}
            </svg>
            <p className="mt-3 flex items-center justify-between rounded-2xl bg-glass px-4 py-2 text-sm">
              <span className="text-ink-soft">Mejor hora para salir</span>
              <span className="text-lg font-bold tabular">06:00</span>
            </p>
          </div>
        </article>

        <div className="grid gap-5 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          {SMALL.map(({ icon: Icon, title, text, href }) => {
            const body = (
              <>
                <span className="flex size-11 items-center justify-center rounded-2xl bg-glass-strong text-accent transition-transform duration-500 group-hover:scale-110">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-ink-soft">{text}</p>
              </>
            );
            return href ? (
              <Link key={title} href={href} className="glass lift reveal group block p-6">
                {body}
              </Link>
            ) : (
              <article key={title} className="glass lift reveal group p-6">
                {body}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
