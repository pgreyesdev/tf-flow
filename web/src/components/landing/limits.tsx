import { Gauge, MapPinOff, TriangleAlert } from "lucide-react";

const ITEMS = [
  {
    icon: Gauge,
    title: "Es una previsión, no una cámara",
    text: "Te dice cómo suele ir el tráfico a esa hora y en esas fechas. Un accidente, una obra o un evento pueden cambiarlo.",
  },
  {
    icon: MapPinOff,
    title: "Solo donde hay estación de aforo",
    text: "Sabemos el tráfico en los puntos que mide el Cabildo. En los tramos sin estación lo decimos claro, sin inventar.",
  },
  {
    icon: TriangleAlert,
    title: "Lo imprevisto, en directo",
    text: "Los accidentes no se pueden prever, así que te enseñamos los que comunica la DGT junto a la previsión.",
  },
] as const;

/** Lo que TF-FLOW no hace, dicho sin letra pequeña. */
export function Limits() {
  return (
    <section aria-labelledby="limits-title" className="reveal">
      <h2 id="limits-title" className="font-display text-2xl font-extrabold sm:text-3xl">
        Lo que conviene saber
      </h2>
      <ul className="mt-6 grid gap-4 md:grid-cols-3">
        {ITEMS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-4 rounded-3xl border border-glass-line p-5">
            <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-accent" />
            <div>
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-ink-soft">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
