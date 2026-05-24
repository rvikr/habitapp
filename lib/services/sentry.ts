// Sentry wrapper. The init function is called once at app start (in app/_layout.tsx).
// reportError can be called from anywhere; it no-ops in development and when DSN is unset.
//
// To enable: add EXPO_PUBLIC_SENTRY_DSN to .env.local and uncomment the @sentry/react-native
// imports below. The package is intentionally lazy-loaded so the app boots without Sentry
// installed during early development.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
let initialized = false;
let SentryRef: typeof import("@sentry/react-native") | null = null;

export async function initSentry(): Promise<void> {
  if (initialized || !DSN || __DEV__) return;
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
  if (!initialized || !SentryRef) return;
  SentryRef.captureException(error, { extra: context });
}

export function setUser(user: { id?: string } | null): void {
  if (!initialized || !SentryRef) return;
  SentryRef.setUser(user);
}
