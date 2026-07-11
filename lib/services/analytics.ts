// Analytics wrapper. Lazy-loads PostHog so the app boots without the package
// installed during early development. Add EXPO_PUBLIC_POSTHOG_KEY to .env.local
// to enable, and optionally EXPO_PUBLIC_POSTHOG_HOST (defaults to PostHog cloud).
//
// Events: prefer past-tense verbs ("habit_completed", "signed_in", "habit_created").
// Events must not include personal data.

import {
  buildActivationAnalyticsEvent,
  isSupabaseUuid,
  type ActivationAnalyticsContext,
  type ActivationAnalyticsEventName,
} from "../activation/analytics";
import { createAnalyticsBuffer } from "./analytics-buffer";

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
export const ANALYTICS_OPT_OUT_KEY = "habbit:analytics-opt-out";

let initialized = false;
type PostHogClient = {
  capture: (event: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
};
let client: PostHogClient | null = null;
let optedOut = false;
const analyticsBuffer = createAnalyticsBuffer(50);

export async function initAnalytics(): Promise<void> {
  optedOut = await readOptOut();
  if (!KEY || optedOut) analyticsBuffer.clearEvents();
  if (initialized || !KEY || optedOut || __DEV__) return;
  try {
    const mod = await import("posthog-react-native");
    if (optedOut) {
      analyticsBuffer.clearEvents();
      return;
    }
    const { PostHog } = mod;
    client = new PostHog(KEY, {
      host: HOST,
      // The SDK otherwise includes the initial URL in Application Opened.
      // Auth callbacks can contain short-lived codes, so all lifecycle events
      // are explicit and sanitized instead.
      captureAppLifecycleEvents: false,
    }) as unknown as PostHogClient;
    initialized = true;
    const identity = analyticsBuffer.identity();
    if (identity) client.identify(identity);
    for (const buffered of analyticsBuffer.drain()) {
      client.capture(buffered.event, buffered.properties);
    }
  } catch (e) {
    if (__DEV__) console.warn("Analytics init skipped:", e);
  }
}

export function track(event: string, properties?: Record<string, unknown>): void {
  if (__DEV__) console.log("[track]", event, properties);
  if (__DEV__ || optedOut || !KEY) return;
  if (initialized && client) {
    client.capture(event, properties);
    return;
  }
  analyticsBuffer.enqueue(event, properties);
}

export function trackActivationEvent(
  name: ActivationAnalyticsEventName,
  context: ActivationAnalyticsContext,
  candidateProperties: Record<string, unknown> = {},
): void {
  const event = buildActivationAnalyticsEvent(name, context, candidateProperties);
  track(event.name, event.properties);
}

export function identifyAnalytics(userId: string): void {
  if (!isSupabaseUuid(userId)) return;
  analyticsBuffer.identify(userId);
  if (__DEV__ || optedOut || !KEY || !initialized || !client) return;
  client.identify(userId);
}

export function resetAnalytics(): void {
  analyticsBuffer.reset();
  if (initialized && client) client.reset();
}

export async function isAnalyticsOptedOut(): Promise<boolean> {
  optedOut = await readOptOut();
  return optedOut;
}

export async function setAnalyticsOptOut(next: boolean): Promise<void> {
  const currentIdentity = analyticsBuffer.identity();
  optedOut = next;
  const { setItem } = await import("../platform/storage");
  await setItem(ANALYTICS_OPT_OUT_KEY, String(next));
  if (next) {
    resetAnalytics();
    // Keep only the UUID in memory so opting back in during this signed-in
    // session can restore attribution without writing any events while opted out.
    if (currentIdentity) analyticsBuffer.identify(currentIdentity);
  } else {
    await initAnalytics();
    if (currentIdentity) identifyAnalytics(currentIdentity);
  }
}

async function readOptOut(): Promise<boolean> {
  const { getItem } = await import("../platform/storage");
  return (await getItem(ANALYTICS_OPT_OUT_KEY)) === "true";
}
