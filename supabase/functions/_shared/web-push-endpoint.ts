const ALLOWED_WEB_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

const ALLOWED_WEB_PUSH_SUFFIXES = [".notify.windows.com"];

export function isAllowedWebPushEndpoint(endpoint: string | null | undefined): boolean {
  if (typeof endpoint !== "string") return false;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.port && url.port !== "443") return false;

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || isUnsafeEndpointHost(hostname)) return false;

  return (
    ALLOWED_WEB_PUSH_HOSTS.has(hostname) ||
    ALLOWED_WEB_PUSH_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "").replace(/^\[(.*)\]$/, "$1");
}

function isUnsafeEndpointHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  if (hostname.includes(":")) return true;
  return isUnsafeIpv4Host(hostname);
}

function isUnsafeIpv4Host(hostname: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return false;
  const parts = hostname.split(".").map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
