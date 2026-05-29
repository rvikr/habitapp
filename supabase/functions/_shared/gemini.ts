// Shared Gemini generateContent caller with a bounded timeout and a single
// jittered retry on transient failures (429/500/503/abort). Never throws: on
// timeout, network error, or exhausted retries it resolves to a synthetic
// non-ok Response so callers' existing `if (!response.ok)` fallback paths run.
//
// The app-level AI quota is consumed once per user request before this call,
// so the retry costs no extra quota.

// Read env defensively so this module can also be imported by the Node test
// runner (where `Deno` is undefined); in the Deno edge runtime it resolves env.
const envTimeout = (globalThis as { Deno?: { env?: { get(key: string): string | undefined } } })
  .Deno?.env?.get("GEMINI_TIMEOUT_MS");
const DEFAULT_TIMEOUT_MS = Number(envTimeout ?? 10000);
const MAX_RETRIES = 1;
const RETRYABLE_STATUS = new Set([429, 500, 503]);

function backoffMs(): number {
  // ~300-800ms jittered
  return 300 + Math.floor(Math.random() * 500);
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
    if (attempt > 0) await sleep(backoffMs());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt >= MAX_RETRIES) {
        return response;
      }
      // Retryable status with attempts remaining: drain body, then retry.
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      if (attempt >= MAX_RETRIES) {
        return timeoutResponse(error instanceof Error ? error.name : "fetch_failed");
      }
      // Abort/network error with attempts remaining: fall through to retry.
    } finally {
      clearTimeout(timer);
    }
  }
}
