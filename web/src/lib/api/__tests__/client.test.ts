import {
  ApiError,
  askAssistant,
  getDayForecast,
  getModelInfo,
  getStations,
} from "@/lib/api/client";
import { getHomeData } from "@/lib/api/featured";
import { dayForecast, MODEL, STATIONS } from "@/test/fixtures";

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function mockFetch(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(new URL(String(input)), init ?? {})),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("TFFLOW_API_URL", "http://api.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("validates and returns the stations", async () => {
    const fetchMock = mockFetch(() => json(STATIONS));
    await expect(getStations()).resolves.toEqual(STATIONS);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test/api/v1/stations");
    expect(init).toMatchObject({ next: { revalidate: 600 } });
  });

  it("asks for a day forecast with direction and date", async () => {
    const forecast = dayForecast();
    const fetchMock = mockFetch(() => json(forecast));
    await expect(getDayForecast(57, -1, "2026-10-27")).resolves.toEqual(forecast);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "http://api.test/api/v1/stations/57/forecast?direction=-1&date=2026-10-27",
    );
    await getDayForecast(57, 1);
    expect(String(fetchMock.mock.calls[1]![0])).toMatch(/forecast\?direction=1$/);
  });

  it("returns the model info", async () => {
    mockFetch(() => json(MODEL));
    await expect(getModelInfo()).resolves.toEqual(MODEL);
  });

  it.each([
    [404, "not_found"],
    [422, "out_of_range"],
    [429, "rate_limited"],
    [403, "forbidden"],
    [503, "unavailable"],
    [500, "unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    mockFetch(() => json({ detail: "motivo" }, status, { "Retry-After": "12" }));
    const error = await getStations().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind, message: "motivo", retryAfter: 12 });
  });

  it("describes errors without a readable body", async () => {
    mockFetch(() => new Response("<html>", { status: 502 }));
    await expect(getStations()).rejects.toMatchObject({
      kind: "unavailable",
      message: "La API respondió 502",
      retryAfter: undefined,
    });
  });

  it("rejects answers with an unexpected shape", async () => {
    mockFetch(() => json([{ station_id: "57" }]));
    await expect(getStations()).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("reports a network failure as unavailable", async () => {
    mockFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(getStations()).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("sends the assistant token only when configured", async () => {
    const reply = { reply: "Hola", tools_used: [], tokens_used: 10 };
    const fetchMock = mockFetch(() => json(reply));
    const messages = [{ role: "user" as const, content: "¿Hola?" }];

    await expect(askAssistant(messages)).resolves.toEqual(reply);
    let init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).not.toHaveProperty("X-Assistant-Token");
    expect(JSON.parse(String(init.body))).toEqual({ messages });

    vi.stubEnv("TFFLOW_ASSISTANT_TOKEN", "secreto");
    await askAssistant(messages);
    init = fetchMock.mock.calls[1]![1]!;
    expect(init.headers).toHaveProperty("X-Assistant-Token", "secreto");
  });

  it("refuses a malformed API address", async () => {
    vi.stubEnv("TFFLOW_API_URL", "ftp://api.test");
    await expect(getStations()).rejects.toThrow();
  });
});

describe("home data", () => {
  function api(forecastStatus = 200) {
    return mockFetch((url) => {
      if (url.pathname.endsWith("/stations")) return json(STATIONS);
      if (url.pathname.endsWith("/model")) return json(MODEL);
      const id = Number(url.pathname.split("/")[4]);
      const direction = Number(url.searchParams.get("direction"));
      const station = STATIONS.find((s) => s.station_id === id && s.direction === direction)!;
      return forecastStatus === 200
        ? json(dayForecast(undefined, station))
        : json({}, forecastStatus);
    });
  }

  it("features the configured station", async () => {
    vi.stubEnv("TFFLOW_FEATURED_STATION", "57:-1");
    api();
    const data = await getHomeData();
    expect(data.forecast?.station).toEqual(STATIONS[1]);
    expect(data.model).toEqual(MODEL);
  });

  it("falls back to the first station in order", async () => {
    api();
    expect((await getHomeData()).forecast?.station).toEqual(STATIONS[2]);
  });

  it("still renders when the forecast fails", async () => {
    api(503);
    const data = await getHomeData();
    expect(data.stations).toHaveLength(3);
    expect(data.forecast).toBeUndefined();
  });

  it("still renders when the API is down", async () => {
    mockFetch(() => Promise.reject(new TypeError("fetch failed")));
    await expect(getHomeData()).resolves.toEqual({
      stations: [],
      forecast: undefined,
      model: undefined,
    });
  });
});
