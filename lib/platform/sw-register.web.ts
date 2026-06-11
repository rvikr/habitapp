// Registers the PWA service worker once at startup, so offline support, cache
// updates after deploys, and push handling don't depend on the user having
// enabled notifications first (previously the only registration path).
// Registration is idempotent — repeat calls return the existing registration
// and trigger an update check for a changed sw.js.
export async function registerAppServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  // The exported app is served under /app/ in production; the dev server
  // (expo start --web) serves from the root and has no sw.js to register.
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/app")) return null;
  try {
    return await navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
  } catch {
    return null;
  }
}
