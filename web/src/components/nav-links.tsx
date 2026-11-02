"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/lib/ui";

const NAV = [
  { href: "/prediccion", label: "Previsión" },
  { href: "/rutas", label: "Rutas" },
  { href: "/asistente", label: "Asistente" },
  { href: "/metodologia", label: "Cómo funciona" },
  { href: "/#app", label: "App" },
] as const;

/** Menú principal. La sección en la que estás queda marcada con una píldora de cristal. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="-mx-1 overflow-x-auto">
      <ul className="flex items-center gap-0.5 text-[0.95rem] whitespace-nowrap">
        {NAV.map((item) => {
          const active = !item.href.includes("#") && pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative inline-flex min-h-11 items-center rounded-full px-3.5 font-semibold transition-all duration-300 hover:bg-glass hover:text-ink active:scale-95",
                  active ? "bg-glass-strong text-ink" : "text-ink-soft",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
