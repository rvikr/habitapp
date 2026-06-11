// Service worker for Lagan PWA at /app/
// Handles Web Push notifications and offline app-shell caching.
//
// Hard rules learned from production:
// 1. NEVER serve a redirected response for a navigation request — iOS Safari
//    kills the launch with "response served by service worker has
//    redirections". Upstream layers (Next.js trailing-slash 308, nginx
//    try_files 301) can introduce redirects at any time, so every response we
//    hand to respondWith() or cache.put() is stripped of its redirect flag.
// 2. The app shell (HTML) must be network-first. It references content-hashed
//    bundles that disappear from the server on each deploy; serving a stale
//    cached shell bricks the app until the cache is purged.

const CACHE_NAME = "lagan-shell-v2";
const SHELL_URL = "/app/";
const PRECACHE_URLS = [SHELL_URL, "/app/manifest.webmanifest", "/app/icon-192.png"];

// Rebuilds a response so `redirected` is false and it is safe for navigations
// and for caching. Bodies are small (HTML/JSON/icons), so buffering is fine.
async function cleanResponse(response) {
  if (!response.redirected) return response;
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function fetchAndClean(request) {
  const response = await fetch(request);
  return cleanResponse(response);
}

async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        // cache: "reload" bypasses the HTTP cache so a fresh shell is stored.
        const response = await fetchAndClean(new Request(url, { cache: "reload" }));
        if (response.ok) await cache.put(url, response);
      } catch {
        // Precaching is best effort; runtime caching fills the gaps.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Prune caches from older SW versions (including the v1 cache that could
  // hold a poisoned redirected copy of the shell).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Network-first for navigations: always try the fresh shell, fall back to the
// cached copy when offline. Successful fetches refresh the cached shell.
async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetchAndClean(request);
    if (response.ok) {
      // Single-page app: every in-scope navigation serves the same shell, so
      // cache it under one key for the offline fallback.
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(SHELL_URL);
    if (cached) return cleanResponse(cached);
    throw new Error("offline and no cached shell");
  }
}

// Cache-first for content-hashed immutable bundles; they never change at the
// same URL, and caching them is what makes offline launches work.
async function handleImmutableAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cleanResponse(cached);
  const response = await fetchAndClean(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Stale-while-revalidate for the small set of precached static files
// (manifest, icons): serve fast, refresh in the background.
async function handlePrecachedStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetchAndClean(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  if (cached) {
    return cleanResponse(cached);
  }
  const fresh = await refresh;
  if (fresh) return fresh;
  throw new Error("offline and not cached");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname.startsWith("/app/_expo/static/") || url.pathname.startsWith("/app/assets/")) {
    event.respondWith(handleImmutableAsset(request));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(handlePrecachedStatic(request));
    return;
  }

  // Everything else (API calls, sw.js itself, cross-cutting requests) goes
  // straight to the network with default browser semantics.
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
