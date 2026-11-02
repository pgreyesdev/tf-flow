import { ArrowRight, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AppPromo } from "@/components/app-promo";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Limits } from "@/components/landing/limits";
import { UseCases } from "@/components/landing/use-cases";
import { NetworkMap, NetworkMapSkeleton } from "@/components/network-map";
import { PageTransition } from "@/components/page-transition";
import { Sky } from "@/components/sky";
import { getHomeData } from "@/lib/api/featured";
import { serverEnv } from "@/lib/env";
import { headlineHour } from "@/lib/forecast";
import { currentHourInTenerife, todayInTenerife } from "@/lib/format";
import { buttonStyles } from "@/lib/ui";

export default async function HomePage() {
  const today = todayInTenerife();
  const currentHour = currentHourInTenerife();
  const { stations, outlook, model } = await getHomeData(today);
  const { TFFLOW_PLAY_STORE_URL } = serverEnv();
  const level = outlook && headlineHour(outlook.forecast, true, currentHour).level;

  return (
    <PageTransition>
      <div className="mx-auto max-w-6xl space-y-28 px-4 pt-8 sm:px-6 sm:pt-14">
        <Sky level={level} />

        <Hero
          stationCount={stations.length}
          outlook={outlook}
          today={today}
          currentHour={currentHour}
        />

        <UseCases />

        <Features />

        {/* El mapa llega después sin retrasar el resto de la portada. */}
        <Suspense fallback={<NetworkMapSkeleton />}>
          <NetworkMap />
        </Suspense>

        <HowItWorks metrics={model?.metrics} />

        <Limits />

        <AppPromo playStoreUrl={TFFLOW_PLAY_STORE_URL} forecast={outlook?.forecast} />

        <section
          aria-labelledby="assistant-title"
          className="glass reveal grid items-center gap-10 p-6 sm:p-10 md:grid-cols-2"
        >
          <div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-glass-strong text-accent">
              <MessageCircleQuestion aria-hidden="true" className="size-6" />
            </span>
            <h2 id="assistant-title" className="mt-5 font-display text-3xl font-extrabold">
              Pregunta como se lo preguntarías a alguien
            </h2>
            <p className="mt-3 text-lg text-ink-soft">
              El asistente consulta las previsiones por ti y te responde en lenguaje natural, sin
              buscar estaciones ni fechas.
            </p>
            <Link href="/asistente" className={`${buttonStyles.primary} group mt-7`}>
              Hablar con el asistente
              <ArrowRight
                aria-hidden="true"
                className="size-5 transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
          </div>
          <div aria-hidden="true" className="space-y-3">
            <p className="text-sm font-semibold text-ink-soft">Ejemplo de conversación</p>
            <p className="ml-auto max-w-xs rounded-3xl rounded-br-md bg-white px-4 py-3 text-night">
              ¿A qué hora salgo mañana de La Laguna para no pillar atasco en la autopista?
            </p>
            <p className="max-w-sm rounded-3xl rounded-bl-md bg-glass-strong px-4 py-3">
              Mañana se espera atasco fuerte de 07:00 a 09:00. Si puedes, sal antes de las 6:30 o
              espera a las 9:30, cuando el riesgo baja por debajo del 10 %.
            </p>
          </div>
        </section>

        <FinalCta />
      </div>
    </PageTransition>
  );
}
