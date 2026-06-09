// Shared Gemini generateContent caller with a bounded timeout and a single
// retry on transient failures (429/500/503/abort). On a 429 the retry waits the
// server-requested delay (the Retry-After header or RetryInfo.retryDelay in the
// body) when present, otherwise an exponential full-jitter backoff. Honoring the
// server delay and adding jitter de-synchronizes retries, so a burst of
// rate-limited callers no longer retries in lockstep and re-trips the limit.
// Never throws: on timeout, network error, or exhausted retries it resolves to a
// synthetic non-ok Response so callers' existing `if (!response.ok)` fallback
// paths run.
//
// The app-level AI quota is consumed once per user request before this call,
// so the retry costs no extra quota.

// Read env defensively so this module can also be imported by the Node test
// runner (where `Deno` is undefined); in the Deno edge runtime it resolves env.
const env = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } }).Deno?.env;
const DEFAULT_TIMEOUT_MS = Number(env?.get("GEMINI_TIMEOUT_MS") ?? 10000);
// Cap how long we'll honor a server-requested retry delay so the retry still
// fits inside the function's wall-clock budget.
const MAX_RETRY_DELAY_MS = Number(env?.get("GEMINI_MAX_RETRY_DELAY_MS") ?? 8000);
const BASE_BACKOFF_MS = 400;
const MAX_RETRIES = 1;
const RETRYABLE_STATUS = new Set([429, 500, 503]);

function backoffMs(attempt: number): number {
  // Exponential backoff with full jitter, capped at MAX_RETRY_DELAY_MS.
  const ceiling = Math.min(MAX_RETRY_DELAY_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutResponse(name: string): Response {
  return new Response(JSON.stringify({ error: name }), {
    status: 504,
    headers: { "Content-Type": "application/json" },
  });
}

// Pure extraction of a server-requested retry delay (ms) from a 429's
// Retry-After header value and/or JSON error body. The header (seconds) takes
// precedence; otherwise the first RetryInfo `retryDelay` (e.g. "3s" or "1.5s")
// in `error.details[]` is used. Tolerates a missing header and a non-JSON body
// by returning null, so callers fall back to jittered backoff. Exported for tests.
export function parseRetryDelayMs(headerValue: string | null, bodyText: string | null): number | null {
  if (headerValue != null) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
    }
  }
  if (bodyText != null) {
    try {
      const details = (JSON.parse(bodyText) as { error?: { details?: unknown } })?.error?.details;
      if (Array.isArray(details)) {
        for (const detail of details) {
          const retryDelay = (detail as { retryDelay?: unknown })?.retryDelay;
          if (typeof retryDelay === "string") {
            const seconds = Number(retryDelay.replace(/s$/, ""));
            if (Number.isFinite(seconds) && seconds > 0) {
              return Math.min(MAX_RETRY_DELAY_MS, Math.ceil(seconds * 1000));
            }
          }
        }
      }
    } catch {
      // Non-JSON body (e.g. a plain "rate limited" string): no server delay.
    }
  }
  return null;
}

async function retryDelayMsFrom(response: Response): Promise<number | null> {
  const header = response.headers.get("Retry-After");
  let bodyText: string | null = null;
  try {
    bodyText = await response.text();
  } catch {
    bodyText = null;
  }
  return parseRetryDelayMs(header, bodyText);
}

export async function generateContent(
  model: string,
  apiKey: string,
  payload: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const init: RequestInit = {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  };

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= MAX_RETRIES) {
        return timeoutResponse(error instanceof Error ? error.name : "fetch_failed");
      }
      // Abort/network error with attempts remaining: back off, then retry.
      await sleep(backoffMs(attempt));
      continue;
    }
    clearTimeout(timer);

    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt >= MAX_RETRIES) {
      return response;
    }

    // Retryable status with attempts remaining. On a 429, honor the server's
    // requested delay when present; otherwise (and for 500/503) back off with
    // exponential full jitter. Reading the body also drains it before retrying.
    const serverDelay = response.status === 429 ? await retryDelayMsFrom(response) : null;
    await response.body?.cancel().catch(() => {});
    await sleep(serverDelay ?? backoffMs(attempt));
  }
}
