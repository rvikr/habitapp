// Sentry wrapper. The init function is called once at app start (in app/_layout.tsx).
// reportError can be called from anywhere; it no-ops in development and when DSN is unset.
//
// To enable: add EXPO_PUBLIC_SENTRY_DSN to .env.local and uncomment the @sentry/react-native
// imports below. The package is intentionally lazy-loaded so the app boots without Sentry
// installed during early development.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const SENTRY_OPT_OUT_KEY = "habbit:sentry-opt-out";

let initialized = false;
let SentryRef: typeof import("@sentry/react-native") | null = null;
let optedOut = false;

export async function initSentry(): Promise<void> {
  optedOut = await readOptOut();
  if (initialized || !DSN || optedOut || __DEV__) return;
  try {
    SentryRef = await import("@sentry/react-native");
    SentryRef.init({
      dsn: DSN,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0.05,
      debug: false,
    });
    initialized = true;
  } catch (e) {
    if (__DEV__) console.warn("Sentry init skipped:", e);
  }
}

export function reportError(error: Error, context?: Record<string, unknown>): void {
  if (__DEV__) console.error("[error]", error, context);
  if (optedOut || !initialized || !SentryRef) return;
  SentryRef.captureException(error, { extra: context });
}

export function setUser(user: { id?: string } | null): void {
  if (optedOut || !initialized || !SentryRef) return;
  SentryRef.setUser(user);
}

export async function isSentryOptedOut(): Promise<boolean> {
  optedOut = await readOptOut();
  return optedOut;
}

export async function setSentryOptOut(next: boolean): Promise<void> {
  optedOut = next;
  const { setItem } = await import("../platform/storage");
  await setItem(SENTRY_OPT_OUT_KEY, String(next));
  if (next) {
    SentryRef?.setUser(null);
    await SentryRef?.close();
    initialized = false;
    return;
  }
  await initSentry();
}

async function readOptOut(): Promise<boolean> {
  const { getItem } = await import("../platform/storage");
  return (await getItem(SENTRY_OPT_OUT_KEY)) === "true";
}
