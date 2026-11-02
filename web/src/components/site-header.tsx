import Link from "next/link";

import { Logo } from "./logo";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="site-header relative z-40 px-3 pt-3 sm:sticky sm:top-0 sm:px-6">
      <div className="glass mx-auto flex max-w-6xl animate-fade-in flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-full bg-night/70 py-1.5 pr-1.5 pl-4 max-sm:rounded-3xl">
        <Link
          href="/"
          className="group rounded-full py-1 transition-transform duration-300 hover:scale-[1.03]"
          aria-label="TF-FLOW, inicio"
        >
          <Logo />
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
