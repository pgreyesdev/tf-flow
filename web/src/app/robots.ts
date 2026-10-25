import type { MetadataRoute } from "next";

import { serverEnv } from "@/lib/env";

// La URL pública se lee al servir, no al compilar.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const site = serverEnv().TFFLOW_SITE_URL;
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", site).toString(),
  };
}
