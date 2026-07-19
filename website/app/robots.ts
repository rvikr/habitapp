import type { MetadataRoute } from "next";
import { AI_CRAWLER_USER_AGENTS, SITE_URL } from "@/lib/site";

// Paths never meant for crawlers. Bots that match the named AI group below
// ignore the `*` group entirely, so both groups must carry the same list.
const DISALLOW = ["/api/", "/admin/", "/auth/", "/login"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: AI_CRAWLER_USER_AGENTS,
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
