"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";

import type { Station } from "@/lib/api/schemas";
import { stationLabel } from "@/lib/stations";
import { cx } from "@/lib/ui";

/**
 * Barra con el tramo que estás viendo. Al pulsarla se despliega el selector (mapa y lista) con una
 * animación; el selector se monta la primera vez que se abre, para no cargar el mapa si no hace
 * falta.
 */
export function StationSwitcher({
  station,
  children,
}: {
  station: Station;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  return (
    <div className="glass mx-auto w-full max-w-3xl animate-rise overflow-hidden p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="selector-tramo"
        onClick={() => {
          setMounted(true);
          setOpen((o) => !o);
        }}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-2 text-left font-semibold transition-colors duration-200 hover:bg-glass"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-glass-strong text-accent">
          <MapPin aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-bold tracking-wider text-ink-soft uppercase">
            Tramo
          </span>
          <span className="block truncate">{stationLabel(station)}</span>
        </span>
        <span className="hidden text-sm text-accent sm:inline">
          {open ? "Cerrar" : "Cambiar en el mapa"}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cx("size-5 shrink-0 transition-transform duration-500", open && "rotate-180")}
        />
      </button>
      <div
        id="selector-tramo"
        className={cx(
          "grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-glass-line p-4">{mounted && children}</div>
        </div>
      </div>
    </div>
  );
}
