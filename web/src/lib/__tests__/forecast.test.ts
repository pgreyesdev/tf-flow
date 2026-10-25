import {
  busiestHour,
  calmestDaytimeHour,
  congestedRanges,
  dayFocus,
  formatRange,
  peakVehicles,
} from "@/lib/forecast";
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
