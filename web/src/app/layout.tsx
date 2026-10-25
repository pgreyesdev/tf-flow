import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Mono, Atkinson_Hyperlegible_Next } from "next/font/google";
import { connection } from "next/server";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { serverEnv } from "@/lib/env";

import "./globals.css";

const sans = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  // next/font no trae métricas de esta familia para ajustar la fuente de reserva.
  adjustFontFallback: false,
  fallback: ["system-ui", "sans-serif"],
});

const mono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

const DESCRIPTION =
  "Previsión hora a hora del tráfico en las carreteras de Tenerife, con los datos abiertos de las estaciones de aforo del Cabildo.";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(serverEnv().TFFLOW_SITE_URL),
    title: { default: "TF-FLOW · Previsión del tráfico en Tenerife", template: "%s · TF-FLOW" },
    description: DESCRIPTION,
    applicationName: "TF-FLOW",
    authors: [{ name: "Pablo García de los Reyes" }],
    openGraph: {
      type: "website",
      locale: "es_ES",
      siteName: "TF-FLOW",
      title: "TF-FLOW · Anticípate al atasco en Tenerife",
      description: DESCRIPTION,
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP lleva un nonce por petición, así que todas las páginas se generan al pedirlas.
  await connection();
  return (
    <html lang="es" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
        >
          Saltar al contenido
        </a>
        <SiteHeader />
        <main id="contenido" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
