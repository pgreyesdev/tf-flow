import {
  findStation,
  parseStationKey,
  sortStations,
  stationKey,
  stationLabel,
} from "@/lib/stations";
import { STATIONS } from "@/test/fixtures";

describe("stations", () => {
  it("round-trips a station through the URL", () => {
    const key = stationKey(STATIONS[1]!);
    expect(key).toBe("57:-1");
    expect(parseStationKey(key)).toEqual({ stationId: 57, direction: -1 });
    expect(stationKey({ stationId: 3, direction: 0 })).toBe("3:0");
  });

  it.each([undefined, "", "57", "57:2", "abc:1", "123456:1", "57:1; drop"])(
    "rejects the malformed key %s",
    (value) => {
      expect(parseStationKey(value)).toBeNull();
    },
  );

  it("labels the direction only when there are two", () => {
    expect(stationLabel(STATIONS[0]!)).toBe("Los Cristianos · sentido creciente");
    expect(stationLabel(STATIONS[2]!)).toBe("Anaga");
    expect(stationLabel({ ...STATIONS[2]!, name: " " })).toBe("Estación 12");
  });

  it("sorts by name, then id, then increasing direction first", () => {
    expect(sortStations(STATIONS).map(stationKey)).toEqual(["12:0", "57:1", "57:-1"]);
  });

  it("finds a station and direction", () => {
    expect(findStation(STATIONS, { stationId: 57, direction: -1 })).toBe(STATIONS[1]);
    expect(findStation(STATIONS, { stationId: 57, direction: 0 })).toBeUndefined();
  });
});
