import { Briefcase, Plane, Sun } from "lucide-react";
import Image, { type StaticImageData } from "next/image";

import metroImage from "@/assets/metro.webp";
import northImage from "@/assets/norte.webp";
import southImage from "@/assets/sur.webp";
import type { Level } from "@/lib/api/schemas";
import { LEVEL_INFO } from "@/lib/levels";
import { cx } from "@/lib/ui";

import { LEVEL_CHIP, LevelIcon } from "../level-badge";

interface UseCase {
  icon: typeof Briefcase;
  title: string;
  text: string;
  image: StaticImageData;
  alt: string;
  example: { when: string; level: Level };
}

const CASES: UseCase[] = [
  {
    icon: Briefcase,
    title: "Ir a trabajar o a clase",
    text: "La autopista entre Santa Cruz y La Laguna se llena cada mañana. Mira cuándo empieza el atasco en tu tramo y decide si te compensa salir un poco antes o un poco después.",
    image: metroImage,
    alt: "Relieve del área metropolitana de Santa Cruz y La Laguna, con el macizo de Anaga",
    example: { when: "Lunes · 07:30", level: "high" },
  },
  {
    icon: Sun,
    title: "Volver del sur sin sorpresas",
    text: "Los domingos por la tarde la vuelta desde la costa se carga. Compara las horas y los próximos días antes de salir, y elige el momento más tranquilo.",
    image: southImage,
    alt: "Relieve del sur de Tenerife, con el Teide al fondo",
    example: { when: "Domingo · 18:00", level: "medium" },
  },
  {
    icon: Plane,
    title: "Llegar a tiempo al aeropuerto",
    text: "¿Vuelo a primera hora o justo en hora punta? Consulta el tramo que te lleva al aeropuerto con hasta dos semanas de antelación y reserva el margen que necesitas.",
    image: northImage,
    alt: "Relieve de la vertiente norte de Tenerife, con las cumbres al fondo",
    example: { when: "Viernes · 06:00", level: "low" },
  },
];

/** Para qué sirve, contado con tres situaciones de todos los días en la isla. */
export function UseCases() {
  return (
    <section id="para-que-sirve" aria-labelledby="uses-title" className="scroll-mt-24">
      <div className="reveal max-w-3xl">
        <p className="text-sm font-bold tracking-wider text-accent uppercase">Para qué sirve</p>
        <h2 id="uses-title" className="mt-2 font-display text-3xl font-extrabold sm:text-5xl">
          Decide cuándo salir con la previsión de tu carretera
        </h2>
        <p className="mt-4 text-lg text-ink-soft">
          Igual que miras el tiempo antes de ir a la playa, TF-FLOW te dice cómo estará el tráfico
          en el tramo por el que vas a pasar: cuántos vehículos se esperan, cuál es el riesgo de
          atasco a cada hora y por qué. Así eliges la hora, el día o incluso la ruta antes de coger
          el coche.
        </p>
      </div>
      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {CASES.map(({ icon: Icon, title, text, image, alt, example }) => (
          <li key={title} className="glass lift reveal group overflow-hidden p-0">
            <div className="relative overflow-hidden">
              <Image
                src={image}
                alt={alt}
                sizes="(min-width: 768px) 33vw, 100vw"
                className="aspect-[4/3] w-full object-cover object-bottom transition-transform duration-700 ease-out group-hover:scale-105"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-linear-to-t from-night/90 via-night/10 to-transparent"
              />
              <p
                aria-hidden="true"
                className="absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full bg-night/75 px-3 py-1 text-sm font-semibold backdrop-blur"
              >
                {example.when}
                <span
                  className={cx(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold",
                    LEVEL_CHIP[example.level],
                  )}
                >
                  <LevelIcon level={example.level} className="size-3.5" />
                  {LEVEL_INFO[example.level].label}
                </span>
              </p>
            </div>
            <div className="p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-glass-strong text-accent transition-transform duration-500 group-hover:-rotate-6">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-ink-soft">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
