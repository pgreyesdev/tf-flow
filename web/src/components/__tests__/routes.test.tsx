import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { RouteForm } from "@/components/route-form";
import { RouteResults } from "@/components/route-results";
import { ROUTE_PLAN } from "@/test/fixtures";

type Handler = (event?: unknown) => void;

const maplibre = vi.hoisted(() => {
  const handlers = new Map<string, Handler>();
  const popup = { content: undefined as HTMLElement | undefined };
  const canvas = document.createElement("canvas");
  const paint = new Map<string, unknown>();
  const moved: string[] = [];
  const markers = { data: undefined as unknown };
  class FakeMap {
    static options: Record<string, unknown> = {};
    static removed = 0;
    constructor(options: Record<string, unknown>) {
      FakeMap.options = options;
    }
    addControl() {}
    addSource() {}
    addLayer() {}
    getCanvas() {
      return canvas;
    }
    getSource() {
      return { setData: (data: unknown) => (markers.data = data) };
    }
    setPaintProperty(layer: string, _: string, value: unknown) {
      paint.set(layer, value);
    }
    moveLayer(layer: string) {
      moved.push(layer);
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
    paint,
    moved,
    markers,
    FakeMap,
    module: { setWorkerUrl: vi.fn(), Map: FakeMap, NavigationControl: class {}, Popup: FakePopup },
  };
});

vi.mock("maplibre-gl", () => maplibre.module);
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  maplibre.handlers.clear();
  maplibre.paint.clear();
  maplibre.moved.length = 0;
  maplibre.popup.content = undefined;
});

describe("RouteResults", () => {
  it("draws the routes on a street map and highlights the chosen one", async () => {
    const { unmount } = render(<RouteResults plan={ROUTE_PLAN} />);
    expect(
      screen.getByRole("region", { name: /Mapa con 2 rutas de Santa Cruz de Tenerife/ }),
    ).toBeInTheDocument();
    await waitFor(() => expect(maplibre.handlers.has("load")).toBe(true));
    expect(maplibre.FakeMap.options.style).toBe("https://tiles.openfreemap.org/styles/liberty");
    expect(maplibre.FakeMap.options.bounds).toEqual([-16.3159, 28.4483, -16.2518, 28.5]);

    maplibre.handlers.get("load")!();
    await waitFor(() => expect(maplibre.paint.get("route-0")).toBe("#1a73e8"));
    expect(maplibre.paint.get("route-1")).toBe("#9aa8b8");
    expect(maplibre.moved).toEqual(["route-0-casing", "route-0"]);

    // Lo recomendado y lo que se sabe de la ruta elegida.
    const [first, second] = screen
      .getAllByRole("button", { pressed: undefined })
      .filter((b) => b.hasAttribute("aria-pressed"));
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(first).toHaveTextContent("Por TF-5Recomendada");
    expect(first).toHaveTextContent("15 min sin tráfico · 12,3 km");
    expect(first).toHaveTextContent("Es la más rápida");
    expect(screen.getByText("Accidente")).toBeInTheDocument();
    const stations = screen.getByRole("list", { name: "Aforos de la ruta" });
    expect(within(stations).getAllByRole("listitem")[0]).toHaveTextContent("08:04 Autopista Norte");

    // Pulsar la otra ruta en el mapa la elige.
    maplibre.handlers.get("mouseenter:route-1")!();
    expect(maplibre.canvas.style.cursor).toBe("pointer");
    maplibre.handlers.get("mouseleave:route-1")!();
    maplibre.handlers.get("click:route-1")!();
    await waitFor(() => expect(second).toHaveAttribute("aria-pressed", "true"));
    expect(maplibre.paint.get("route-1")).toBe("#1a73e8");
    expect(second).toHaveTextContent(/no sabemos cómo estará el tráfico/);
    expect(screen.queryByRole("list", { name: "Aforos de la ruta" })).not.toBeInTheDocument();
    fireEvent.click(first!);
    await waitFor(() => expect(maplibre.paint.get("route-0")).toBe("#1a73e8"));

    // Globos de los puntos de la ruta.
    maplibre.handlers.get("click:markers")!({ features: [] });
    expect(maplibre.popup.content).toBeUndefined();
    maplibre.handlers.get("click:markers")!({
      lngLat: { lng: -16.27, lat: 28.45 },
      features: [{ properties: { title: "Autopista Norte", detail: "Al pasar: atasco" } }],
    });
    expect(maplibre.popup.content).toHaveTextContent("Autopista NorteAl pasar: atasco");
    maplibre.handlers.get("click:markers")!({
      lngLat: { lng: -16.25, lat: 28.46 },
      features: [{ properties: { title: "Salida: Santa Cruz", detail: "" } }],
    });
    expect(maplibre.popup.content!.children).toHaveLength(1);

    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    maplibre.handlers.get("error")!({ sourceId: "openmaptiles", error: new Error("tesela") });
    maplibre.handlers.get("error")!({ error: new Error("WebGL") });
    expect(error).toHaveBeenCalledOnce();

    unmount();
    expect(maplibre.FakeMap.removed).toBeGreaterThan(0);
  });

  it("warns about closures and explains when the map cannot be drawn", async () => {
    const original = maplibre.module.Map;
    maplibre.module.Map = class {
      constructor() {
        throw new Error("Sin WebGL");
      }
    } as unknown as typeof maplibre.FakeMap;
    const [direct, detour] = ROUTE_PLAN.routes;
    render(
      <RouteResults
        plan={{
          ...ROUTE_PLAN,
          routes: [detour!, { ...direct!, closed: true, recommended: false }],
        }}
      />,
    );
    expect(await screen.findByText(/no puede mostrar el mapa/)).toBeInTheDocument();
    expect(screen.getByText("La DGT informa de un corte en esta ruta.")).toBeInTheDocument();
    maplibre.module.Map = original;
  });
});

describe("RouteForm", () => {
  const places = [ROUTE_PLAN.origin, ROUTE_PLAN.destination];

  it("asks for the routes with the chosen places and hour", () => {
    render(
      <RouteForm
        places={places}
        origin="santa-cruz-de-tenerife"
        destination="san-cristobal-de-la-laguna"
        date="2026-10-27"
        minDate="2026-10-27"
        maxDate="2026-11-10"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Intercambiar origen y destino" }));
    expect(screen.getByLabelText("Desde")).toHaveValue("san-cristobal-de-la-laguna");
    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "17" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver rutas" }));
    expect(push).toHaveBeenCalledWith(
      "/rutas?origen=san-cristobal-de-la-laguna&destino=santa-cruz-de-tenerife&fecha=2026-10-27&hora=17",
    );
  });

  it("leaves the hour out when leaving now", () => {
    push.mockClear();
    render(
      <RouteForm
        places={places}
        origin="santa-cruz-de-tenerife"
        destination="san-cristobal-de-la-laguna"
        date="2026-10-27"
        hour={8}
        minDate="2026-10-27"
        maxDate="2026-11-10"
      />,
    );
    expect(screen.getByLabelText("Salida")).toHaveValue("8");
    fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver rutas" }));
    expect(push).toHaveBeenCalledWith(
      "/rutas?origen=santa-cruz-de-tenerife&destino=san-cristobal-de-la-laguna&fecha=2026-10-27",
    );
  });
});
