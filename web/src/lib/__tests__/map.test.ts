import type { NetworkNow, Station } from "@/lib/api/schemas";
import { mapPoints, pickerMarkers } from "@/lib/map";
import { hourly } from "@/test/fixtures";

const LAGUNA = { latitude: 28.4483, longitude: -16.2736 };

function entry(station: Partial<Station>, probability: number) {
  return {
    station: {
      station_id: 1,
      direction: 1 as const,
      direction_label: "creciente",
      name: "TF-5 La Laguna",
      ...LAGUNA,
      ...station,
    },
    hour: {
      ...hourly("2026-10-28", 8),
      probability_high: probability,
      level: probability > 0.5 ? ("high" as const) : ("low" as const),
    },
  };
}

function network(...stations: NetworkNow["stations"]): NetworkNow {
  return { time: "2026-10-28T08:00:00", stations };
}

describe("mapPoints", () => {
  it("shows each station once, with the direction that is worse", () => {
    const points = mapPoints(network(entry({}, 0.2), entry({ direction: -1 }, 0.8)));
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ stationId: 1, level: "high", key: "1:-1" });
  });

  it("leaves out stations without coordinates or outside the island", () => {
    const points = mapPoints(
      network(
        entry({ station_id: 2, latitude: null, longitude: null }, 0.1),
        entry({ station_id: 3, latitude: 0, longitude: 0 }, 0.1),
        entry({ station_id: 4 }, 0.1),
      ),
    );
    expect(points.map((p) => p.stationId)).toEqual([4]);
  });

  it("puts the riskiest stations first", () => {
    const points = mapPoints(network(entry({ station_id: 5 }, 0.1), entry({ station_id: 6 }, 0.9)));
    expect(points.map((p) => p.stationId)).toEqual([6, 5]);
  });
});

describe("pickerMarkers", () => {
  const station = (s: Partial<Station>): Station => ({
    station_id: 1,
    direction: 1,
    direction_label: "creciente",
    name: "TF-5 La Laguna",
    ...LAGUNA,
    ...s,
  });

  it("joins both directions in one marker with this hour's worst level", () => {
    const stations = [
      station({}),
      station({ direction: -1, direction_label: "decreciente" }),
      station({ station_id: 2, name: "  ", latitude: null, longitude: null }),
      station({ station_id: 3, name: "Fuera", latitude: 40, longitude: -3 }),
      station({ station_id: 4, name: "Anaga", direction: 0, direction_label: "único" }),
    ];
    const network: NetworkNow = {
      time: "2026-10-28T08:00:00",
      stations: [entry({}, 0.2), entry({ direction: -1 }, 0.9)],
    };
    const markers = pickerMarkers(stations, network);
    expect(markers.map((m) => m.stationId)).toEqual([4, 1]);
    const laguna = markers.find((m) => m.stationId === 1)!;
    expect(laguna).toMatchObject({ key: "1:-1", level: "high", probabilityHigh: 0.9 });
    expect(laguna.directions).toEqual([
      { key: "1:1", label: "Sentido creciente" },
      { key: "1:-1", label: "Sentido decreciente" },
    ]);
    expect(markers.find((m) => m.stationId === 4)).toMatchObject({
      key: "4:0",
      level: undefined,
      directions: [{ key: "4:0", label: "Ambos sentidos" }],
    });
  });

  it("works without the network forecast", () => {
    expect(pickerMarkers([station({})])[0]).toMatchObject({ key: "1:1", level: undefined });
  });
});
