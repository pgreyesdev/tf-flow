import type { Level } from "@/lib/api/schemas";

export interface LevelInfo {
  label: string;
  description: string;
}

/** Nombres de los niveles para el público. El color nunca va solo: siempre con texto e icono. */
export const LEVEL_INFO: Record<Level, LevelInfo> = {
  low: { label: "Fluido", description: "Circulación normal para la vía" },
  medium: { label: "Denso", description: "Tráfico intenso, con retenciones posibles" },
  high: { label: "Atasco", description: "Atasco fuerte: la vía va al límite de su capacidad" },
};
