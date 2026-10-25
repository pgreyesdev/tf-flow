import { render, screen } from "@testing-library/react";

import { AppPromo } from "@/components/app-promo";
import { ForecastForm } from "@/components/forecast-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { dayForecast, STATIONS } from "@/test/fixtures";

vi.mock("next/form", () => ({
  default: ({ action, ...props }: React.ComponentProps<"form"> & { action: string }) => (
    <form action={action} {...props} />
  ),
}));

describe("site chrome", () => {
  it("links every section", () => {
    render(<SiteHeader />);
    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(nav).toHaveTextContent("PrevisiónAsistenteCómo funcionaApp");
    expect(screen.getByRole("link", { name: "TF-FLOW, inicio" })).toHaveAttribute("href", "/");
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
    expect(phone).toHaveTextContent("Los Cristianos · sentido creciente");
    expect(phone).toHaveTextContent("06:00");
    expect(phone).toHaveTextContent("10:00");
    expect(phone).toHaveTextContent("Sal antes de las 06:00");
  });
});

describe("ForecastForm", () => {
  it("submits station and date by GET", () => {
    render(
      <ForecastForm
        stations={STATIONS}
        selected="57:-1"
        date="2026-10-27"
        minDate="2026-10-20"
        maxDate="2026-11-10"
      />,
    );
    const select = screen.getByLabelText("Punto de medida");
    expect(select).toHaveValue("57:-1");
    expect(screen.getAllByRole("option")).toHaveLength(3);
    const date = screen.getByLabelText("Día");
    expect(date).toHaveAttribute("min", "2026-10-20");
    expect(date).toHaveAttribute("max", "2026-11-10");
    expect(select.closest("form")).toHaveAttribute("action", "/prediccion");
  });
});
