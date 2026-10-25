import type { ChatMessage } from "@/lib/api/schemas";
import { historyForRequest, MAX_HISTORY } from "@/lib/chat";

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
