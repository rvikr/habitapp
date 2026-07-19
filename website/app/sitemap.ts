import type { MetadataRoute } from "next";
import { getAllPosts } from "@/lib/blog";
import { MARKETING_PAGES, SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = MARKETING_PAGES.map((page) => ({
    url: page.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  const posts: MetadataRoute.Sitemap = (await getAllPosts()).map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(`${post.dateModified ?? post.datePublished}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...pages, ...posts];
}
