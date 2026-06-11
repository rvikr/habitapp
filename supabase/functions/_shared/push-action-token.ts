// Shared HMAC action-token helpers for push notification actions.
//
// A token authorizes exactly one habit completion for one user on one local
// date, so it can ride inside a Web Push payload and be redeemed by the
// service worker without a Supabase session. Signed by web-push-reminders,
// verified by complete-habit-from-push — keep both on this module so the
// sign/verify formats cannot drift.
//
// Format: base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson, secret))

export type ActionTokenPayload = {
  /** user id (uuid) */
  u: string;
  /** habit id (uuid) */
  h: string;
  /** subscriber-local date (YYYY-MM-DD) the completion applies to */
  d: string;
  /** unix-seconds expiry */
  exp: number;
};

const encoder = new TextEncoder();

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(text: string): Uint8Array | null {
  try {
    const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signActionToken(
  payload: ActionTokenPayload,
  secret: string,
): Promise<string> {
  const json = encoder.encode(JSON.stringify(payload));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, json);
  return `${base64UrlEncode(json)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Returns the payload when the signature checks out, the token is unexpired,
// and every field has the expected shape; null otherwise. crypto.subtle.verify
// is constant-time, so callers don't need to worry about timing side channels.
export async function verifyActionToken(
  token: string,
  secret: string,
): Promise<ActionTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const payloadBytes = base64UrlDecode(parts[0]);
  const signatureBytes = base64UrlDecode(parts[1]);
  if (!payloadBytes || !signatureBytes) return null;

  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes as BufferSource,
    payloadBytes as BufferSource,
  );
  if (!valid) return null;

  let payload: ActionTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return null;
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !UUID_RE.test(payload.u ?? "") ||
    !UUID_RE.test(payload.h ?? "") ||
    !DATE_RE.test(payload.d ?? "") ||
    typeof payload.exp !== "number" ||
    payload.exp <= Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return { u: payload.u, h: payload.h, d: payload.d, exp: payload.exp };
}
