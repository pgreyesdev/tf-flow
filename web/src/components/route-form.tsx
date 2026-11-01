"use client";

import { ArrowUpDown, LoaderCircle, Route } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";

import type { Place } from "@/lib/api/schemas";
import { buttonStyles } from "@/lib/ui";

interface RouteFormProps {
  places: Place[];
  origin?: string;
  destination?: string;
  date: string;
  hour?: number;
  minDate: string;
  maxDate: string;
}

const field =
  "mt-1.5 block min-h-12 w-full rounded-2xl border border-glass-line bg-glass px-3.5 text-base text-ink";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Origen, destino y hora de salida. Envía por GET: funciona sin JavaScript y cada ruta tiene URL. */
export function RouteForm({
  places,
  origin,
  destination,
  date,
  hour,
  minDate,
  maxDate,
}: RouteFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const from = useRef<HTMLSelectElement>(null);
  const to = useRef<HTMLSelectElement>(null);

  return (
    <form
      action="/rutas"
      aria-busy={pending}
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) {
          return;
        }
        const data = new FormData(event.currentTarget);
        const query = new URLSearchParams();
        for (const name of ["origen", "destino", "fecha", "hora"]) {
          const value = String(data.get(name) ?? "");
          if (value) {
            query.set(name, value);
          }
        }
        startTransition(() => router.push(`/rutas?${query.toString()}`));
      }}
    >
      <div className="relative grid gap-4 sm:col-span-2 sm:grid-cols-2">
        <div>
          <label htmlFor="origen" className="font-semibold">
            Desde
          </label>
          <select
            ref={from}
            id="origen"
            name="origen"
            defaultValue={origin ?? ""}
            required
            className={field}
          >
            <option value="" disabled>
              Elige el origen
            </option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="destino" className="font-semibold">
            Hasta
          </label>
          <select
            ref={to}
            id="destino"
            name="destino"
            defaultValue={destination ?? ""}
            required
            className={field}
          >
            <option value="" disabled>
              Elige el destino
            </option>
            {places.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="Intercambiar origen y destino"
          className="absolute top-0 right-0 rounded-full p-1.5 text-accent hover:bg-glass-strong"
          onClick={() => {
            if (from.current && to.current) {
              [from.current.value, to.current.value] = [to.current.value, from.current.value];
            }
          }}
        >
          <ArrowUpDown aria-hidden="true" className="size-5" />
        </button>
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
      <div>
        <label htmlFor="hora" className="font-semibold">
          Salida
        </label>
        <select id="hora" name="hora" defaultValue={hour ?? ""} className={field}>
          <option value="">Ahora (o a las 8 otro día)</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        aria-disabled={pending}
        className={`${buttonStyles.primary} min-h-12 w-full aria-disabled:cursor-wait sm:col-span-2`}
      >
        {pending ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-5 animate-spin motion-reduce:animate-none"
          />
        ) : (
          <Route aria-hidden="true" className="size-5" />
        )}
        {pending ? "Buscando rutas…" : "Ver rutas"}
      </button>
      <p role="status" className="sr-only">
        {pending ? "Buscando rutas" : ""}
      </p>
    </form>
  );
}
