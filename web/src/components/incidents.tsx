import { TriangleAlert } from "lucide-react";

import { getIncidents } from "@/lib/api/client";
import type { Incident, IncidentsNow, Station } from "@/lib/api/schemas";
import {
  activeOn,
  incidentPlace,
  incidentSince,
  incidentsNear,
  incidentTitle,
} from "@/lib/incidents";

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

function headline(near: Incident[]): string {
  const [first] = near;
  if (near.length > 1 || !first) {
    return `${near.length} incidencias cerca de este punto`;
  }
  return first.road
    ? `${first.label} en la ${first.road}, cerca de este punto`
    : `${first.label} cerca de este punto`;
}

/**
 * Aviso en la previsión si la DGT informa de algo cerca de la estación: hoy, cualquier incidencia
 * activa; otro día, las obras y cortes que según la DGT seguirán ese día.
 */
export async function NearbyIncidents({
  station,
  date,
  today,
}: {
  station: Station;
  date: string;
  today: string;
}) {
  if (station.latitude == null || station.longitude == null || date < today) {
    return null;
  }
  const now = await loadIncidents();
  const near = now
    ? incidentsNear(
        now.incidents.filter((incident) => activeOn(incident, date, today)),
        { latitude: station.latitude, longitude: station.longitude },
      )
    : [];
  if (near.length === 0) {
    return null;
  }
  const when =
    date === today
      ? "Ahora mismo, según la DGT."
      : `Según la DGT, ${near.length === 1 ? "seguirá activa" : "seguirán activas"} ese día.`;
  return (
    <section
      aria-labelledby="nearby-incidents"
      className="flex flex-col gap-3 rounded-2xl border-2 border-incident bg-incident/15 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-incident" />
        <div>
          <h2 id="nearby-incidents" className="text-lg font-bold">
            {headline(near)}
          </h2>
          <p className="text-ink-soft">{when}</p>
        </div>
      </div>
      <IncidentList incidents={near} />
      <p className="text-sm text-ink-soft">
        La previsión no tiene en cuenta las incidencias: puede haber más tráfico del previsto.
        Fuente: {INCIDENTS_SOURCE}.
      </p>
    </section>
  );
}
