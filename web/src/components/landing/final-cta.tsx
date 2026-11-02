import { ArrowRight, MapPinned } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import islandRelief from "@/assets/isla-relieve.webp";
import { buttonStyles, cx } from "@/lib/ui";

/** Cierre de la portada: una sola acción, ir al mapa. */
export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-title"
      className="reveal relative overflow-hidden rounded-[2rem] border border-glass-line"
    >
      <Image
        src={islandRelief}
        alt=""
        fill
        sizes="100vw"
        className="absolute inset-0 size-full object-cover object-[50%_65%] opacity-90 sm:left-1/4 sm:w-3/4"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-linear-to-r from-night via-night/70 to-night/0"
      />
      <div className="relative px-6 py-14 sm:px-12 sm:py-20">
        <h2 id="cta-title" className="max-w-lg font-display text-3xl font-extrabold sm:text-5xl">
          ¿Por dónde vas a pasar mañana?
        </h2>
        <p className="mt-4 max-w-md text-lg text-ink-soft">
          Toca tu tramo en el mapa de la isla y mira la previsión hora a hora.
        </p>
        <Link href="/prediccion" className={cx(buttonStyles.primary, "group mt-8 px-6 text-lg")}>
          <MapPinned aria-hidden="true" className="size-5" />
          Abrir el mapa
          <ArrowRight
            aria-hidden="true"
            className="size-5 transition-transform duration-300 group-hover:translate-x-1"
          />
        </Link>
      </div>
    </section>
  );
}
