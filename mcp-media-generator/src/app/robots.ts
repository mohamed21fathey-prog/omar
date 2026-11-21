// ============================================================
// /robots.txt — يُخدم تلقائيًا من Next (اصطلاح robots.ts)
// يسمح بالزحف لكل الصفحات العامة ويحجب الخاصة/الإدارية فقط
// ============================================================
import type { MetadataRoute } from "next";

const SITE_URL = "https://media-generator-topaz.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/account", "/episodes", "/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
