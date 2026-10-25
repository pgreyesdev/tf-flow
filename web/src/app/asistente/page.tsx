import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { Chat } from "@/components/chat";

import { sendToAssistant } from "./actions";

export const metadata: Metadata = {
  title: "Asistente",
  description: "Pregunta en lenguaje natural por el tráfico previsto en Tenerife.",
};

export default function AssistantPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-10 sm:px-6 sm:pt-14">
      <header>
        <h1 className="text-3xl font-bold sm:text-4xl">Asistente</h1>
        <p className="mt-2 text-lg text-muted">
          Pregunta por un día, una hora o una carretera. El asistente busca el punto de medida,
          consulta la previsión del modelo y te lo explica.
        </p>
      </header>

      <Chat send={sendToAssistant} />

      <aside
        aria-labelledby="privacy-title"
        className="flex gap-3 rounded-2xl border border-border bg-surface-muted p-4 text-sm sm:p-5"
      >
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="space-y-1.5">
          <h2 id="privacy-title" className="font-semibold">
            Qué pasa con lo que escribes
          </h2>
          <p className="text-muted">
            Para responder, tus preguntas se envían a OpenAI, que ofrece el modelo de lenguaje.
            TF-FLOW no guarda la conversación: vive solo en esta pestaña y se borra al cerrarla.
            OpenAI no usa estos datos para entrenar sus modelos y puede conservarlos hasta 30 días
            para vigilar abusos.
          </p>
          <p className="text-muted">
            No escribas datos personales. Las respuestas salen del mismo modelo que la previsión por
            estación y, como ella, son orientativas.
          </p>
        </div>
      </aside>
    </div>
  );
}
