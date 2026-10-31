import { TriangleAlert } from "lucide-react";

import { getIncidents } from "@/lib/api/client";
import type { Incident, IncidentsNow, Station } from "@/lib/api/schemas";
import { incidentPlace, incidentSince, incidentsNear, incidentTitle } from "@/lib/incidents";

export const INCIDENTS_SOURCE = "Dirección General de Tráfico (DGT)";

/** Las incidencias de la DGT, o `undefined` si ahora mismo no se pueden leer. */
export async function loadIncidents(): Promise<IncidentsNow | undefined> {
  const now = await getIncidents().catch(() => undefined);
  return now?.available ? now : undefined;
}

export function IncidentList({ incidents }: { incidents: Incident[] }) {
  return (
    <ul className="space-y-3">
      {incidents.map((incident) => {
        const since = incidentSince(incident);
        return (
          <li key={incident.id} className="flex gap-3">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-incident" />
            <div className="min-w-0">
              <p className="font-semibold">{incidentTitle(incident)}</p>
              <p className="text-ink-soft">
                {incidentPlace(incident)}
                {since && <> · {since}</>}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Aviso en la previsión de hoy si la DGT informa de algo cerca de la estación. */
export async function NearbyIncidents({ station }: { station: Station }) {
  if (station.latitude == null || station.longitude == null) {
    return null;
  }
  const now = await loadIncidents();
  const near = now
    ? incidentsNear(now.incidents, { latitude: station.latitude, longitude: station.longitude })
    : [];
  if (near.length === 0) {
    return null;
  }
  return (
    <section
      aria-labelledby="nearby-incidents"
      className="flex flex-col gap-3 rounded-2xl border border-incident/40 bg-incident/10 p-4 sm:p-5"
    >
      <h2 id="nearby-incidents" className="font-semibold">
        {near.length === 1 ? "Hay una incidencia" : `Hay ${near.length} incidencias`} cerca de este
        punto ahora mismo
      </h2>
      <IncidentList incidents={near} />
      <p className="text-sm text-ink-soft">
        Fuente: {INCIDENTS_SOURCE}. La previsión no las tiene en cuenta: puede haber más tráfico del
        previsto.
      </p>
    </section>
  );
}
