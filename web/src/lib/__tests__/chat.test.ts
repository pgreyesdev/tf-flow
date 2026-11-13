import type { ChatMessage } from "@/lib/api/schemas";
import {
  ASSISTANT_ENDPOINT,
  CUT_OFF,
  historyForRequest,
  MAX_HISTORY,
  readEvents,
  streamChat,
  UNAVAILABLE,
  UNREACHABLE,
} from "@/lib/chat";

function conversation(length: number): ChatMessage[] {
  return Array.from({ length }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `mensaje ${i}`,
  }));
}

describe("historyForRequest", () => {
  it("keeps short conversations whole", () => {
    expect(historyForRequest(conversation(3))).toHaveLength(3);
  });

  it("keeps the latest messages and starts with a question", () => {
    const history = historyForRequest(conversation(41));
    expect(history.length).toBeLessThanOrEqual(MAX_HISTORY);
    expect(history[0]?.role).toBe("user");
    expect(history.at(-1)?.content).toBe("mensaje 40");
  });

  it("drops a leading answer", () => {
    const history = historyForRequest(conversation(21).slice(1));
    expect(history[0]?.role).toBe("user");
  });

  it("returns nothing without questions", () => {
    expect(historyForRequest([{ role: "assistant", content: "hola" }])).toEqual([]);
  });
});

function sse(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

function event(body: object): string {
  return `data: ${JSON.stringify(body)}\n\n`;
}

describe("readEvents", () => {
  it("joins events split across chunks and skips what it does not understand", async () => {
    const whole = event({ type: "delta", text: "Atasco ñ" });
    const events = [];
    for await (const e of readEvents(
      sse(
        whole.slice(0, 12),
        whole.slice(12) + ": comentario\n\n",
        'data: {"type":"otro"}\n\ndata: {roto\n\n',
        event({ type: "tool", name: "plan_route" }).replace("\n\n", "\r\n\r\n"),
      ),
    )) {
      events.push(e);
    }
    expect(events).toEqual([
      { type: "delta", text: "Atasco ñ" },
      { type: "tool", name: "plan_route" },
    ]);
  });
});

describe("streamChat", () => {
  const question = [{ role: "user" as const, content: "¿Atascos?" }];

  function respond(response: Response | Promise<Response>) {
    const fetchMock = vi.fn(() => Promise.resolve(response));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("reports the text as it arrives and returns the whole answer", async () => {
    const fetchMock = respond(
      new Response(
        sse(
          event({ type: "tool", name: "get_incidents" }),
          event({ type: "delta", text: "Hay " }),
          event({ type: "delta", text: "un accidente." }),
          event({ type: "done", tools_used: ["get_incidents"], tokens_used: 9 }),
        ),
      ),
    );
    const progress = vi.fn();

    await expect(streamChat(question, progress)).resolves.toEqual({
      ok: true,
      reply: "Hay un accidente.",
      toolsUsed: ["get_incidents"],
    });
    expect(progress.mock.calls.map(([p]) => p)).toEqual([
      { text: "", toolsUsed: ["get_incidents"] },
      { text: "Hay ", toolsUsed: ["get_incidents"] },
      { text: "Hay un accidente.", toolsUsed: ["get_incidents"] },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ASSISTANT_ENDPOINT);
    expect(JSON.parse(String(init.body))).toEqual({ messages: question });
  });

  it("replaces the text when the assistant takes it back", async () => {
    respond(
      new Response(
        sse(
          event({ type: "delta", text: "Empiezo" }),
          event({ type: "replace", text: "No puedo responder a eso." }),
          event({ type: "done", tools_used: [], tokens_used: 1 }),
        ),
      ),
    );
    await expect(streamChat(question, () => undefined)).resolves.toMatchObject({
      reply: "No puedo responder a eso.",
    });
  });

  it.each([
    [
      "an error event",
      sse(event({ type: "delta", text: "a" }), event({ type: "error", detail: "x" })),
    ],
    ["a stream that ends early", sse(event({ type: "delta", text: "a" }))],
    [
      "a broken connection",
      new ReadableStream({
        pull(controller) {
          controller.error(new TypeError("network"));
        },
      }),
    ],
  ])("fails with %s", async (_, body) => {
    respond(new Response(body));
    await expect(streamChat(question, () => undefined)).resolves.toEqual({
      ok: false,
      error: CUT_OFF,
    });
  });

  it("explains errors before the answer starts", async () => {
    respond(Response.json({ error: "Espera", retryAfter: 20 }, { status: 429 }));
    await expect(streamChat(question, () => undefined)).resolves.toEqual({
      ok: false,
      error: "Espera",
      retryAfter: 20,
    });
    respond(new Response("<html>", { status: 502 }));
    await expect(streamChat(question, () => undefined)).resolves.toEqual({
      ok: false,
      error: UNAVAILABLE,
      retryAfter: undefined,
    });
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("offline")));
    await expect(streamChat(question, () => undefined)).resolves.toEqual({
      ok: false,
      error: UNREACHABLE,
    });
  });
});
