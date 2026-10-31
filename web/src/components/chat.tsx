"use client";

import { Bot, LoaderCircle, RotateCcw, SendHorizontal, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { RichText } from "@/components/rich-text";
import type { ChatMessage } from "@/lib/api/schemas";
import { type ChatResult, MAX_MESSAGE_LENGTH, TOOL_LABELS } from "@/lib/chat";
import { buttonStyles, cx } from "@/lib/ui";

interface Entry extends ChatMessage {
  toolsUsed?: string[];
}

export const SUGGESTIONS = [
  "¿Cómo estará mañana la autopista del norte a las 8?",
  "¿A qué hora conviene salir hacia el sur el viernes?",
  "¿Qué tan fiable es la previsión?",
] as const;

interface ChatProps {
  send: (messages: ChatMessage[]) => Promise<ChatResult>;
}

export function Chat({ send }: ChatProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const counterId = useId();

  useEffect(() => {
    if (entries.length === 0) {
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [entries, pending]);

  function submit(text: string) {
    const question = text.trim();
    if (!question || pending) {
      return;
    }
    const history: Entry[] = [...entries, { role: "user", content: question }];
    setEntries(history);
    setDraft("");
    setError(null);
    startTransition(async () => {
      const result = await send(history.map(({ role, content }) => ({ role, content })));
      if (result.ok) {
        setEntries([
          ...history,
          { role: "assistant", content: result.reply, toolsUsed: result.toolsUsed },
        ]);
      } else {
        // La pregunta no llegó a responderse: vuelve al cuadro de texto para reintentarla.
        setEntries(entries);
        setDraft(question);
        setError(result.error);
      }
      inputRef.current?.focus();
    });
  }

  function reset() {
    setEntries([]);
    setDraft("");
    setError(null);
    inputRef.current?.focus();
  }

  return (
    <div className="glass flex flex-col">
      <div
        role="log"
        aria-live="polite"
        aria-label="Conversación con el asistente"
        className="min-h-80 space-y-5 p-4 sm:p-6"
      >
        {entries.length === 0 && (
          <div className="py-6 text-center">
            <p className="font-semibold">Prueba con alguna de estas preguntas</p>
            <ul className="mt-4 flex flex-col items-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    className="min-h-11 cursor-pointer rounded-full border border-glass-line px-4 py-2 text-left transition-colors duration-200 hover:bg-glass"
                  >
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {entries.map((entry, i) => (
          <Message key={i} entry={entry} />
        ))}
        {pending && (
          <p className="flex items-center gap-2 text-ink-soft">
            <LoaderCircle
              aria-hidden="true"
              className="size-5 animate-spin motion-reduce:animate-none"
            />
            Consultando las previsiones…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="mx-4 mb-3 rounded-xl bg-high/15 px-4 py-3 text-high sm:mx-6">
          {error}
        </p>
      )}

      <form
        className="border-t border-glass-line p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <label htmlFor={inputId} className="font-semibold">
          Tu pregunta
        </label>
        <textarea
          ref={inputRef}
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(draft);
            }
          }}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={2}
          aria-describedby={counterId}
          placeholder="Por ejemplo: ¿habrá atasco el lunes a las 8 en la TF-1?"
          className="mt-1.5 block w-full resize-y rounded-xl border border-glass-line bg-glass px-3.5 py-3 text-base placeholder:text-ink-soft"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span id={counterId} className="text-sm text-ink-soft tabular">
            {draft.length}/{MAX_MESSAGE_LENGTH} caracteres · Intro para enviar
          </span>
          <div className="flex gap-2">
            {entries.length > 0 && (
              <button type="button" onClick={reset} className={buttonStyles.ghost}>
                <RotateCcw aria-hidden="true" className="size-4" />
                Nueva conversación
              </button>
            )}
            <button
              type="submit"
              disabled={pending || draft.trim() === ""}
              className={buttonStyles.primary}
            >
              <SendHorizontal aria-hidden="true" className="size-5" />
              Enviar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Message({ entry }: { entry: Entry }) {
  const mine = entry.role === "user";
  const Icon = mine ? UserRound : Bot;
  const tools = [...new Set(entry.toolsUsed)].map((tool) => TOOL_LABELS[tool]).filter(Boolean);
  return (
    <div className={cx("flex gap-3", mine && "flex-row-reverse")}>
      <span
        aria-hidden="true"
        className={cx(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          mine ? "bg-accent text-accent-ink" : "bg-glass text-ink",
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className={cx("max-w-[85%] sm:max-w-[75%]", mine && "text-right")}>
        <p className="sr-only">{mine ? "Tú:" : "Asistente:"}</p>
        {mine ? (
          <p className="inline-block rounded-2xl rounded-tr-md bg-accent px-4 py-3 text-left whitespace-pre-line text-accent-ink">
            {entry.content}
          </p>
        ) : (
          <div className="inline-block rounded-2xl rounded-tl-md bg-glass px-4 py-3 text-left">
            <RichText text={entry.content} />
          </div>
        )}
        {tools.length > 0 && (
          <p className="mt-1 text-sm text-ink-soft">El asistente {tools.join(" y ")}.</p>
        )}
      </div>
    </div>
  );
}
