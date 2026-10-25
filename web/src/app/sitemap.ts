import type { MetadataRoute } from "next";

import { serverEnv } from "@/lib/env";

// La URL pública se lee al servir, no al compilar.
export const dynamic = "force-dynamic";

const PAGES = ["/", "/prediccion", "/asistente", "/metodologia"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const site = serverEnv().TFFLOW_SITE_URL;
  return PAGES.map((path) => ({ url: new URL(path, site).toString() }));
}
