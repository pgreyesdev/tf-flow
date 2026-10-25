import {
  addDays,
  formatLongDate,
  formatPercent,
  formatShortDate,
  formatVehicles,
  hourLabel,
  hourOf,
  isIsoDate,
  todayInTenerife,
} from "@/lib/format";

describe("format", () => {
  it("reads local hours without shifting time zones", () => {
    expect(hourLabel("2026-10-27T08:00:00")).toBe("08:00");
    expect(hourOf("2026-10-27T23:00:00")).toBe(23);
  });

  it("formats numbers the Spanish way", () => {
    expect(formatVehicles(3120.6)).toBe("3121");
    expect(formatVehicles(31206)).toBe("31.206");
    expect(formatPercent(0.81)).toMatch(/^81\s%$/);
  });

  it("formats dates in Spanish", () => {
    expect(formatLongDate("2026-10-27")).toBe("martes, 27 de octubre de 2026");
    expect(formatShortDate("2026-09-30T23:00:00")).toBe("30 de septiembre de 2026");
  });

  it("knows the date in Tenerife, an hour behind Madrid", () => {
    // 23:30 UTC del 31 de diciembre: en Canarias sigue siendo 31; en Madrid ya es 1 de enero.
    expect(todayInTenerife(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
    expect(todayInTenerife(new Date("2027-01-01T00:30:00Z"))).toBe("2027-01-01");
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("only accepts real calendar dates", () => {
    expect(isIsoDate("2026-10-27")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("27/10/2026")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });
});
