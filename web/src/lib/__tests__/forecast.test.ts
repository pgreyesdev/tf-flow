import {
  busiestHour,
  calmestDaytimeHour,
  congestedRanges,
  dayFocus,
  daySentence,
  formatRange,
  headlineHour,
  peakVehicles,
  summarizeDay,
  upcomingHours,
} from "@/lib/forecast";
import { hourOf } from "@/lib/format";
import { dayForecast, hourly } from "@/test/fixtures";

describe("forecast helpers", () => {
  const { hours } = dayForecast();

  it("groups consecutive congested hours", () => {
    expect(congestedRanges(hours).map(formatRange)).toEqual(["07:00–09:00"]);
    expect(congestedRanges(hours, "medium")).toEqual([
      { from: "06:00", to: "10:00", level: "high" },
      { from: "14:00", to: "15:00", level: "medium" },
    ]);
    expect(congestedRanges(hours, "low")).toHaveLength(1);
  });

  it("closes a range that lasts until midnight", () => {
    const late = [hourly("2026-10-27", 22), hourly("2026-10-27", 23)].map((h) => ({
      ...h,
      level: "high" as const,
    }));
    expect(congestedRanges(late).map(formatRange)).toEqual(["22:00–24:00"]);
  });

  it("returns no ranges on a calm day", () => {
    expect(congestedRanges(hours.map((h) => ({ ...h, level: "low" as const })))).toEqual([]);
  });

  it("suggests the calmest daytime hour", () => {
    expect(calmestDaytimeHour(hours)?.time).toBe("2026-10-27T10:00:00");
    expect(calmestDaytimeHour(hours.slice(0, 5))).toBeUndefined();
  });

  it("finds the busiest hour", () => {
    expect(peakVehicles(hours)).toBe(3008);
    expect(peakVehicles([])).toBe(0);
  });
});

describe("dayFocus", () => {
  it("highlights the riskiest hour when a jam is expected", () => {
    const forecast = dayForecast();
    expect(dayFocus(forecast)).toEqual({ hour: forecast.worst_hour, kind: "risk" });
  });

  it("highlights the busiest hour on a calm day", () => {
    const forecast = dayForecast();
    forecast.hours = forecast.hours.map((h) => ({
      ...h,
      level: h.level === "high" ? "medium" : h.level,
    }));
    expect(dayFocus(forecast)).toMatchObject({
      kind: "traffic",
      hour: { time: "2026-10-27T08:00:00" },
    });
    expect(busiestHour([])).toBeUndefined();
    expect(dayFocus({ hours: [], worst_hour: forecast.worst_hour }).hour).toBe(forecast.worst_hour);
  });
});

describe("weather-style helpers", () => {
  const forecast = dayForecast();

  it("summarises a day by its worst level and risk range", () => {
    expect(summarizeDay(forecast)).toEqual({
      date: "2026-10-27",
      level: "high",
      minRisk: 0.02,
      maxRisk: 0.88,
      peakVehicles: 3008,
    });
    expect(summarizeDay({ date: "2026-10-28", hours: [] })).toMatchObject({
      level: "low",
      minRisk: 0,
      maxRisk: 0,
    });
  });

  it("starts today's strip at the current hour", () => {
    expect(upcomingHours(forecast.hours, true, 9).map((h) => hourOf(h.time))[0]).toBe(9);
    expect(upcomingHours(forecast.hours, true, 22).map((h) => hourOf(h.time))).toEqual([
      16, 17, 18, 19, 20, 21, 22, 23,
    ]);
    expect(upcomingHours(forecast.hours, false, 20)).toHaveLength(24);
    expect(upcomingHours(forecast.hours.slice(0, 3), true, 20)).toHaveLength(3);
  });

  it("headlines the current hour today and the key hour otherwise", () => {
    expect(hourOf(headlineHour(forecast, true, 14).time)).toBe(14);
    expect(hourOf(headlineHour(forecast, false, 14).time)).toBe(8);
  });

  it("sums up the day in one sentence", () => {
    expect(daySentence(forecast.hours)).toBe(
      "Atasco fuerte previsto de 07:00 a 09:00. Hora más tranquila: 10:00.",
    );
    const dense = forecast.hours.map(
      (h) => ({ ...h, level: h.level === "high" ? "medium" : h.level }) as const,
    );
    expect(daySentence(dense)).toMatch(
      /^Sin atascos fuertes, pero con tráfico denso de 06:00 a 10:00 y de 14:00 a 15:00\./,
    );
    const calm = forecast.hours.map((h) => ({ ...h, level: "low" }) as const);
    expect(daySentence(calm)).toBe("Tráfico fluido durante todo el día.");
  });
});
