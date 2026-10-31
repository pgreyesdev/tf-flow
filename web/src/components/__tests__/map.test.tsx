import { render, screen, waitFor, within } from "@testing-library/react";

import { IslandMap } from "@/components/island-map";
import { NearbyIncidents } from "@/components/incidents";
import { NetworkMap, NetworkMapSkeleton } from "@/components/network-map";
import { getIncidents, getNetworkNow } from "@/lib/api/client";
import type { NetworkNow } from "@/lib/api/schemas";
import type { MapPoint } from "@/lib/map";
import { hourly, INCIDENTS, STATIONS } from "@/test/fixtures";

type Handler = (event?: unknown) => void;

const maplibre = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const popup = { content: undefined as HTMLElement | undefined };
  const canvas = document.createElement("canvas");
  class FakeMap {
    static options: unknown;
    static removed = 0;
    static layers: unknown[] = [];
    constructor(options: unknown) {
      FakeMap.options = options;
    }
    addControl() {}
    addSource() {}
    addLayer(layer: unknown) {
      FakeMap.layers.push(layer);
    }
    getCanvas() {
      return canvas;
    }
    on(type: string, layerOrHandler: string | Handler, handler?: Handler) {
      handlers.set(
        handler ? `${type}:${String(layerOrHandler)}` : type,
        handler ?? (layerOrHandler as Handler),
      );
    }
    remove() {
      FakeMap.removed += 1;
    }
  }
  class FakePopup {
    setLngLat() {
      return this;
    }
    setDOMContent(content: HTMLElement) {
      popup.content = content;
      return this;
    }
    addTo() {
      return this;
    }
  }
  return {
    handlers,
    popup,
    canvas,
    FakeMap,
    module: {
      setWorkerUrl: vi.fn(),
      Map: FakeMap,
      NavigationControl: class {},
      Popup: FakePopup,
    },
  };
});

vi.mock("maplibre-gl", () => maplibre.module);
vi.mock("@/lib/api/client", () => ({ getNetworkNow: vi.fn(), getIncidents: vi.fn() }));

const POINTS: MapPoint[] = [
  {
    stationId: 57,
    name: "Los Cristianos",
    latitude: 28.05,
    longitude: -16.71,
    level: "high",
    probabilityHigh: 0.87,
    vehicles: 3007,
    key: "57:1",
  },
];

beforeEach(() => {
  maplibre.handlers.clear();
  maplibre.popup.content = undefined;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.mocked(getIncidents).mockResolvedValue(INCIDENTS);
});

describe("IslandMap", () => {
  it("draws the stations and opens their forecast from a popup", async () => {
    const { unmount } = render(
      <IslandMap points={POINTS} incidents={INCIDENTS.incidents} label="Mapa de Tenerife" />,
    );
    expect(screen.getByRole("region", { name: "Mapa de Tenerife" })).toBeInTheDocument();
    await waitFor(() => expect(maplibre.handlers.has("load")).toBe(true));
    expect(maplibre.module.setWorkerUrl).toHaveBeenCalledWith(
      expect.stringContaining("maplibre-gl-worker.mjs"),
    );

    maplibre.handlers.get("load")!();
    expect(maplibre.FakeMap.layers).toContainEqual(expect.objectContaining({ id: "stations" }));

    maplibre.handlers.get("mouseenter:stations")!();
    expect(maplibre.canvas.style.cursor).toBe("pointer");
    maplibre.handlers.get("mouseleave:stations")!();
    expect(maplibre.canvas.style.cursor).toBe("");

    maplibre.handlers.get("click:stations")!({ features: [] });
    expect(maplibre.popup.content).toBeUndefined();
    maplibre.handlers.get("click:stations")!({ features: [{ properties: { stationId: 57 } }] });
    const popup = maplibre.popup.content!;
    expect(popup).toHaveTextContent("Los CristianosAtasco · 87 % de riesgo de atasco");
    expect(within(popup).getByRole("link")).toHaveAttribute("href", "/prediccion?estacion=57%3A1");

    maplibre.handlers.get("mouseenter:incidents")!();
    expect(maplibre.canvas.style.cursor).toBe("pointer");
    maplibre.handlers.get("mouseleave:incidents")!();
    maplibre.handlers.get("click:incidents")!({ features: [] });
    maplibre.handlers.get("click:incidents")!({ features: [{ properties: { id: "17264754" } }] });
    expect(maplibre.popup.content).toHaveTextContent(
      "Obras · Vía cortadaTF-82, km 9,5 · El TanqueDesde el 22 junFuente: DGT",
    );
    maplibre.handlers.get("click:incidents")!({
      features: [{ properties: { id: "1" } }],
    });
    expect(maplibre.popup.content).toHaveTextContent("Accidente");

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    maplibre.handlers.get("error")!({ sourceId: "relief", error: new Error("tesela") });
    expect(error).not.toHaveBeenCalled();
    maplibre.handlers.get("error")!({ error: new Error("WebGL") });
    expect(error).toHaveBeenCalledOnce();

    unmount();
    expect(maplibre.FakeMap.removed).toBeGreaterThan(0);
  });

  it("explains when the browser cannot draw the map", async () => {
    const original = maplibre.module.Map;
    maplibre.module.Map = class {
      constructor() {
        throw new Error("Sin WebGL");
      }
    } as unknown as typeof maplibre.FakeMap;
    render(<IslandMap points={POINTS} label="Mapa" />);
    expect(await screen.findByText(/no puede mostrar el mapa/)).toBeInTheDocument();
    maplibre.module.Map = original;
  });
});

