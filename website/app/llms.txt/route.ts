import { getAllPosts } from "@/lib/blog";
import { MARKETING_PAGES, PLAY_STORE_URL, SITE_URL } from "@/lib/site";

// llms.txt (https://llmstxt.org): a curated map of the site for AI assistants.
// Composed from the same registries as sitemap.ts so it never drifts; rendered
// once at build time.
export const dynamic = "force-static";

const POLICY_PATHS = new Set(["/privacy", "/terms", "/account-deletion"]);

function line(title: string, url: string, description: string): string {
  return `- [${title}](${url}): ${description}`;
}

export async function GET() {
  const posts = await getAllPosts();

  const productPages = MARKETING_PAGES.filter((p) => !POLICY_PATHS.has(p.path));
  const policyPages = MARKETING_PAGES.filter((p) => POLICY_PATHS.has(p.path));

  const body = [
    "# Lagan",
    "",
    "> Lagan is an AI habit tracker for the web and Android (native iOS coming soon). It helps people build daily routines with habit tracking, schedule-aware streaks, XP and badges, calm reminders, and an AI coach that reads completion patterns and suggests the next small improvement.",
    "",
    `The core tracker is free. The full web app runs in any modern browser at ${SITE_URL}/app, and the Android app is on Google Play. Advanced AI coaching features are part of the Lagan Pro subscription.`,
    "",
    "## Product",
    "",
    ...productPages.map((p) =>
      line(p.title, p.path === "/" ? `${SITE_URL}/` : `${SITE_URL}${p.path}`, p.description),
    ),
    line("Lagan web app", `${SITE_URL}/app`, "The full Lagan app in the browser (account required)."),
    line("Lagan on Google Play", PLAY_STORE_URL, "The Android app listing."),
    "",
    "## Guides",
    "",
    ...posts.map((post) => line(post.title, `${SITE_URL}/blog/${post.slug}`, post.description)),
    "",
    "## Policies",
    "",
    ...policyPages.map((p) => line(p.title, `${SITE_URL}${p.path}`, p.description)),
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
