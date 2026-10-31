import {
  distanceKm,
  incidentPlace,
  incidentSince,
  incidentsNear,
  incidentTitle,
} from "@/lib/incidents";
import { INCIDENTS } from "@/test/fixtures";

const [accident, works] = INCIDENTS.incidents as [
  (typeof INCIDENTS.incidents)[0],
  (typeof INCIDENTS.incidents)[0],
];

describe("incidents", () => {
  it("names what happens and where", () => {
    expect(incidentTitle(accident)).toBe("Accidente");
    expect(incidentTitle(works)).toBe("Obras · Vía cortada");
    expect(incidentPlace(works)).toBe("TF-82, km 9,5 · El Tanque");
    expect(incidentPlace({ ...works, kilometer: null })).toBe("TF-82 · El Tanque");
    expect(incidentPlace({ ...works, road: null, kilometer: null, municipality: null })).toBe(
      "Tenerife",
    );
  });

  it("says since when, with the hour if it started today", () => {
    const now = new Date("2026-10-27T09:00:00Z");
    expect(incidentSince(accident, now)).toBe("Desde las 07:50");
    expect(incidentSince(works, now)).toBe("Desde el 22 jun");
    expect(incidentSince({ ...works, start: null }, now)).toBeUndefined();
  });

  it("finds the incidents close to a station", () => {
    const station = { latitude: 28.05, longitude: -16.71 };
    expect(distanceKm(station, station)).toBe(0);
    expect(distanceKm(station, accident)).toBeCloseTo(1.49, 1);
    expect(incidentsNear(INCIDENTS.incidents, station)).toEqual([accident]);
    expect(incidentsNear(INCIDENTS.incidents, station, 50).map((i) => i.id)).toEqual([
      "1",
      "17264754",
    ]);
  });
});
