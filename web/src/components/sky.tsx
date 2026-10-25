import type { Level } from "@/lib/api/schemas";

const SKIES: Record<Level, string> = {
  low: "sky sky-low",
  medium: "sky sky-medium",
  high: "sky sky-high",
};

/**
 * Fondo de la página: el color del cielo cuenta cómo está la carretera. `m-0!` evita que el `space-y`
 * del contenedor le dé margen y deje sin cielo el final de la pantalla.
 */
export function Sky({ level = "low" }: { level?: Level }) {
  return <div aria-hidden="true" data-level={level} className={`${SKIES[level]} m-0!`} />;
}
