/** Single source of truth for site identity — used by metadata, JSON-LD, robots, and sitemap. */
export const SITE_URL = "https://lagan.health";

export const WEB_APP_URL = "/app";

/**
 * Public Google Play listing for the Android app. Linked from the landing CTAs
 * and the launch promo. Ensure the listing is in open testing or production
 * before advertising — a closed-testing listing 404s for non-testers.
 */
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=health.lagan.app";

/** Brand profiles for Organization JSON-LD `sameAs`. */
export const SOCIAL_PROFILE_URLS: string[] = ["https://www.instagram.com/lagan.health/"];

/** Google Search Console "HTML tag" token; leave empty when verifying via DNS instead. */
export const GOOGLE_SITE_VERIFICATION = "";
