import Link from "next/link";

import { Logo } from "./logo";

const link = "underline-offset-4 hover:text-ink hover:underline";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-20 max-w-5xl px-3 pb-8 sm:px-6">
      <div className="glass grid gap-10 p-6 sm:p-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-ink-soft">
            El parte del tráfico de Tenerife, hora a hora, con los datos abiertos de las estaciones
            de aforo del Cabildo.
          </p>
        </div>
        <nav aria-label="Pie de página">
          <h2 className="font-bold">Explora</h2>
          <ul className="mt-3 space-y-2 text-ink-soft">
            <li>
              <Link className={link} href="/prediccion">
                Previsión por estación
              </Link>
            </li>
            <li>
              <Link className={link} href="/asistente">
                Asistente
              </Link>
            </li>
            <li>
              <Link className={link} href="/metodologia">
                Cómo funciona el modelo
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="font-bold">Proyecto</h2>
          <ul className="mt-3 space-y-2 text-ink-soft">
            <li>Trabajo de Fin de Grado en Ingeniería Informática, Universidad de La Laguna</li>
            <li>
              Datos:{" "}
              <a className="underline" href="https://datos.tenerife.es/" rel="noopener noreferrer">
                datos abiertos del Cabildo de Tenerife
              </a>
            </li>
            <li>
              <a
                className="underline"
                href="https://github.com/pgreyesdev/tf-flow"
                rel="noopener noreferrer"
              >
                Código fuente
              </a>
            </li>
          </ul>
        </div>
      </div>
      <p className="mt-6 text-center text-sm text-ink-soft">
        © {new Date().getFullYear()} Pablo García de los Reyes. Las previsiones son orientativas.
      </p>
    </footer>
  );
}
