import { act, render, screen, within } from "@testing-library/react";

import { CountUp } from "@/components/count-up";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Limits } from "@/components/landing/limits";
import { UseCases } from "@/components/landing/use-cases";
import { PageTransition } from "@/components/page-transition";
import { dayForecast, MODEL } from "@/test/fixtures";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

describe("Hero", () => {
  it("explains the site and leads to the map", () => {
    render(<Hero stationCount={60} today="2026-10-27" currentHour={8} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Anticípate al atasco antes de coger el coche",
    );
    expect(screen.getByRole("link", { name: /Elegir mi tramo en el mapa/ })).toHaveAttribute(
      "href",
      "/prediccion",
    );
    expect(screen.getByText("60 puntos de medida")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Relieve de Tenerife/ })).toBeInTheDocument();
  });

  it("shows the live forecast of the featured station", () => {
    render(
      <Hero
        stationCount={0}
        outlook={{ forecast: dayForecast("2026-10-27"), days: [] }}
        today="2026-10-27"
        currentHour={8}
      />,
    );
    expect(screen.getByText("Toda la isla")).toBeInTheDocument();
    const card = screen.getByRole("link", { name: /Ver el día completo/ });
    expect(card).toHaveAttribute("href", "/prediccion?estacion=57%3A1");
    expect(card).toHaveTextContent("Ahora mismo");
    expect(card).toHaveTextContent("Los Cristianos");
    expect(card).toHaveTextContent("Mejor hora para salir hoy");
  });

  it("names the hour when it is not the current one", () => {
    render(
      <Hero
        stationCount={1}
        outlook={{ forecast: dayForecast("2026-10-28"), days: [] }}
        today="2026-10-27"
        currentHour={8}
      />,
    );
    expect(screen.getByRole("link", { name: /Ver el día completo/ })).toHaveTextContent(
      /A las \d\d:00/,
    );
  });
});

describe("landing sections", () => {
  it("tells three everyday uses with an image each", () => {
    render(<UseCases />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByRole("heading", { name: "Llegar a tiempo al aeropuerto" })).toBeVisible();
  });

  it("lists what a forecast brings and links routes and the assistant", () => {
    render(<Features />);
    expect(screen.getByRole("link", { name: /Rutas alternativas/ })).toHaveAttribute(
      "href",
      "/rutas",
    );
    expect(screen.getByRole("link", { name: /asistente que responde/ })).toHaveAttribute(
      "href",
      "/asistente",
    );
    expect(screen.getByRole("heading", { name: "Te explica el porqué" })).toBeVisible();
  });

  it("shows the model figures only when there are metrics", () => {
    const { rerender } = render(<HowItWorks metrics={MODEL.metrics} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("de los atascos fuertes avisados con antelación")).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver la metodología" })).toBeVisible();
    rerender(<HowItWorks metrics={{}} />);
    expect(screen.queryByRole("link", { name: "Ver la metodología" })).not.toBeInTheDocument();
    rerender(<HowItWorks />);
    expect(screen.queryByRole("definition")).not.toBeInTheDocument();
  });

  it("states the limits and ends with the map", () => {
    render(
      <>
        <Limits />
        <FinalCta />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Solo donde hay estación de aforo" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Abrir el mapa/ })).toHaveAttribute(
      "href",
      "/prediccion",
    );
  });

  it("wraps a page in a view transition", () => {
    render(
      <PageTransition>
        <p>Contenido</p>
      </PageTransition>,
    );
    expect(screen.getByText("Contenido")).toBeInTheDocument();
  });
});

describe("CountUp", () => {
  let callback: IntersectionObserverCallback = () => {};
  const frames: FrameRequestCallback[] = [];

  beforeEach(() => {
    frames.length = 0;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: IntersectionObserverCallback) {
          callback = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  const entry = (isIntersecting: boolean) =>
    [{ isIntersecting }] as unknown as IntersectionObserverEntry[];

  it("counts up once it is on screen and reads the final value", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { container, unmount } = render(<CountUp value={65} suffix=" %" duration={100} />);
    expect(screen.getByText("65 %", { selector: ".sr-only" })).toBeInTheDocument();
    const shown = container.querySelector("[aria-hidden='true']")!;
    act(() => callback(entry(false), {} as IntersectionObserver));
    expect(frames).toHaveLength(0);
    act(() => callback(entry(true), {} as IntersectionObserver));
    const start = performance.now();
    act(() => frames.shift()!(start));
    expect(shown.textContent).toBe("0 %");
    act(() => frames.shift()!(start + 1000));
    expect(shown.textContent).toBe("65 %");
    expect(frames).toHaveLength(0);
    unmount();
  });

  it("stays still when motion is reduced", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const { container } = render(<CountUp value={1.5} decimals={1} />);
    expect(container.querySelector("[aria-hidden='true']")).toHaveTextContent("1,5");
    expect(frames).toHaveLength(0);
  });
});
