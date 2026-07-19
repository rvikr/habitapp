import fs from "fs";
import path from "path";

/**
 * Blog content lives in content/blog/<slug>.mdx. Each post exports
 * `export const meta = { ... }` matching PostMeta. tsc does not type-check
 * .mdx files, so assertMeta validates at build time — a bad post fails
 * `next build` (and CI) instead of shipping broken metadata.
 */
export type PostMeta = {
  title: string;
  description: string;
  /** ISO dates (YYYY-MM-DD). */
  datePublished: string;
  dateModified?: string;
  tags: string[];
};

export type Post = PostMeta & { slug: string };

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertMeta(slug: string, meta: unknown): PostMeta {
  const m = meta as Partial<PostMeta> | undefined;
  const fail = (why: string): never => {
    throw new Error(`content/blog/${slug}.mdx has invalid meta: ${why}`);
  };
  if (!m || typeof m !== "object") fail("missing `export const meta`");
  if (typeof m!.title !== "string" || !m!.title) fail("`title` must be a non-empty string");
  if (typeof m!.description !== "string" || !m!.description) {
    fail("`description` must be a non-empty string");
  }
  if (typeof m!.datePublished !== "string" || !ISO_DATE.test(m!.datePublished)) {
    fail("`datePublished` must be an ISO date (YYYY-MM-DD)");
  }
  if (m!.dateModified !== undefined && !ISO_DATE.test(m!.dateModified as string)) {
    fail("`dateModified` must be an ISO date (YYYY-MM-DD)");
  }
  if (!Array.isArray(m!.tags) || m!.tags.some((t) => typeof t !== "string")) {
    fail("`tags` must be an array of strings");
  }
  return m as PostMeta;
}

export function getPostSlugs(): string[] {
  return fs
    .readdirSync(BLOG_DIR)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/\.mdx$/, ""));
}

/** All posts, newest first. Build-time only (pages using this are static). */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await Promise.all(
    getPostSlugs().map(async (slug) => {
      const mod = await import(`@/content/blog/${slug}.mdx`);
      return { slug, ...assertMeta(slug, mod.meta) };
    }),
  );
  return posts.sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}

export async function getPost(slug: string): Promise<Post | undefined> {
  const posts = await getAllPosts();
  return posts.find((post) => post.slug === slug);
}
