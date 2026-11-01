"use client";

import { Clock, Route, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { LevelBadge } from "@/components/level-badge";
import { RouteMap } from "@/components/route-map";
import type { RoutePlan } from "@/lib/api/schemas";
import { hourLabel } from "@/lib/format";
import { incidentPlace, incidentTitle } from "@/lib/incidents";
import { formatDistance, formatDuration, recommendationReason, trafficSummary } from "@/lib/routes";
import { cx } from "@/lib/ui";

/** El mapa con las rutas y, al lado, una tarjeta por ruta. Elegir una la resalta en el mapa. */
export function RouteResults({ plan }: { plan: RoutePlan }) {
  const [selected, setSelected] = useState(0);
  const reason = recommendationReason(plan);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="glass h-[24rem] overflow-hidden p-0 sm:h-[34rem]">
        <RouteMap plan={plan} selected={selected} onSelect={setSelected} />
      </div>

      <ol aria-label="Rutas" className="space-y-3">
        {plan.routes.map((route, index) => (
          <li key={route.name + index}>
            <button
              type="button"
              aria-pressed={index === selected}
              onClick={() => setSelected(index)}
              className={cx(
                "glass w-full p-4 text-left transition-colors",
                index === selected ? "border-2 border-accent" : "hover:bg-glass-strong",
              )}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-bold">
                  <Route aria-hidden="true" className="size-5 shrink-0 text-accent" />
                  {route.name}
                </span>
                {route.recommended && (
                  <span className="rounded-full bg-accent px-2.5 py-0.5 text-sm font-bold text-accent-ink">
                    Recomendada
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-ink-soft">
                <Clock aria-hidden="true" className="size-4" />
                {formatDuration(route.duration_minutes)} sin tráfico ·{" "}
                {formatDistance(route.distance_km)}
              </span>
              {route.recommended && reason && (
                <span className="mt-1 block text-sm text-ink-soft">{reason}</span>
              )}
              <span className="mt-2 block">{trafficSummary(route)}</span>
              {route.closed && (
                <span className="mt-2 block font-bold text-incident">
                  La DGT informa de un corte en esta ruta.
                </span>
              )}
            </button>
            {index === selected && (route.stations.length > 0 || route.incidents.length > 0) && (
              <div className="mt-2 space-y-2 px-1">
                {route.incidents.map((incident) => (
                  <p key={incident.id} className="flex gap-2">
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-incident"
                    />
                    <span>
                      <span className="font-semibold">{incidentTitle(incident)}</span>
                      <span className="block text-sm text-ink-soft">{incidentPlace(incident)}</span>
                    </span>
                  </p>
                ))}
                {route.stations.length > 0 && (
                  <ul aria-label="Aforos de la ruta" className="space-y-1.5">
                    {route.stations.map((station) => (
                      <li
                        key={station.station_id}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0 truncate">
                          <span className="text-ink-soft tabular">
                            {hourLabel(station.passing)}
                          </span>{" "}
                          {station.name}
                        </span>
                        <LevelBadge level={station.level} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
