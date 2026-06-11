// Service worker for Lagan PWA at /app/
// Handles Web Push notifications and minimal offline app-shell caching.

const CACHE_NAME = "lagan-shell-v1";
const APP_SHELL = ["/app/", "/app/manifest.webmanifest", "/app/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  // Prune caches from older SW versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // Only cache-first for same-origin GET requests; pass everything else through.
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => cached ?? fetch(request)),
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Lagan", body: "Time to check in on your habits" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}

  const options = {
    body: data.body,
    icon: "/app/icon-192.png",
    badge: "/app/icon-192.png",
    data: {
      url: data.url ?? "/app/",
      habitId: data.habitId ?? null,
      completeToken: data.completeToken ?? null,
      completeUrl: data.completeUrl ?? null,
    },
    requireInteraction: false,
  };

  // Single-habit payloads carry a signed completion token; only those get the
  // action button. Old-format payloads and bundles degrade to plain tap-to-open.
  // iOS/macOS Safari ignores `actions` entirely — tap behavior is unchanged there.
  if (data.completeToken && data.completeUrl) {
    options.actions = [{ action: "complete", title: "Mark done" }];
  }

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Redeems the "Mark done" token without opening a window, then swaps the
// notification for a confirmation (or a tap-to-open fallback on failure).
async function completeFromNotification(data) {
  const ackOptions = {
    icon: "/app/icon-192.png",
    badge: "/app/icon-192.png",
    tag: "habit-complete-ack",
    // No completeToken on the ack, so it renders without a button; tapping it
    // still deep-links via the carried url.
    data: { url: data.url ?? "/app/" },
  };
  try {
    const res = await fetch(data.completeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: data.completeToken }),
    });
    if (!res.ok) throw new Error("status " + res.status);
    const body = await res.json().catch(() => ({}));
    await self.registration.showNotification(
      body.habitName ? "✓ Logged: " + body.habitName : "✓ Logged",
      { ...ackOptions, silent: true },
    );
  } catch {
    await self.registration.showNotification(
      "Couldn't log — tap to open the app",
      ackOptions,
    );
  }
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data ?? {};
  event.notification.close();

  if (event.action === "complete" && data.completeToken && data.completeUrl) {
    event.waitUntil(completeFromNotification(data));
    return;
  }

  const targetUrl = data.url ?? "/app/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin + "/app") && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
