import Link from "next/link";

import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-muted">
            Previsión del tráfico de Tenerife hora a hora, a partir de los datos abiertos de las
            estaciones de aforo del Cabildo.
          </p>
        </div>
        <nav aria-label="Pie de página">
          <h2 className="font-semibold">Explora</h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li>
              <Link className="hover:text-foreground hover:underline" href="/prediccion">
                Previsión por estación
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground hover:underline" href="/asistente">
                Asistente
              </Link>
            </li>
            <li>
              <Link className="hover:text-foreground hover:underline" href="/metodologia">
                Cómo funciona el modelo
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="font-semibold">Proyecto</h2>
          <ul className="mt-3 space-y-2 text-muted">
            <li>Trabajo de Fin de Grado en Ingeniería Informática, Universidad de La Laguna</li>
            <li>
              Datos:{" "}
              <a
                className="underline hover:text-foreground"
                href="https://datos.tenerife.es/"
                rel="noopener noreferrer"
              >
                datos abiertos del Cabildo de Tenerife
              </a>
            </li>
            <li>
              <a
                className="underline hover:text-foreground"
                href="https://github.com/pgreyesdev/tf-flow"
                rel="noopener noreferrer"
              >
                Código fuente
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="border-t border-border px-4 py-5 text-center text-sm text-muted">
        © {new Date().getFullYear()} Pablo García de los Reyes. Las previsiones son orientativas.
      </p>
    </footer>
  );
}
