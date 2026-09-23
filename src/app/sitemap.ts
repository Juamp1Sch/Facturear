import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/registrarse`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${SITE_URL}/iniciar-sesion`, changeFrequency: "yearly", priority: 0.4 },
  ];
}
