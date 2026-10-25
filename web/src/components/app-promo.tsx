import { BellRing, Moon, Smartphone, Star } from "lucide-react";

import type { DayForecast } from "@/lib/api/schemas";
import { buttonStyles } from "@/lib/ui";

import { PhoneMockup } from "./phone-mockup";

const FEATURES = [
  {
    icon: BellRing,
    title: "Avisos antes de salir",
    text: "Elige tu trayecto y tu hora habitual, y la app te avisa si ese día se espera atasco.",
  },
  {
    icon: Star,
    title: "Tus estaciones favoritas",
    text: "La previsión de los puntos por los que pasas, siempre a un toque.",
  },
  {
    icon: Moon,
    title: "Hecha para leerse rápido",
    text: "Texto grande, modo oscuro y colores que también distinguen las personas daltónicas.",
  },
] as const;

export function AppPromo({
  playStoreUrl,
  forecast,
}: {
  playStoreUrl?: string;
  forecast?: DayForecast;
}) {
  return (
    <section id="app" aria-labelledby="app-title" className="scroll-mt-24">
      <div className="overflow-hidden rounded-3xl bg-primary text-on-primary">
        <div className="grid items-center gap-10 px-6 py-12 sm:px-10 md:grid-cols-[1.15fr_1fr] md:py-16 lg:px-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-on-primary/25 px-3 py-1 text-sm font-semibold">
              <Smartphone aria-hidden="true" className="size-4" />
              App para Android
            </p>
            <h2 id="app-title" className="mt-4 text-3xl font-bold sm:text-4xl">
              El atasco, en tu bolsillo antes de que empiece
            </h2>
            <p className="mt-4 max-w-xl text-lg opacity-85">
              La app de TF-FLOW usa las mismas previsiones que esta web y te las lleva al móvil, con
              avisos pensados para tus trayectos de cada día.
            </p>
            <ul className="mt-8 space-y-5">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-on-primary/10">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{title}</span>
                    <span className="block opacity-80">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-9">
              {playStoreUrl ? (
                <a
                  href={playStoreUrl}
                  rel="noopener noreferrer"
                  className={`${buttonStyles.primary} bg-on-primary text-primary hover:bg-on-primary/90`}
                >
                  Descargar en Google Play
                </a>
              ) : (
                <p className="inline-flex min-h-11 items-center rounded-xl border border-on-primary/30 px-5 font-semibold">
                  Próximamente en Google Play
                </p>
              )}
            </div>
          </div>
          <div className="flex justify-center md:justify-end">
            <PhoneMockup forecast={forecast} />
          </div>
        </div>
      </div>
    </section>
  );
}
