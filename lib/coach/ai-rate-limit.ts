// Shared parsing of rate-limit (HTTP 429) errors thrown by
// supabase.functions.invoke, where error.context is the raw Response. Used by
// the AI callers to apply a consistent cooldown honoring Retry-After.

export function isRateLimited(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const context = error.context;
  if (isRecord(context) && context.status === 429) return true;
  return error.status === 429;
}

export async function retryAfterMsFromRateLimit(error: unknown): Promise<number | null> {
  if (!isRecord(error)) return null;
  const context = error.context;
  if (!isRecord(context)) return null;

  const headerValue = readHeader(context.headers, "Retry-After");
  const headerSeconds = parsePositiveSeconds(headerValue);
  if (headerSeconds != null) return headerSeconds * 1000;

  const body = await readRateLimitBody(context);
  const bodySeconds = parsePositiveSeconds(body?.retryAfterSeconds);
  return bodySeconds == null ? null : bodySeconds * 1000;
}

function readHeader(headers: unknown, name: string): unknown {
  if (!isRecord(headers) || typeof headers.get !== "function") return null;
  try {
    return headers.get(name);
  } catch {
    return null;
  }
}

async function readRateLimitBody(
  context: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const clone = context.clone;
  if (typeof clone !== "function") return null;
  try {
    const cloned = clone.call(context);
    if (!isRecord(cloned) || typeof cloned.json !== "function") return null;
    const parsed = await cloned.json();
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parsePositiveSeconds(value: unknown): number | null {
  const seconds =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return seconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
