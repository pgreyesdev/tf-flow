"use client";

import { LoaderCircle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import type { Station } from "@/lib/api/schemas";
import { stationKey, stationLabel } from "@/lib/stations";
import { buttonStyles } from "@/lib/ui";

interface ForecastFormProps {
  stations: Station[];
  selected?: string;
  date: string;
  minDate: string;
  maxDate: string;
}

const field =
  "mt-1.5 block min-h-12 w-full rounded-2xl border border-glass-line bg-glass px-3.5 text-base text-ink";

/**
 * Formulario de búsqueda. Envía por GET, así que funciona también sin JavaScript; con él, navega
 * sin recargar y el botón avisa de que está cargando hasta que llega la nueva previsión.
 */
export function ForecastForm({ stations, selected, date, minDate, maxDate }: ForecastFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      action="/prediccion"
      aria-busy={pending}
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) {
          return;
        }
        const data = new FormData(event.currentTarget);
        const query = new URLSearchParams({
          estacion: String(data.get("estacion") ?? ""),
          fecha: String(data.get("fecha") ?? ""),
        });
        startTransition(() => router.push(`/prediccion?${query.toString()}`));
      }}
    >
      <div>
        <label htmlFor="estacion" className="font-semibold">
          Punto de medida
        </label>
        <select id="estacion" name="estacion" defaultValue={selected} required className={field}>
          {stations.map((station) => (
            <option key={stationKey(station)} value={stationKey(station)}>
              {stationLabel(station)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fecha" className="font-semibold">
          Día
        </label>
        <input
          id="fecha"
          name="fecha"
          type="date"
          defaultValue={date}
          min={minDate}
          max={maxDate}
          required
          className={field}
        />
      </div>
      <button
        type="submit"
        aria-disabled={pending}
        className={`${buttonStyles.primary} min-h-12 w-full aria-disabled:cursor-wait`}
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Search aria-hidden="true" className="size-5" />
        )}
        {pending ? "Cargando previsión…" : "Ver previsión"}
      </button>
      <p role="status" className="sr-only">
        {pending ? "Cargando la previsión" : ""}
      </p>
    </form>
  );
}
