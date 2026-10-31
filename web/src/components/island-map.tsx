"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type {
  GeoJSONSourceSpecification,
  Map as MapLibreMap,
  RasterDEMSourceSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { Incident, Level } from "@/lib/api/schemas";
import { formatPercent } from "@/lib/format";
import { incidentPlace, incidentSince, incidentTitle } from "@/lib/incidents";
import { LEVEL_INFO } from "@/lib/levels";
import type { MapPoint } from "@/lib/map";

/** Los mismos colores que el resto de la web (globals.css). WebGL no lee variables CSS. */
const LEVEL_COLORS: Record<Level, string> = {
  low: "#4ade80",
  medium: "#fbbf24",
  high: "#fb7185",
};

/** Relieve de Tenerife en teselas Terrarium, servidas desde la propia web (public/terrain). */
const TERRAIN: RasterDEMSourceSpecification = {
  type: "raster-dem",
  tiles: ["/terrain/{z}/{x}/{y}.png"],
  encoding: "terrarium",
  tileSize: 256,
  minzoom: 6,
  maxzoom: 11,
  bounds: [-16.98, 27.96, -16.08, 28.64],
  attribution: "Relieve: Terrain Tiles (Mapzen, AWS Open Data)",
};

/** Las incidencias van en blanco con borde naranja: no se confunden con ningún nivel. */
export const INCIDENT_COLOR = "#fb923c";

const NO_INCIDENTS: Incident[] = [];

const SEA = "#0a1a30";

const STYLE: StyleSpecification = {
  version: 8,
  sources: { relief: TERRAIN, terrain: TERRAIN },
  layers: [
    { id: "sea", type: "background", paint: { "background-color": SEA } },
    {
      id: "relief",
      type: "color-relief",
      source: "relief",
      paint: {
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          // Las teselas más detalladas dan 0 en todo el mar: el mar es de un solo color.
          0,
          SEA,
          1,
          "#173a33",
          400,
          "#24503d",
          1200,
          "#3f5f3c",
          2000,
          "#6b5d45",
          2800,
          "#8f8174",
          3500,
          "#d9d4cf",
          3715,
          "#ffffff",
        ],
      },
    },
    {
      id: "hillshade",
      type: "hillshade",
      source: "relief",
      paint: {
        "hillshade-shadow-color": "#020617",
        "hillshade-highlight-color": "rgba(255,255,255,0.25)",
        "hillshade-exaggeration": 0.6,
      },
    },
  ],
  terrain: { source: "terrain", exaggeration: 1.4 },
};

/** La isla entera en cualquier pantalla, inclinada para que se vea el relieve. */
const VIEW = {
  bounds: [-16.93, 27.99, -16.11, 28.6] as [number, number, number, number],
  fitBoundsOptions: { padding: 16 },
  pitch: 55,
  bearing: -15,
};

function asGeoJson(points: MapPoint[]): GeoJSONSourceSpecification["data"] {
  return {
    type: "FeatureCollection",
    features: points.map((p) => ({
      type: "Feature" as const,
      id: p.stationId,
      geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
      properties: { stationId: p.stationId, color: LEVEL_COLORS[p.level] },
    })),
  };
}

function incidentsGeoJson(incidents: Incident[]): GeoJSONSourceSpecification["data"] {
  return {
    type: "FeatureCollection",
    features: incidents.map((incident) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [incident.longitude, incident.latitude],
      },
      properties: { id: incident.id },
    })),
  };
}

function paragraph(text: string, className?: string): HTMLParagraphElement {
  const p = document.createElement("p");
  if (className) {
    p.className = className;
  }
  p.textContent = text;
  return p;
}

function incidentPopup(incident: Incident): HTMLElement {
  const box = document.createElement("div");
  box.className = "space-y-1 text-night";
  box.append(paragraph(incidentTitle(incident), "font-bold"), paragraph(incidentPlace(incident)));
  const since = incidentSince(incident);
  if (since) {
    box.append(paragraph(since));
  }
  box.append(paragraph("Fuente: DGT", "text-xs opacity-70"));
  return box;
}

/** Contenido del globo al pulsar una estación. Se construye con nodos: nada de HTML a mano. */
function popupContent(point: MapPoint): HTMLElement {
  const box = document.createElement("div");
  box.className = "space-y-1 text-night";
  const name = document.createElement("p");
  name.className = "font-bold";
  name.textContent = point.name;
  const level = document.createElement("p");
  level.textContent = `${LEVEL_INFO[point.level].label} · ${formatPercent(point.probabilityHigh)} de riesgo de atasco`;
  const link = document.createElement("a");
  link.href = `/prediccion?${new URLSearchParams({ estacion: point.key }).toString()}`;
  link.className = "font-semibold text-accent-ink underline";
  link.textContent = "Ver la previsión del día";
  box.append(name, level, link);
  return box;
}

