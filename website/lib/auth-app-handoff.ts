export const APP_EMAIL_OTP_TYPES = ["signup", "recovery"] as const;

export type AppEmailOtpType = (typeof APP_EMAIL_OTP_TYPES)[number];

export const NATIVE_AUTH_CALLBACK_URL = "lagan://auth/callback";
export const PWA_AUTH_CALLBACK_URL = "https://lagan.health/app/auth/callback";

export type AppHandoff =
  | { kind: "native"; deepLink: string; redirectTo: string }
  | { kind: "pwa"; url: string };

export function isAppEmailOtpType(value: string | null): value is AppEmailOtpType {
  return APP_EMAIL_OTP_TYPES.includes(value as AppEmailOtpType);
}

/**
 * URLSearchParams normally removes the template's encoding layer. Some mailers
 * preserve one additional layer, so tolerate exactly one full-value decode.
 * Values that are still not URLs after that are rejected by the resolver.
 */
export function normalizeRedirectTo(raw: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (looksLikeCallbackUrl(value)) return value;

  try {
    const decoded = decodeURIComponent(value);
    return decoded !== value && looksLikeCallbackUrl(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function resolveAppHandoff(
  rawRedirectTo: string | null,
  tokenHash: string,
  type: AppEmailOtpType,
): AppHandoff | null {
  const redirectTo = normalizeRedirectTo(rawRedirectTo);
  if (!redirectTo || !tokenHash) return null;

  let parsed: URL;
  try {
    parsed = new URL(redirectTo);
  } catch {
    return null;
  }

  if (!hasSafeUrlShape(parsed) || !hasAllowedSourceParams(parsed, type)) return null;

  if (
    parsed.protocol === "lagan:" &&
    parsed.hostname === "auth" &&
    parsed.pathname === "/callback"
  ) {
    return {
      kind: "native",
      deepLink: buildCallbackUrl(NATIVE_AUTH_CALLBACK_URL, tokenHash, type),
      redirectTo: canonicalSourceUrl(NATIVE_AUTH_CALLBACK_URL, type),
    };
  }

  if (
    parsed.protocol === "https:" &&
    parsed.hostname === "lagan.health" &&
    parsed.pathname === "/app/auth/callback"
  ) {
    return { kind: "pwa", url: buildPwaHandoffUrl(tokenHash, type) };
  }

  return null;
}

export function buildPwaHandoffUrl(tokenHash: string, type: AppEmailOtpType): string {
  return buildCallbackUrl(PWA_AUTH_CALLBACK_URL, tokenHash, type);
}

function looksLikeCallbackUrl(value: string): boolean {
  return value.startsWith("lagan://") || value.startsWith("https://");
}

function hasSafeUrlShape(url: URL): boolean {
  return !url.username && !url.password && !url.port && !url.hash;
}

function hasAllowedSourceParams(url: URL, type: AppEmailOtpType): boolean {
  const entries = [...url.searchParams.entries()];
  if (entries.length === 0) return true;
  return entries.length === 1 && entries[0][0] === "type" && entries[0][1] === type;
}

function canonicalSourceUrl(base: string, type: AppEmailOtpType): string {
  const url = new URL(base);
  if (type === "recovery") url.searchParams.set("type", type);
  return url.toString();
}

function buildCallbackUrl(base: string, tokenHash: string, type: AppEmailOtpType): string {
  const url = new URL(base);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", type);
  return url.toString();
}
