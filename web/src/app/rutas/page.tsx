import { PageTransition } from "@/components/page-transition";
import type { Metadata } from "next";

import { Notice } from "@/components/notice";
import { RouteForm } from "@/components/route-form";
import { RouteResults } from "@/components/route-results";
import { ApiError, getPlaces, getRoutes } from "@/lib/api/client";
import type { Place, RoutePlan } from "@/lib/api/schemas";
import { addDays, isIsoDate, todayInTenerife } from "@/lib/format";

export const metadata: Metadata = {
  title: "Rutas",
  description:
    "Compara rutas entre dos lugares de Tenerife con el tráfico previsto en sus aforos y las incidencias de la DGT.",
};

const FUTURE_DAYS = 14;

const ERROR_MESSAGES: Record<ApiError["kind"], string> = {
  not_found: "No conocemos alguno de esos lugares.",
  out_of_range: "Elige dos lugares distintos y un día entre hoy y dentro de dos semanas.",
  rate_limited: "Hay muchas consultas a la vez. Espera un momento y vuelve a intentarlo.",
  unavailable: "El servicio de rutas no está disponible ahora mismo. Inténtalo en unos minutos.",
  forbidden: "El servicio de rutas ha rechazado la consulta.",
  invalid_response: "El servicio de rutas ha devuelto una respuesta que no entendemos.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseHour(value: string | undefined): number | undefined {
  const hour = Number(value);
  return value && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined;
}

async function loadPlan(
  origin: string,
  destination: string,
  date: string,
  hour: number | undefined,
): Promise<RoutePlan | { error: string }> {
  try {
    return await getRoutes({ origin, destination, date, hour });
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: ERROR_MESSAGES[error.kind] };
    }
    throw error;
  }
}

export default async function RoutesPage({ searchParams }: PageProps<"/rutas">) {
  const params = await searchParams;
  const today = todayInTenerife();
  const requestedDate = first(params.fecha);
  const date = requestedDate && isIsoDate(requestedDate) ? requestedDate : today;
  const hour = parseHour(first(params.hora));
  const origin = first(params.origen);
  const destination = first(params.destino);

  let places: Place[];
  try {
    places = await getPlaces();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    return (
      <PageShell>
        <Notice tone="error" title="No podemos cargar los lugares">
          {ERROR_MESSAGES[error.kind]}
        </Notice>
      </PageShell>
    );
  }

  const result =
    origin && destination ? await loadPlan(origin, destination, date, hour) : undefined;

  return (
    <PageShell>
      <div className="glass p-4 sm:p-6">
        <RouteForm
          places={places}
          origin={origin}
          destination={destination}
          date={date}
          hour={hour}
          minDate={today}
          maxDate={addDays(today, FUTURE_DAYS)}
        />
      </div>

      {result && "error" in result && (
        <Notice tone="error" title="No hay rutas para esta consulta">
          {result.error}
        </Notice>
      )}

      {result && "routes" in result && (
        <>
          <h2 className="font-display text-2xl font-extrabold sm:text-3xl">
            De {result.origin.name} a {result.destination.name}
          </h2>
          <p className="-mt-2 text-ink-soft">
            Saliendo el {result.departure.slice(8, 10)}/{result.departure.slice(5, 7)} a las{" "}
            {result.departure.slice(11, 16)}.
          </p>
          <RouteResults plan={result} />
        </>
      )}

      <p className="text-sm text-ink-soft">
        Rutas y tiempos sin tráfico de OpenStreetMap (OSRM); mapa de OpenFreeMap. Para recomendar
        una, a cada ruta se le suma una penalización orientativa: 8 minutos por aforo con atasco
        previsto a tu paso, 3 por tráfico denso, 5 por incidencia y 60 si la DGT informa de un
        corte. Solo sabemos el tráfico donde hay estación de aforo.
      </p>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-2 sm:px-6">
        <h1 className="pt-4 font-display text-3xl font-extrabold sm:text-4xl">Rutas</h1>
        <p className="-mt-2 text-ink-soft">
          Compara cómo ir de un sitio a otro con el tráfico previsto y las incidencias de ahora.
        </p>
        {children}
      </div>
    </PageTransition>
  );
}
