import { fireEvent, render, screen } from "@testing-library/react";

import { AppPromo } from "@/components/app-promo";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { StationPicker } from "@/components/station-picker";
import { StationSwitcher } from "@/components/station-switcher";
import { dayForecast, STATIONS } from "@/test/fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/rutas" }));
vi.mock("@/components/island-map", () => ({ IslandMap: () => null }));

beforeEach(() => push.mockReset());

describe("site chrome", () => {
  it("links every section", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toHaveTextContent("PrevisiónRutasAsistenteCómo funcionaApp");
    expect(screen.getByRole("link", { name: "TF-FLOW, inicio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Rutas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Previsión" })).not.toHaveAttribute("aria-current");
  });

  it("credits the open data", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("link", { name: /datos abiertos del Cabildo/ })).toHaveAttribute(
      "href",
      "https://datos.tenerife.es/",
    );
  });
});

describe("AppPromo", () => {
  it("says the app is coming while there is no store page", () => {
    render(<AppPromo />);
    expect(screen.getByText("Próximamente en Google Play")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links to the store and previews a real forecast", () => {
    const { container } = render(
      <AppPromo
        playStoreUrl="https://play.google.com/store/apps/details?id=x"
        forecast={dayForecast()}
      />,
    );
    expect(screen.getByRole("link", { name: "Descargar en Google Play" })).toHaveAttribute(
      "href",
      "https://play.google.com/store/apps/details?id=x",
    );
    const phone = container.querySelector("[aria-hidden='true'].select-none")!;
    expect(phone).toHaveTextContent("Los Cristianos");
    expect(phone).toHaveTextContent("88 %Atasco a las 08:00");
    expect(phone).toHaveTextContent("Sal antes de las 08:00 para evitar el tráfico.");
  });
});

describe("StationPicker", () => {
  const props = {
    stations: STATIONS,
    markers: [],
    date: "2026-10-27",
    minDate: "2026-10-20",
    maxDate: "2026-11-10",
  };

  it("offers the map first and the list as a second option", async () => {
    render(<StationPicker {...props} />);
    expect(screen.getByRole("tab", { name: "Mapa" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("panel-list")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Elige tu tramo en la lista" }));
    expect(screen.getByRole("tab", { name: "Lista" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Anaga/ })).toHaveAttribute(
      "href",
      "/prediccion?estacion=12%3A0&fecha=2026-10-27",
    );
    expect(screen.getByLabelText("Día")).toHaveAttribute("min", "2026-10-20");
  });

  it("finds a station ignoring accents and case", () => {
    render(<StationPicker {...props} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lista" }));
    fireEvent.change(screen.getByLabelText("Buscar punto de medida"), {
      target: { value: "cristianos DECRE" },
    });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("1 de 3 tramos");
    fireEvent.change(screen.getByLabelText("Buscar punto de medida"), {
      target: { value: "nada" },
    });
    expect(screen.getByText(/Ningún tramo coincide/)).toBeInTheDocument();
  });

  it("reloads the selected station when the day changes", () => {
    render(<StationPicker {...props} selected={STATIONS[2]} />);
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2026-10-29" } });
    expect(push).toHaveBeenCalledWith("/prediccion?estacion=12%3A0&fecha=2026-10-29", {
      scroll: false,
    });
    fireEvent.change(screen.getByLabelText("Día"), { target: { value: "2027-01-01" } });
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("StationSwitcher", () => {
  it("opens the picker only when asked", () => {
    render(
      <StationSwitcher station={STATIONS[0]!}>
        <p>Selector</p>
      </StationSwitcher>,
    );
    const button = screen.getByRole("button", { name: /Los Cristianos · sentido creciente/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Selector")).not.toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Selector")).toBeInTheDocument();
  });
});
