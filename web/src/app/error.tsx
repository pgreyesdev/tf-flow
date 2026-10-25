"use client";

import { Sky } from "@/components/sky";
import { buttonStyles } from "@/lib/ui";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <Sky />
      <h1 className="font-display text-3xl font-extrabold sm:text-4xl">Algo ha fallado</h1>
      <p className="mt-3 text-lg text-ink-soft">
        No hemos podido mostrar esta página. Vuelve a intentarlo en unos segundos.
      </p>
      <button type="button" onClick={reset} className={`${buttonStyles.primary} mt-8`}>
        Reintentar
      </button>
    </div>
  );
}
