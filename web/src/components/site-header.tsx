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
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2.5 sm:px-6">
        <Link href="/" className="rounded-lg py-1" aria-label="TF-FLOW, inicio">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="-mx-2 overflow-x-auto">
          <ul className="flex items-center gap-1 text-[0.975rem] whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-muted transition-colors duration-200 hover:bg-surface-muted hover:text-foreground"
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
