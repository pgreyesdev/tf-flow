"use client";

import { List, LoaderCircle, Map as MapIcon, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";

import type { Incident, Station } from "@/lib/api/schemas";
import { LEVEL_INFO } from "@/lib/levels";
import type { MapMarker } from "@/lib/map";
import { directionLabel } from "@/lib/map";
import { stationKey } from "@/lib/stations";
import { cx } from "@/lib/ui";

import { IslandMap } from "./island-map";
import { LEVEL_CHIP, LevelIcon } from "./level-badge";

type View = "map" | "list";

interface StationPickerProps {
  stations: Station[];
  markers: MapMarker[];
  incidents?: Incident[];
  selected?: Station;
  date: string;
  minDate: string;
  maxDate: string;
}

const field =
  "block min-h-12 w-full rounded-2xl border border-glass-line bg-glass px-3.5 text-base text-ink transition-colors duration-200 focus:bg-glass-strong";

/** Quita tildes y mayúsculas para buscar «guimar» y encontrar «Güímar». */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Selector del tramo. Lo principal es el mapa de la isla: pulsas un punto y eliges el sentido. La
 * lista con buscador es la segunda opción, para quien ya sabe el nombre o no ve bien el mapa.
 */
export function StationPicker({
  stations,
  markers,
  incidents,
  selected,
  date: initialDate,
  minDate,
  maxDate,
}: StationPickerProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("map");
  const [date, setDate] = useState(initialDate);
  const [search, setSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  // Un objeto estable: si cambiara en cada render, el mapa se volvería a crear.
  const query = useMemo(() => ({ fecha: date }), [date]);
  const levels = useMemo(() => new Map(markers.map((m) => [m.stationId, m.level])), [markers]);

  const filtered = useMemo(() => {
    const words = normalize(deferredSearch).split(/\s+/).filter(Boolean);
    return stations.filter((s) => {
      const text = normalize(`${s.name} ${s.direction_label} ${s.station_id}`);
      return words.every((w) => text.includes(w));
    });
  }, [stations, deferredSearch]);

  const changeDate = (value: string) => {
    setDate(value);
    if (selected && value >= minDate && value <= maxDate) {
      const params = new URLSearchParams({ estacion: stationKey(selected), fecha: value });
      startTransition(() => router.push(`/prediccion?${params.toString()}`, { scroll: false }));
    }
  };

  const tab = (value: View, label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      role="tab"
      id={`tab-${value}`}
      aria-selected={view === value}
      aria-controls={`panel-${value}`}
      onClick={() => setView(value)}
      className={cx(
        "relative z-10 inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full px-4 font-semibold transition-colors duration-300",
        view === value ? "text-night" : "text-ink-soft hover:text-ink",
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div
          role="tablist"
          aria-label="Cómo quieres elegir el tramo"
          className="relative flex rounded-full border border-glass-line bg-glass p-1 sm:w-80"
        >
          <span
            aria-hidden="true"
            className={cx(
              "absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
              view === "list" && "translate-x-full",
            )}
          />
          {tab("map", "Mapa", MapIcon)}
          {tab("list", "Lista", List)}
        </div>
        <div className="sm:ml-auto sm:w-56">
          <label htmlFor="fecha" className="flex items-center gap-2 text-sm font-semibold">
            Día
            {pending && (
              <LoaderCircle
                aria-label="Cargando"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
            )}
          </label>
          <input
            id="fecha"
            name="fecha"
            type="date"
            value={date}
            min={minDate}
            max={maxDate}
            required
            onChange={(event) => changeDate(event.target.value)}
            className={cx(field, "mt-1.5")}
          />
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-map"
        aria-labelledby="tab-map"
        hidden={view !== "map"}
        className="animate-fade-in"
      >
        {markers.length > 0 ? (
          <div className="glass overflow-hidden p-0">
            <div className="h-[26rem] sm:h-[34rem]">
              <IslandMap
                points={markers}
                incidents={incidents}
                selectedId={selected?.station_id}
                query={query}
                label={`Mapa de Tenerife con ${markers.length} puntos de medida para elegir`}
              />
            </div>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-glass-line px-4 py-3 text-sm text-ink-soft">
              <span>Pulsa un punto y elige el sentido en el que vas.</span>
              <button
                type="button"
                onClick={() => setView("list")}
                className="font-semibold text-accent underline-offset-4 hover:underline"
              >
                ¿No lo encuentras? Búscalo en la lista
              </button>
            </p>
          </div>
        ) : (
          <p className="glass p-6 text-ink-soft">
            Ahora mismo no podemos situar las estaciones en el mapa.{" "}
            <button
              type="button"
              onClick={() => setView("list")}
              className="font-semibold text-accent hover:underline"
            >
              Elige tu tramo en la lista
            </button>
            .
          </p>
        )}
      </div>

      <div
        role="tabpanel"
        id="panel-list"
        aria-labelledby="tab-list"
        hidden={view !== "list"}
        className="glass animate-fade-in p-4"
      >
        <label htmlFor="buscar" className="sr-only">
          Buscar punto de medida
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-soft"
          />
          <input
            id="buscar"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Busca por carretera o lugar: TF-5, La Laguna…"
            autoComplete="off"
            className={cx(field, "pl-11")}
          />
        </div>
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {filtered.length === stations.length
            ? `${stations.length} tramos`
            : `${filtered.length} de ${stations.length} tramos`}
        </p>
        <ul className="mt-2 max-h-[26rem] space-y-1 overflow-y-auto pr-1">
          {filtered.map((station) => {
            const key = stationKey(station);
            const level = levels.get(station.station_id);
            const current = selected && stationKey(selected) === key;
            return (
              <li key={key}>
                <Link
                  href={{ pathname: "/prediccion", query: { estacion: key, fecha: date } }}
                  scroll={false}
                  aria-current={current ? "true" : undefined}
                  className={cx(
                    "flex min-h-12 items-center justify-between gap-3 rounded-2xl px-3 py-2 transition-all duration-200 hover:translate-x-1 hover:bg-glass-strong",
                    current && "bg-glass-strong ring-1 ring-glass-line",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {station.name.trim() || `Estación ${station.station_id}`}
                    </span>
                    <span className="block text-sm text-ink-soft">{directionLabel(station)}</span>
                  </span>
                  {level && (
                    <span
                      className={cx(
                        "inline-flex shrink-0 items-center rounded-full p-1",
                        LEVEL_CHIP[level],
                      )}
                    >
                      <LevelIcon level={level} />
                      <span className="sr-only">{LEVEL_INFO[level].label} ahora</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        {filtered.length === 0 && (
          <p className="py-6 text-center text-ink-soft">
            Ningún tramo coincide con «{search}». Prueba con el número de la carretera.
          </p>
        )}
      </div>
    </div>
  );
}
