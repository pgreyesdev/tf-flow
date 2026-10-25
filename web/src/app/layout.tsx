import type { Metadata, Viewport } from "next";
import { Manrope, Plus_Jakarta_Sans } from "next/font/google";
import { connection } from "next/server";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { serverEnv } from "@/lib/env";

import "./globals.css";

const sans = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const display = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  display: "swap",
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
  themeColor: [{ color: "#061a33" }],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // La CSP lleva un nonce por petición, así que todas las páginas se generan al pedirlas.
  await connection();
  return (
    <html lang="es" className={`${sans.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-night"
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
