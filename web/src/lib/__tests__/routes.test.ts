import {
  formatDistance,
  formatDuration,
  planBounds,
  recommendationReason,
  trafficSummary,
} from "@/lib/routes";
import { ROUTE_PLAN } from "@/test/fixtures";

const [direct, detour] = ROUTE_PLAN.routes as [
  (typeof ROUTE_PLAN.routes)[0],
  (typeof ROUTE_PLAN.routes)[0],
];

describe("routes", () => {
  it("formats times and distances", () => {
    expect(formatDuration(0.2)).toBe("1 min");
    expect(formatDuration(44.6)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h");
    expect(formatDuration(65)).toBe("1 h 5 min");
    expect(formatDistance(12.34)).toBe("12,3 km");
  });

  it("summarises what the stations on the route expect", () => {
    expect(trafficSummary(direct)).toBe("2 aforos: 1 con atasco y 1 con tráfico denso a tu paso.");
    expect(trafficSummary(detour)).toMatch(/no sabemos cómo estará el tráfico/);
    const calm = direct.stations[0]!;
    expect(trafficSummary({ ...direct, stations: [{ ...calm, level: "low" }] })).toBe(
      "1 aforo, todo fluido a tu paso.",
    );
  });

  it("explains why the recommended route wins", () => {
    expect(recommendationReason(ROUTE_PLAN)).toMatch(/más rápida/);
    const slower = { ...ROUTE_PLAN, routes: [detour, direct] };
    expect(recommendationReason(slower)).toMatch(/No es la más corta/);
    const closed = { ...ROUTE_PLAN, routes: [detour, { ...direct, closed: true }] };
    expect(recommendationReason(closed)).toMatch(/vía cortada/);
    expect(recommendationReason({ ...ROUTE_PLAN, routes: [direct] })).toBeUndefined();
  });

  it("frames every route", () => {
    expect(planBounds(ROUTE_PLAN)).toEqual([-16.3159, 28.4483, -16.2518, 28.5]);
  });
});