describe("NearbyIncidents", () => {
  const station = { ...STATIONS[0]!, latitude: 28.05, longitude: -16.71 };

  it("warns about incidents near the station", async () => {
    render((await NearbyIncidents({ station }))!);
    expect(
      screen.getByRole("heading", { name: "Hay una incidencia cerca de este punto ahora mismo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Accidente")).toBeInTheDocument();
    expect(screen.queryByText(/Obras/)).not.toBeInTheDocument();
  });

  it("counts several incidents", async () => {
    const near = INCIDENTS.incidents.map((i) => ({ ...i, latitude: 28.05, longitude: -16.71 }));
    vi.mocked(getIncidents).mockResolvedValue({ ...INCIDENTS, incidents: near });
    render((await NearbyIncidents({ station }))!);
    expect(screen.getByRole("heading", { name: /Hay 2 incidencias/ })).toBeInTheDocument();
  });

  it("stays quiet without coordinates, incidents or source", async () => {
    expect(await NearbyIncidents({ station: STATIONS[0]! })).toBeNull();
    expect(await NearbyIncidents({ station: { ...station, latitude: 28.5 } })).toBeNull();
    vi.mocked(getIncidents).mockRejectedValue(new Error("caída"));
    expect(await NearbyIncidents({ station })).toBeNull();
  });
});

describe("NetworkMap", () => {
  const station = { ...STATIONS[0]!, latitude: 28.05, longitude: -16.71 };
  const network: NetworkNow = {
    time: "2026-10-27T08:00:00",
    stations: [{ station, hour: hourly("2026-10-27", 8) }],
  };

  it("summarises the island at the current hour with lists for every station", async () => {
    vi.mocked(getNetworkNow).mockResolvedValue(network);
    render((await NetworkMap())!);
    expect(screen.getByRole("heading", { name: "La isla, ahora" })).toBeInTheDocument();
    expect(screen.getByText(/Previsión de las 08:00 en 1 puntos/)).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Leyenda" });
    expect(legend).toHaveTextContent("Fluido: 0Denso: 0Atasco: 1Incidencias: 2");
    expect(screen.getByRole("heading", { name: "Incidencias ahora" })).toBeInTheDocument();
    expect(screen.getByText("Obras · Vía cortada")).toBeInTheDocument();
  });

  it("says when there are no incidents and hides them when the DGT is down", async () => {
    vi.mocked(getNetworkNow).mockResolvedValue(network);
    vi.mocked(getIncidents).mockResolvedValue({ ...INCIDENTS, incidents: [] });
    const { unmount } = render((await NetworkMap())!);
    expect(screen.getByText(/Sin incidencias comunicadas/)).toBeInTheDocument();
    unmount();

    vi.mocked(getIncidents).mockResolvedValue({ ...INCIDENTS, available: false });
    render((await NetworkMap())!);
    expect(screen.queryByRole("heading", { name: "Incidencias ahora" })).not.toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Leyenda" })).not.toHaveTextContent("Incidencias");
    expect(screen.getAllByRole("link", { name: /Los Cristianos/ })[0]).toHaveAttribute(
      "href",
      "/prediccion?estacion=57%3A1",
    );
  });

  it("hides itself when the API has no map yet", async () => {
    vi.mocked(getNetworkNow).mockRejectedValue(new Error("404"));
    expect(await NetworkMap()).toBeNull();
    vi.mocked(getNetworkNow).mockResolvedValue({ ...network, stations: [] });
    expect(await NetworkMap()).toBeNull();
  });

  it("keeps the space while the map loads", () => {
    const { container } = render(<NetworkMapSkeleton />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
