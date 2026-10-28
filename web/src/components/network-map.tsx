import Link from "next/link";

import { IslandMap } from "@/components/island-map";
import { LEVEL_CHIP, LevelBadge, LevelIcon } from "@/components/level-badge";
import { getNetworkNow } from "@/lib/api/client";
import { LEVELS } from "@/lib/api/schemas";
import { formatPercent } from "@/lib/format";
import { LEVEL_INFO } from "@/lib/levels";
import { mapPoints } from "@/lib/map";
import { cx } from "@/lib/ui";

const TOP_STATIONS = 5;

function forecastHref(key: string) {
  return { pathname: "/prediccion", query: { estacion: key } } as const;
}

/** El mapa de la portada: la isla en relieve y cada estación con su nivel de esta hora. */
export async function NetworkMap() {
  const network = await getNetworkNow().catch(() => undefined);
  const points = network ? mapPoints(network) : [];
  if (!network || points.length === 0) {
    return null;
  }
  const hour = network.time.slice(11, 16);
  const counts = Object.fromEntries(
    LEVELS.map((level) => [level, points.filter((p) => p.level === level).length]),
  );

  return (
    <section aria-labelledby="map-title">
      <h2 id="map-title" className="font-display text-3xl font-extrabold sm:text-4xl">
        La isla, ahora
      </h2>
      <p className="mt-2 text-ink-soft">
        Previsión de las {hour} en {points.length} puntos de medida. Pulsa uno para ver su día.
      </p>

      <div className="glass mt-6 overflow-hidden p-0">
        <div className="h-[22rem] sm:h-[34rem]">
          <IslandMap
            points={points}
            label={`Mapa en relieve de Tenerife con ${points.length} estaciones de aforo`}
          />
        </div>
        <ul aria-label="Leyenda" className="flex flex-wrap gap-2 border-t border-glass-line p-4">
          {LEVELS.map((level) => (
            <li
              key={level}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold",
                LEVEL_CHIP[level],
              )}
            >
              <LevelIcon level={level} />
              {LEVEL_INFO[level].label}: {counts[level]}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="glass p-6">
          <h3 className="text-lg font-bold">Dónde hay más riesgo a esta hora</h3>
          <ol className="mt-3 space-y-2">
            {points.slice(0, TOP_STATIONS).map((point) => (
              <li key={point.stationId}>
                <Link
                  href={forecastHref(point.key)}
                  className="flex items-center justify-between gap-3 rounded-xl px-2 py-1 hover:bg-glass-strong"
                >
                  <span className="min-w-0 truncate">{point.name}</span>
                  <span className="shrink-0 text-ink-soft tabular">
                    {formatPercent(point.probabilityHigh)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
        <details className="glass group p-6">
          <summary className="cursor-pointer text-lg font-bold">
            Todas las estaciones del mapa
          </summary>
          <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-2">
            {[...points]
              .sort((a, b) => a.name.localeCompare(b.name, "es"))
              .map((point) => (
                <li key={point.stationId}>
                  <Link
                    href={forecastHref(point.key)}
                    className="flex items-center justify-between gap-3 rounded-xl px-2 py-1 hover:bg-glass-strong"
                  >
                    <span className="min-w-0 truncate">{point.name}</span>
                    <LevelBadge level={point.level} />
                  </Link>
                </li>
              ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

export function NetworkMapSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="glass h-[22rem] animate-pulse motion-reduce:animate-none sm:h-[34rem]"
    />
  );
}
