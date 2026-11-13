import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Chat, SUGGESTIONS } from "@/components/chat";
import type { ChatProgress, ChatResult, SendChat } from "@/lib/chat";

function setup(results: ChatResult[]) {
  const send = vi.fn<SendChat>(() => Promise.resolve(results.shift()!));
  render(<Chat send={send} />);
  return { send, user: userEvent.setup(), input: screen.getByLabelText("Tu pregunta") };
}

/** Un envío que se controla desde el test: avanza el texto y termina cuando se le pide. */
function controlled() {
  let progress: (p: ChatProgress) => void = () => undefined;
  let finish: (result: ChatResult) => void = () => undefined;
  let signal: AbortSignal | undefined;
  const send = vi.fn<SendChat>((_, onProgress, abort) => {
    progress = onProgress;
    signal = abort;
    return new Promise((resolve) => (finish = resolve));
  });
  render(<Chat send={send} />);
  return {
    user: userEvent.setup(),
    input: screen.getByLabelText("Tu pregunta"),
    progress: (p: ChatProgress) => act(() => progress(p)),
    finish: (r: ChatResult) => act(() => finish(r)),
    aborted: () => signal?.aborted,
  };
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
    expect(send.mock.calls[0]![0]).toEqual([{ role: "user", content: "¿Y mañana?" }]);
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
    expect(send.mock.lastCall![0]).toEqual([
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

  it("shows the answer while it is being written", async () => {
    const { user, input, progress, finish } = controlled();
    await user.type(input, "¿Hay algo en la TF-5?{Enter}");
    expect(screen.getByText("Consultando las previsiones…")).toBeInTheDocument();
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "true");

    await progress({ text: "", toolsUsed: ["get_incidents"] });
    expect(screen.getByText("Mirando las incidencias de la DGT…")).toBeInTheDocument();

    await progress({ text: "Hay un accidente", toolsUsed: ["get_incidents"] });
    expect(screen.getByText("Hay un accidente")).toBeInTheDocument();
    expect(document.querySelector("[data-writing]")).toHaveTextContent("Hay un accidente");
    expect(screen.queryByText(/Mirando las incidencias/)).not.toBeInTheDocument();

    await finish({ ok: true, reply: "Hay un accidente en el km 3.", toolsUsed: ["get_incidents"] });
    expect(screen.getByText("Hay un accidente en el km 3.")).toBeInTheDocument();
    expect(document.querySelector("[data-writing]")).toBeNull();
    expect(screen.getByRole("log")).toHaveAttribute("aria-busy", "false");
    expect(screen.getAllByText("El asistente consultó las incidencias.")).toHaveLength(1);
  });

  it("drops a half-written answer that gets cut", async () => {
    const { user, input, progress, finish } = controlled();
    await user.type(input, "¿Hola?{Enter}");
    await progress({ text: "Mañana a las", toolsUsed: [] });
    await finish({ ok: false, error: "Se ha cortado" });
    expect(screen.getByRole("alert")).toHaveTextContent("Se ha cortado");
    expect(screen.queryByText("Mañana a las")).not.toBeInTheDocument();
    expect(input).toHaveValue("¿Hola?");
  });

  it("stops the answer when starting over", async () => {
    const { user, input, progress, finish, aborted } = controlled();
    await user.type(input, "¿Hola?{Enter}");
    await progress({ text: "Medio", toolsUsed: [] });
    await user.click(screen.getByRole("button", { name: "Nueva conversación" }));
    expect(aborted()).toBe(true);
    await progress({ text: "Medio texto", toolsUsed: [] });
    await finish({ ok: true, reply: "Tarde", toolsUsed: [] });
    expect(screen.queryByText(/Medio|Tarde/)).not.toBeInTheDocument();
    expect(screen.getByText("Prueba con alguna de estas preguntas")).toBeInTheDocument();
  });
});
