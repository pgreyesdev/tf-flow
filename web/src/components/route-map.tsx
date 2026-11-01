"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { GeoJSONSourceSpecification, Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { RoutePlan } from "@/lib/api/schemas";
import { formatPercent, hourLabel } from "@/lib/format";
import { incidentPlace, incidentTitle } from "@/lib/incidents";
import { LEVEL_INFO } from "@/lib/levels";
import { planBounds } from "@/lib/routes";

import { INCIDENT_COLOR, LEVEL_COLORS } from "./island-map";

/** Mapa de calles abierto, con datos de OpenStreetMap y sin clave: OpenFreeMap. */
export const STREET_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const SELECTED = "#1a73e8";
const ALTERNATIVE = "#9aa8b8";
const CASING = "#ffffff";

interface Feature {
  type: "Feature";
  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | {
        type: "LineString";
        coordinates: [number, number][];
      };
  properties: Record<string, string | number>;
}

function collection(features: Feature[]): GeoJSONSourceSpecification["data"] {
  return { type: "FeatureCollection", features } as GeoJSONSourceSpecification["data"];
}

function point(longitude: number, latitude: number, properties: Feature["properties"]): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties,
  };
}

/** Los puntos de la ruta elegida: aforos con su nivel, incidencias, salida y llegada. */
function markers(plan: RoutePlan, selected: number): GeoJSONSourceSpecification["data"] {
  const route = plan.routes[selected];
  const features: Feature[] = [
    point(plan.origin.longitude, plan.origin.latitude, {
      color: "#16a34a",
      title: `Salida: ${plan.origin.name}`,
      detail: "",
    }),
    point(plan.destination.longitude, plan.destination.latitude, {
      color: "#dc2626",
      title: `Llegada: ${plan.destination.name}`,
      detail: "",
    }),
  ];
  for (const station of route?.stations ?? []) {
    features.push(
      point(station.longitude, station.latitude, {
        color: LEVEL_COLORS[station.level],
        title: station.name,
        detail: `Al pasar, hacia las ${hourLabel(station.passing)}: ${LEVEL_INFO[station.level].label.toLowerCase()} · ${formatPercent(station.probability_high)} de riesgo de atasco`,
      }),
    );
  }
  for (const incident of route?.incidents ?? []) {
    features.push(
      point(incident.longitude, incident.latitude, {
        color: INCIDENT_COLOR,
        title: `⚠ ${incidentTitle(incident)}`,
        detail: `${incidentPlace(incident)} · Fuente: DGT`,
      }),
    );
  }
  return collection(features);
}

function popupContent(title: string, detail: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "space-y-1 text-night";
  const heading = document.createElement("p");
  heading.className = "font-bold";
  heading.textContent = title;
  box.append(heading);
  if (detail) {
    const text = document.createElement("p");
    text.textContent = detail;
    box.append(text);
  }
  return box;
}

/**
 * Las rutas sobre un mapa de calles, al estilo de los navegadores: la elegida en azul encima y las
 * demás en gris. Pulsar una ruta la elige.
 */
export function RouteMap({
  plan,
  selected,
  onSelect,
}: {
  plan: RoutePlan;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const selectedRef = useRef(selected);
  const select = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }
    let cancelled = false;
    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled) {
          return;
        }
        maplibre.setWorkerUrl(
          new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
        );
        const [west, south, east, north] = planBounds(plan);
        const map = new maplibre.Map({
          container: element,
          style: STREET_STYLE,
          bounds: [west, south, east, north],
          fitBoundsOptions: { padding: 40 },
          attributionControl: { compact: true },
          cooperativeGestures: true,
          locale: {
            "NavigationControl.ZoomIn": "Acercar",
            "NavigationControl.ZoomOut": "Alejar",
            "NavigationControl.ResetBearing": "Orientar al norte",
            "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para hacer zoom",
            "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para hacer zoom",
            "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
          },
        });
        mapRef.current = map;
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        const popup = new maplibre.Popup({ closeButton: true, maxWidth: "260px", offset: 10 });

        map.on("load", () => {
          plan.routes.forEach((route, index) => {
            map.addSource(`route-${index}`, {
              type: "geojson",
              data: collection([
                {
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: route.geometry },
                  properties: { index },
                },
              ]),
            });
            map.addLayer({
              id: `route-${index}-casing`,
              type: "line",
              source: `route-${index}`,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": CASING, "line-width": 9 },
            });
            map.addLayer({
              id: `route-${index}`,
              type: "line",
              source: `route-${index}`,
              layout: { "line-cap": "round", "line-join": "round" },
              paint: { "line-color": ALTERNATIVE, "line-width": 6 },
            });
            map.on("click", `route-${index}`, () => select.current(index));
            map.on("mouseenter", `route-${index}`, () => {
              map.getCanvas().style.setProperty("cursor", "pointer");
            });
            map.on("mouseleave", `route-${index}`, () => {
              map.getCanvas().style.removeProperty("cursor");
            });
          });
          map.addSource("markers", { type: "geojson", data: markers(plan, selectedRef.current) });
          map.addLayer({
            id: "markers",
            type: "circle",
            source: "markers",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": 7,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
          map.on("click", "markers", (event) => {
            const properties = event.features?.[0]?.properties;
            if (!properties) {
              return;
            }
            popup
              .setLngLat(event.lngLat)
              .setDOMContent(popupContent(String(properties.title), String(properties.detail)))
              .addTo(map);
          });
          setReady(true);
        });
        map.on("error", (event) => {
          if (!("sourceId" in event)) {
            console.error(event.error);
          }
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = undefined;
      setReady(false);
    };
  }, [plan]);

  // Al elegir otra ruta se repinta sin rehacer el mapa: la elegida en azul y por encima.
  useEffect(() => {
    selectedRef.current = selected;
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    plan.routes.forEach((_, index) => {
      map.setPaintProperty(
        `route-${index}`,
        "line-color",
        index === selected ? SELECTED : ALTERNATIVE,
      );
    });
    map.moveLayer(`route-${selected}-casing`, "markers");
    map.moveLayer(`route-${selected}`, "markers");
    const source = map.getSource("markers");
    if (source && "setData" in source) {
      (source as { setData: (data: unknown) => void }).setData(markers(plan, selected));
    }
  }, [plan, selected, ready]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-ink-soft">
        Tu navegador no puede mostrar el mapa. Tienes las rutas en la lista.
      </div>
    );
  }
  return (
    <div
      ref={container}
      role="region"
      aria-label={`Mapa con ${plan.routes.length} rutas de ${plan.origin.name} a ${plan.destination.name}`}
      className="size-full"
    />
  );
}
