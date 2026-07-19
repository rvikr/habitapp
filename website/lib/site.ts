/** Single source of truth for site identity — used by metadata, JSON-LD, robots, and sitemap. */
export const SITE_URL = "https://lagan.health";

export const WEB_APP_URL = "/app";

/**
 * Public Google Play listing for the Android app. Linked from the landing CTAs
 * and the launch promo. Ensure the listing is in open testing or production
 * before advertising — a closed-testing listing 404s for non-testers.
 */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=health.lagan.app";

/**
 * Official Instagram profile. Shown in the footer and used for the
 * Organization JSON-LD `sameAs`. The handle is rendered in the UI; the URL is
 * the canonical (lowercase) profile link.
 */
export const INSTAGRAM_URL = "https://www.instagram.com/lagan.health/";
export const INSTAGRAM_HANDLE = "@lagan.health";

/** Brand profiles for Organization JSON-LD `sameAs`. */
export const SOCIAL_PROFILE_URLS: string[] = [INSTAGRAM_URL];

/** Google Search Console "HTML tag" token; leave empty when verifying via DNS instead. */
export const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";

/**
 * AI crawlers explicitly allowed in robots.txt — both training crawlers and
 * answer-engine/search bots, so Lagan stays visible in AI assistants and AI
 * search results. A bot matching a named robots group ignores the `*` group
 * entirely, so robots.ts must repeat the disallow list for this group.
 */
export const AI_CRAWLER_USER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Amazonbot",
  "CCBot",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
];

export type MarketingPage = {
  path: string;
  title: string;
  description: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
};

/**
 * Indexable marketing pages — the single registry behind sitemap.xml and
 * llms.txt. Add new public pages here so both stay in sync. Paths are
 * slashless (middleware 308s trailing-slash URLs to the slashless form).
 */
export const MARKETING_PAGES: MarketingPage[] = [
  {
    path: "/",
    title: "Lagan — AI Habit Tracker & Coach",
    description:
      "AI habit tracker for the web and Android: build routines, track streaks, and get AI coaching.",
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/faq",
    title: "FAQ",
    description: "Answers to common questions about Lagan — platforms, pricing, AI coaching, and privacy.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/about",
    title: "About Lagan",
    description: "What Lagan is, how the AI coaching works, and where the product is headed.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/blog",
    title: "Blog",
    description: "Guides on building habits that stick, from the team behind Lagan.",
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description: "How Lagan collects, uses, shares, and protects personal data.",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "The terms that govern use of Lagan.",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/account-deletion",
    title: "Account Deletion",
    description: "How to delete a Lagan account and associated data.",
    changeFrequency: "yearly",
    priority: 0.2,
  },
];