export function IslandMap({
  points,
  incidents = NO_INCIDENTS,
  label,
}: {
  points: MapPoint[];
  incidents?: Incident[];
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }
    let map: MapLibreMap | undefined;
    let cancelled = false;
    const byId = new Map(points.map((p) => [p.stationId, p]));
    const incidentsById = new Map(incidents.map((i) => [i.id, i]));

    void import("maplibre-gl")
      .then((maplibre) => {
        if (cancelled) {
          return;
        }
        maplibre.setWorkerUrl(
          new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href,
        );
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        map = new maplibre.Map({
          container: element,
          style: STYLE,
          ...VIEW,
          minZoom: 7,
          attributionControl: { compact: true },
          maxZoom: 13,
          maxPitch: 75,
          maxBounds: [
            [-17.3, 27.8],
            [-15.8, 28.8],
          ],
          cooperativeGestures: true,
          fadeDuration: reduceMotion ? 0 : 300,
          locale: {
            "NavigationControl.ZoomIn": "Acercar",
            "NavigationControl.ZoomOut": "Alejar",
            "NavigationControl.ResetBearing": "Orientar al norte",
            "CooperativeGesturesHandler.WindowsHelpText": "Usa Ctrl + rueda para hacer zoom",
            "CooperativeGesturesHandler.MacHelpText": "Usa ⌘ + rueda para hacer zoom",
            "CooperativeGesturesHandler.MobileHelpText": "Usa dos dedos para mover el mapa",
          },
        });
        map.addControl(
          new maplibre.NavigationControl({ visualizePitch: true, showCompass: true }),
          "top-right",
        );

        const popup = new maplibre.Popup({ closeButton: true, maxWidth: "260px", offset: 10 });
        map.on("load", () => {
          if (!map) {
            return;
          }
          map.addSource("stations", { type: "geojson", data: asGeoJson(points) });
          map.addLayer({
            id: "stations",
            type: "circle",
            source: "stations",
            paint: {
              "circle-color": ["get", "color"],
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 11, 7, 13, 10],
              "circle-stroke-color": "#050b18",
              "circle-stroke-width": 1.5,
              "circle-pitch-alignment": "viewport",
            },
          });
          map.addSource("incidents", { type: "geojson", data: incidentsGeoJson(incidents) });
          map.addLayer({
            id: "incidents",
            type: "circle",
            source: "incidents",
            paint: {
              "circle-color": "#ffffff",
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 11, 7, 13, 10],
              "circle-stroke-color": INCIDENT_COLOR,
              "circle-stroke-width": 3,
              "circle-pitch-alignment": "viewport",
            },
          });
          map.on("click", "incidents", (event) => {
            const feature = event.features?.[0];
            const incident = feature && incidentsById.get(String(feature.properties.id));
            if (!map || !incident) {
              return;
            }
            popup
              .setLngLat([incident.longitude, incident.latitude])
              .setDOMContent(incidentPopup(incident))
              .addTo(map);
          });
          map.on("click", "stations", (event) => {
            const feature = event.features?.[0];
            const point = feature && byId.get(Number(feature.properties.stationId));
            if (!map || !point) {
              return;
            }
            popup
              .setLngLat([point.longitude, point.latitude])
              .setDOMContent(popupContent(point))
              .addTo(map);
          });
          for (const layer of ["stations", "incidents"]) {
            map.on("mouseenter", layer, () => {
              map?.getCanvas().style.setProperty("cursor", "pointer");
            });
            map.on("mouseleave", layer, () => {
              map?.getCanvas().style.removeProperty("cursor");
            });
          }
        });
        map.on("error", (event) => {
          // Una tesela del mar que no existe no es un fallo: el resto del mapa sigue bien.
          if (!("sourceId" in event)) {
            console.error(event.error);
          }
        });
      })
      .catch(() => setFailed(true));

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, incidents]);

  if (failed) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-ink-soft">
        Tu navegador no puede mostrar el mapa en 3D. Tienes las estaciones en la lista de abajo.
      </div>
    );
  }
  return <div ref={container} role="region" aria-label={label} className="size-full" />;
}
