import { Search } from "lucide-react";
import Form from "next/form";

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
  "mt-1.5 block min-h-12 w-full rounded-xl border border-border-strong bg-surface px-3.5 text-base text-foreground";

/** Formulario de búsqueda. Envía por GET, así que funciona también sin JavaScript. */
export function ForecastForm({ stations, selected, date, minDate, maxDate }: ForecastFormProps) {
  return (
    <Form
      action="/prediccion"
      className="grid gap-4 rounded-2xl border border-border bg-surface p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-end sm:p-6"
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
      <button type="submit" className={`${buttonStyles.primary} min-h-12`}>
        <Search aria-hidden="true" className="size-5" />
        Ver previsión
      </button>
    </Form>
  );
}
