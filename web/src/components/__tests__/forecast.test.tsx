import { render, screen, within } from "@testing-library/react";

import { ForecastInsights } from "@/components/forecast-insights";
import { HourlyChart } from "@/components/hourly-chart";
import { LevelBadge } from "@/components/level-badge";
import { Notice } from "@/components/notice";
import { dayForecast } from "@/test/fixtures";

describe("HourlyChart", () => {
  const forecast = dayForecast();

  it("draws one bar per hour coloured by level and highlights the worst", () => {
    const { container } = render(
      <HourlyChart hours={forecast.hours} highlight={forecast.worst_hour.time} title="Martes" />,
    );
    const bars = container.querySelectorAll("rect");
    expect(bars).toHaveLength(24);
    expect(bars[8]).toHaveAttribute("data-level", "high");
    expect(bars[8]).toHaveClass("stroke-ink");
    expect(bars[3]).not.toHaveClass("stroke-ink");
    expect(screen.getByRole("img")).toHaveAccessibleName(/Martes\. Máximo de 3008 vehículos/);
  });

  it("offers the same data as a table", () => {
    render(<HourlyChart hours={forecast.hours} title="Martes" />);
    const table = screen.getByRole("table", { name: "Martes" });
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(25);
    expect(rows[9]).toHaveTextContent(/08:003008Atasco8[89]\s%/);
  });

  it("hides the legend and table when compact", () => {
    render(<HourlyChart compact hours={forecast.hours} title="Hoy" />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("copes with a day without traffic", () => {
    const { container } = render(
      <HourlyChart hours={forecast.hours.map((h) => ({ ...h, vehicles: 0 }))} title="Vacío" />,
    );
    expect(container.querySelector("rect")).toHaveAttribute("height", "1.5");
  });
});

describe("ForecastInsights", () => {
  it("explains the worst hour and summarises the day", () => {
    render(<ForecastInsights forecast={dayForecast()} />);
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByText(/88\s%.*atasco fuerte/)).toBeInTheDocument();
    expect(screen.getByText(/la hora del día/).parentElement).toHaveTextContent("Sube el riesgo");
    expect(screen.getByText(/que no es festivo/).parentElement).toHaveTextContent("Baja el riesgo");
    expect(screen.getByText("07:00–09:00")).toBeInTheDocument();
    expect(screen.getByText("06:00–10:00, 14:00–15:00")).toBeInTheDocument();
    expect(screen.getByText(/^10:00, con/)).toBeInTheDocument();
  });

  it("says when no hour is congested", () => {
    const calm = dayForecast();
    calm.hours = calm.hours.map((h) => ({ ...h, level: "low", factors: [] }));
    calm.worst_hour = calm.hours[8]!;
    render(<ForecastInsights forecast={calm} />);
    expect(screen.getAllByText("Ninguna hora")).toHaveLength(2);
    expect(screen.queryByText("Por qué")).not.toBeInTheDocument();
  });
});

describe("LevelBadge and Notice", () => {
  it("never relies on colour alone", () => {
    render(<LevelBadge level="medium" />);
    expect(screen.getByText("Denso")).toBeInTheDocument();
  });

  it("announces errors as alerts and the rest as status", () => {
    render(
      <>
        <Notice tone="error" title="Fallo">
          Detalle
        </Notice>
        <Notice tone="info" title="Aviso">
          Nota
        </Notice>
      </>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("FalloDetalle");
    expect(screen.getByRole("status")).toHaveTextContent("AvisoNota");
  });
});
