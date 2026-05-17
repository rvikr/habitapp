// Analytics wrapper. Lazy-loads PostHog so the app boots without the package
// installed during early development. Add EXPO_PUBLIC_POSTHOG_KEY to .env.local
// to enable, and optionally EXPO_PUBLIC_POSTHOG_HOST (defaults to PostHog cloud).
//
// Events: prefer past-tense verbs ("habit_completed", "signed_in", "habit_created").
// Events must not include personal data.

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
export const ANALYTICS_OPT_OUT_KEY = "habbit:analytics-opt-out";

let initialized = false;
type PostHogClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
};
let client: PostHogClient | null = null;
let optedOut = false;

export async function initAnalytics(): Promise<void> {
  optedOut = await readOptOut();
  if (initialized || !KEY || optedOut) return;
  try {
    const mod = await import("posthog-react-native");
    const { PostHog } = mod;
    client = new PostHog(KEY, { host: HOST }) as unknown as PostHogClient;
    initialized = true;
  } catch (e) {
    if (__DEV__) console.warn("Analytics init skipped:", e);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (__DEV__) console.log("[track]", event, properties);
  if (optedOut || !initialized || !client) return;
  client.capture(event, properties);
}

export function resetAnalytics(): void {
  if (!initialized || !client) return;
  client.reset();
}

export async function isAnalyticsOptedOut(): Promise<boolean> {
  optedOut = await readOptOut();
  return optedOut;
}

export async function setAnalyticsOptOut(next: boolean): Promise<void> {
  optedOut = next;
  const { setItem } = await import("../platform/storage");
  await setItem(ANALYTICS_OPT_OUT_KEY, String(next));
  if (next) resetAnalytics();
}

async function readOptOut(): Promise<boolean> {
  const { getItem } = await import("../platform/storage");
  return (await getItem(ANALYTICS_OPT_OUT_KEY)) === "true";
}
