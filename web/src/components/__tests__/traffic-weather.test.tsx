import { render, screen, within } from "@testing-library/react";

import { DayList } from "@/components/day-list";
import { HourlyStrip } from "@/components/hourly-strip";
import { Sky } from "@/components/sky";
import { TrafficWeather } from "@/components/traffic-weather";
import { summarizeDay } from "@/lib/forecast";
import { dayForecast } from "@/test/fixtures";

const TODAY = "2026-10-27";
const forecast = dayForecast(TODAY);
const week = [TODAY, "2026-10-28", "2026-10-29"].map((d) => summarizeDay(dayForecast(d)));

describe("HourlyStrip", () => {
  it("labels the current hour and reads each hour aloud with its level", () => {
    render(<HourlyStrip hours={forecast.hours.slice(7, 10)} now={forecast.hours[7]!.time} />);
    const items = within(screen.getByRole("list", { name: "Hora a hora" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("AhoraAtasco, 87 %3007 vehículos");
    expect(items[2]).toHaveTextContent("09:00Denso, 30 %1800 vehículos");
  });
});

describe("DayList", () => {
  it("links every day and marks the selected one", () => {
    render(
      <DayList
        days={week}
        today={TODAY}
        selected="2026-10-28"
        href={(date) => ({ pathname: "/prediccion", query: { estacion: "57:1", fecha: date } })}
      />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent(/^Hoy/);
    expect(links[0]).toHaveTextContent("Atasco. Riesgo entre 2 % y 88 %");
    expect(links[1]).toHaveAttribute("aria-current", "date");
    expect(links[1]).toHaveAttribute("href", "/prediccion?estacion=57%3A1&fecha=2026-10-28");
  });
});

describe("TrafficWeather", () => {
  it("headlines the current hour today", () => {
    render(<TrafficWeather forecast={forecast} days={week} today={TODAY} currentHour={8} />);
    const header = screen.getByRole("heading", { level: 1, name: "Los Cristianos" }).parentElement!;
    expect(header).toHaveTextContent("Hoy");
    expect(header).toHaveTextContent("88%Atasco · riesgo de atasco ahora");
    expect(header).toHaveTextContent("Máx. 88 % a las 08:00 · Mín. 3 % a las 10:00");
    expect(screen.getByText(/^Atasco fuerte previsto de 07:00 a 09:00/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Próximos 3 días" })).toBeInTheDocument();
  });

  it("headlines the key hour on another day", () => {
    const other = dayForecast("2026-10-29");
    render(
      <TrafficWeather
        forecast={other}
        days={week}
        today={TODAY}
        currentHour={8}
        headingLevel="h2"
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Los Cristianos" })).toBeInTheDocument();
    expect(screen.getByText(/riesgo de atasco a las 08:00/)).toBeInTheDocument();
    expect(screen.getByText("jueves, 29 de octubre")).toBeInTheDocument();
  });

  it("hides the week when only one day is known", () => {
    render(
      <TrafficWeather forecast={forecast} days={week.slice(0, 1)} today={TODAY} currentHour={3} />,
    );
    expect(screen.queryByRole("heading", { name: /Próximos/ })).not.toBeInTheDocument();
  });
});

describe("Sky", () => {
  it("paints the background for the level and hides it from assistive tech", () => {
    const { container } = render(<Sky level="high" />);
    expect(container.firstChild).toHaveClass("sky", "sky-high");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
