import { ArrowDown, ArrowRight, CalendarRange, Database, MapPinned, Radar } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import islandRelief from "@/assets/isla-relieve.webp";
import type { Outlook } from "@/lib/api/outlook";
import { calmestDaytimeHour, headlineHour } from "@/lib/forecast";
import { formatPercent, hourLabel, hourOf } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { stationKey } from "@/lib/stations";
import { buttonStyles, cx } from "@/lib/ui";

import { LEVEL_CHIP, LevelIcon } from "../level-badge";

interface HeroProps {
  stationCount: number;
  outlook?: Outlook;
  today: string;
  currentHour: number;
}

/** Portada: qué es TF-FLOW en una frase, la isla de fondo y la previsión de ahora mismo. */
export function Hero({ stationCount, outlook, today, currentHour }: HeroProps) {
  const facts = [
    { icon: Radar, text: stationCount > 0 ? `${stationCount} puntos de medida` : "Toda la isla" },
    { icon: CalendarRange, text: "Hasta 14 días vista" },
    { icon: Database, text: "Datos abiertos desde 2019" },
  ];

  return (
    <section
      aria-labelledby="hero-title"
      className="relative grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-6"
    >
      <div className="relative z-10 text-center lg:text-left">
        <p className="inline-flex animate-rise items-center gap-2 rounded-full border border-glass-line bg-glass px-3 py-1 text-sm font-bold tracking-wider text-accent uppercase">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-low opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-low" />
          </span>
          El tiempo del tráfico en Tenerife
        </p>
        <h1
          id="hero-title"
          className="stagger-1 mt-5 animate-rise font-display text-4xl font-extrabold sm:text-6xl lg:text-[4.25rem]"
        >
          Anticípate al atasco{" "}
          <span className="bg-linear-to-r from-accent via-white to-low bg-clip-text text-transparent">
            antes de coger el coche
          </span>
        </h1>
        <p className="stagger-2 mx-auto mt-5 max-w-xl animate-rise text-lg text-ink-soft sm:text-xl lg:mx-0">
          TF-FLOW predice cuántos vehículos pasarán por las carreteras de Tenerife, hora a hora y
          hasta dos semanas vista, y te avisa de cuándo hay riesgo de atasco. Elige tu tramo en el
          mapa y descubre a qué hora te conviene salir.
        </p>
        <div className="stagger-3 mt-8 flex animate-rise flex-wrap justify-center gap-3 lg:justify-start">
          <Link
            href="/prediccion"
            className={cx(
              buttonStyles.primary,
              "group animate-glow px-6 text-lg motion-reduce:animate-none",
            )}
          >
            <MapPinned aria-hidden="true" className="size-5" />
            Elegir mi tramo en el mapa
            <ArrowRight
              aria-hidden="true"
              className="size-5 transition-transform duration-300 group-hover:translate-x-1"
            />
          </Link>
          <a href="#para-que-sirve" className={cx(buttonStyles.secondary, "group")}>
            Para qué sirve
            <ArrowDown
              aria-hidden="true"
              className="size-5 transition-transform duration-300 group-hover:translate-y-0.5"
            />
          </a>
        </div>
        <ul className="stagger-4 mt-8 flex animate-rise flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-ink-soft lg:justify-start">
          {facts.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-2">
              <Icon aria-hidden="true" className="size-4 text-accent" />
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="stagger-2 relative animate-pop">
        <div className="relative overflow-hidden rounded-[2rem] border border-glass-line shadow-2xl shadow-black/40">
          <Image
            src={islandRelief}
            alt="Relieve de Tenerife visto desde el suroeste, con el Teide en el centro de la isla"
            priority
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full scale-125 object-cover object-[50%_62%] lg:aspect-square"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-linear-to-t from-night/80 via-transparent to-night/20"
          />
          <MapPins />
        </div>
        {outlook && <LiveCard outlook={outlook} today={today} currentHour={currentHour} />}
      </div>
    </section>
  );
}

/** Puntos que laten sobre la imagen, como las estaciones del mapa. Son decorativos. */
const PINS = [
  { position: "top-[30%] left-[74%]", color: "bg-high", delay: "" },
  { position: "top-[38%] left-[63%]", color: "bg-medium", delay: "[animation-delay:600ms]" },
  { position: "top-[57%] left-[48%]", color: "bg-low", delay: "[animation-delay:1200ms]" },
  { position: "top-[72%] left-[38%]", color: "bg-low", delay: "[animation-delay:300ms]" },
  { position: "top-[48%] left-[22%]", color: "bg-medium", delay: "[animation-delay:900ms]" },
] as const;

function MapPins() {
  return (
    <div aria-hidden="true">
      {PINS.map((pin) => (
        <span key={pin.position} className={cx("absolute flex size-3", pin.position)}>
          <span
            className={cx(
              "absolute inline-flex size-full animate-ping rounded-full opacity-70 motion-reduce:animate-none",
              pin.color,
              pin.delay,
            )}
          />
          <span
            className={cx("relative inline-flex size-3 rounded-full ring-2 ring-night", pin.color)}
          />
        </span>
      ))}
    </div>
  );
}

function LiveCard({
  outlook,
  today,
  currentHour,
}: {
  outlook: Outlook;
  today: string;
  currentHour: number;
}) {
  const { forecast } = outlook;
  const isToday = forecast.date === today;
  const headline = headlineHour(forecast, isToday, currentHour);
  const calm = calmestDaytimeHour(forecast.hours);
  const isNow = isToday && hourOf(headline.time) === currentHour;
  const key = stationKey(forecast.station);
  return (
    <Link
      href={{ pathname: "/prediccion", query: { estacion: key } }}
      className="glass lift stagger-5 group relative mx-4 -mt-14 block animate-rise bg-night/60 p-4 sm:absolute sm:-bottom-8 sm:left-6 sm:mx-0 sm:mt-0 sm:w-80 lg:-left-10"
    >
      <p className="flex items-center justify-between gap-2 text-xs font-bold tracking-wider text-ink-soft uppercase">
        <span>{isNow ? "Ahora mismo" : `A las ${hourLabel(headline.time)}`}</span>
        <span
          className={cx(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 tracking-normal normal-case",
            LEVEL_CHIP[headline.level],
          )}
        >
          <LevelIcon level={headline.level} />
          {LEVEL_INFO[headline.level].label}
        </span>
      </p>
      <p className="mt-2 truncate text-lg font-bold">{forecast.station.name}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-extralight tabular">
          {formatPercent(headline.probability_high)}
        </span>
        <span className="text-sm text-ink-soft">riesgo de atasco</span>
      </p>
      {calm && (
        <p className="mt-1 text-sm text-ink-soft">
          Mejor hora para salir hoy: <strong className="text-ink">{hourLabel(calm.time)}</strong>
        </p>
      )}
      <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent">
        Ver el día completo
        <ArrowRight
          aria-hidden="true"
          className="size-4 transition-transform duration-300 group-hover:translate-x-1"
        />
      </p>
    </Link>
  );
}
