import Link from "next/link";

import { Logo } from "./logo";

const NAV = [
  { href: "/prediccion", label: "Previsión" },
  { href: "/asistente", label: "Asistente" },
  { href: "/metodologia", label: "Cómo funciona" },
  { href: "/#app", label: "App" },
] as const;

export function SiteHeader() {
  return (
    <header className="relative z-40 px-3 pt-3 sm:sticky sm:top-0 sm:px-6">
      <div className="glass mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-full bg-night/70 py-1.5 pr-1.5 pl-4 max-sm:rounded-3xl">
        <Link href="/" className="rounded-full py-1" aria-label="TF-FLOW, inicio">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="-mx-1 overflow-x-auto">
          <ul className="flex items-center gap-0.5 text-[0.95rem] whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-full px-3.5 font-semibold text-ink-soft transition-colors duration-200 hover:bg-glass hover:text-ink"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
