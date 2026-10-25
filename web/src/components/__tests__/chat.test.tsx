import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Chat, SUGGESTIONS } from "@/components/chat";
import type { ChatResult } from "@/lib/chat";

function setup(results: ChatResult[]) {
  const send = vi.fn(() => Promise.resolve(results.shift()!));
  render(<Chat send={send} />);
  return { send, user: userEvent.setup(), input: screen.getByLabelText("Tu pregunta") };
}

describe("Chat", () => {
  it("sends a question and shows the answer with the tools used", async () => {
    const { send, user, input } = setup([
      {
        ok: true,
        reply: "A las 8 habrá atasco.",
        toolsUsed: ["find_stations", "get_day_forecast", "get_day_forecast"],
      },
    ]);
    await user.type(input, "¿Y mañana?{Enter}");

    expect(await screen.findByText("A las 8 habrá atasco.")).toBeInTheDocument();
    expect(
      screen.getByText("El asistente buscó estaciones y consultó la previsión."),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith([{ role: "user", content: "¿Y mañana?" }]);
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("sends the whole conversation on follow-up questions", async () => {
    const { send, user, input } = setup([
      { ok: true, reply: "Uno", toolsUsed: [] },
      { ok: true, reply: "Dos", toolsUsed: [] },
    ]);
    await user.click(screen.getByRole("button", { name: SUGGESTIONS[0] }));
    await screen.findByText("Uno");
    await user.type(input, "¿Y el viernes?");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText("Dos");
    expect(send).toHaveBeenLastCalledWith([
      { role: "user", content: SUGGESTIONS[0] },
      { role: "assistant", content: "Uno" },
      { role: "user", content: "¿Y el viernes?" },
    ]);
  });

  it("gives the question back when it fails", async () => {
    const { user, input } = setup([{ ok: false, error: "No disponible" }]);
    await user.type(input, "¿Hola?{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("No disponible");
    expect(input).toHaveValue("¿Hola?");
    expect(screen.queryByText("¿Hola?", { selector: "p" })).not.toBeInTheDocument();
  });

  it("ignores empty questions and allows new lines", async () => {
    const { send, user, input } = setup([]);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.type(input, "   {Enter}");
    await user.type(input, "a{Shift>}{Enter}{/Shift}b");
    expect(input).toHaveValue("   a\nb");
    expect(send).not.toHaveBeenCalled();
  });

  it("starts over", async () => {
    const { user, input } = setup([{ ok: true, reply: "Hecho", toolsUsed: [] }]);
    await user.type(input, "Hola{Enter}");
    await screen.findByText("Hecho");
    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
    await waitFor(() => expect(screen.queryByText("Hecho")).not.toBeInTheDocument());
    expect(screen.getByText("Prueba con alguna de estas preguntas")).toBeInTheDocument();
  });
});
