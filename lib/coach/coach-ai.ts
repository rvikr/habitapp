import type { CoachSignal } from "./coach";
import { createLimiter } from "../utils/concurrency-limiter.ts";

type CoachMessageStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type ResolveCoachMessageOptions = {
  enabled: boolean;
  invoke?: (signal: CoachSignal) => Promise<string | null | undefined>;
  storage?: CoachMessageStorage;
  now?: Date;
  ttlMs?: number;
  /** How long a cache-miss that returned the fallback is suppressed before retrying. */
  negativeTtlMs?: number;
  /** Default cooldown after a rate-limit response when no Retry-After is provided. */
  cooldownMs?: number;
  /** Return fallback immediately on cache miss; refresh the cache in background. */
  nonBlocking?: boolean;
  /**
   * When false, suppress the background refresh on a cache miss (nonBlocking
   * only) and just return the fallback. Lets a multi-habit reminder sync warm
   * only the highest-priority signals instead of bursting one call per habit.
   * Defaults to true (refresh allowed).
   */
  refresh?: boolean;
};

type CachedCoachMessage = {
  message: string;
  cachedAt: number;
  negative?: boolean;
};

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
const COOLDOWN_KEY = "habbit:coach-message:cooldown";
const inflightInvocations = new Map<string, Promise<void>>();
// Serialize background coach-message invocations so a reminder sync that touches
// many habits issues them one at a time instead of in a simultaneous burst.
const COACH_MESSAGE_CONCURRENCY = 1;
const coachInvokeLimiter = createLimiter(COACH_MESSAGE_CONCURRENCY);

export async function resolveCoachMessage(
  signal: CoachSignal,
  options: ResolveCoachMessageOptions,
): Promise<string> {
  if (!options.enabled) return signal.message;

  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const negativeTtlMs = options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const key = coachMessageCacheKey(signal);
  const storage = options.storage ?? (await defaultStorage());

  const cached = await readCachedMessage(storage, key, now, ttlMs, negativeTtlMs);
  if (cached) return cached;

  // A recent rate-limit (per-user AI quota) suppresses all coach-message calls
  // until the cooldown expires, so repeated reminder syncs don't churn quota.
  if (await isCoolingDown(storage, now)) return signal.message;

  const invoke = options.invoke ?? invokeCoachMessage;

  if (options.nonBlocking) {
    // Cache miss with refresh suppressed (fan-out cap): return the deterministic
    // fallback without launching a background invocation.
    if (options.refresh === false) return signal.message;
    if (!inflightInvocations.has(key)) {
      const promise = (async () => {
        try {
          const generated = (await coachInvokeLimiter(() => invoke(signal)))?.trim();
          if (generated) await writePositive(storage, key, generated, now);
          else await writeNegative(storage, key, signal.message, now);
        } catch (error) {
          await handleFailure(storage, error, key, signal.message, now, cooldownMs);
        } finally {
          inflightInvocations.delete(key);
        }
      })();
      inflightInvocations.set(key, promise);
    }
    return signal.message;
  }

  try {
    const generated = (await invoke(signal))?.trim();
    if (!generated) {
      await writeNegative(storage, key, signal.message, now);
      return signal.message;
    }
    await writePositive(storage, key, generated, now);
    return generated;
  } catch (error) {
    await handleFailure(storage, error, key, signal.message, now, cooldownMs);
    return signal.message;
  }
}

export function coachMessageCacheKey(
  signal: Pick<CoachSignal, "kind" | "habitId" | "tone" | "suggestedValue">,
): string {
  return `habbit:coach-message:${signal.kind}:${signal.habitId}:${signal.tone}:${signal.suggestedValue ?? ""}`;
}

async function readCachedMessage(
  storage: CoachMessageStorage | undefined,
  key: string,
  now: Date,
  ttlMs: number,
  negativeTtlMs: number,
): Promise<string | null> {
  if (!storage) return null;
  const raw = await storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedCoachMessage;
    if (typeof parsed.message !== "string" || typeof parsed.cachedAt !== "number") return null;
    const maxAge = parsed.negative ? negativeTtlMs : ttlMs;
    if (now.getTime() - parsed.cachedAt > maxAge) return null;
    return parsed.message;
  } catch {
    return null;
  }
}

async function writePositive(
  storage: CoachMessageStorage | undefined,
  key: string,
  message: string,
  now: Date,
): Promise<void> {
  await storage?.setItem(key, JSON.stringify({ message, cachedAt: now.getTime() }));
}

async function writeNegative(
  storage: CoachMessageStorage | undefined,
  key: string,
  fallback: string,
  now: Date,
): Promise<void> {
  await storage?.setItem(
    key,
    JSON.stringify({ message: fallback, cachedAt: now.getTime(), negative: true }),
  );
}

async function handleFailure(
  storage: CoachMessageStorage | undefined,
  error: unknown,
  key: string,
  fallback: string,
  now: Date,
  cooldownMs: number,
): Promise<void> {
  if (isRateLimited(error)) {
    const retryAfterMs = await retryAfterMsFromRateLimit(error);
    await writeCooldown(storage, now, retryAfterMs ?? cooldownMs);
    return;
  }
  await writeNegative(storage, key, fallback, now);
}

async function isCoolingDown(
  storage: CoachMessageStorage | undefined,
  now: Date,
): Promise<boolean> {
  if (!storage) return false;
  const raw = await storage.getItem(COOLDOWN_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { retryAt?: unknown };
    if (typeof parsed.retryAt !== "number") return false;
    if (now.getTime() < parsed.retryAt) return true;
    await storage.removeItem?.(COOLDOWN_KEY);
    return false;
  } catch {
    return false;
  }
}

async function writeCooldown(
  storage: CoachMessageStorage | undefined,
  now: Date,
  cooldownMs: number,
): Promise<void> {
  await storage?.setItem(COOLDOWN_KEY, JSON.stringify({ retryAt: now.getTime() + cooldownMs }));
}

function isRateLimited(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const context = error.context;
  if (isRecord(context) && context.status === 429) return true;
  return error.status === 429;
}

async function retryAfterMsFromRateLimit(error: unknown): Promise<number | null> {
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

async function defaultStorage(): Promise<CoachMessageStorage | undefined> {
  try {
    return await import("../platform/storage");
  } catch {
    return undefined;
  }
}

async function invokeCoachMessage(signal: CoachSignal): Promise<string | null> {
  const { supabase, isSupabaseConfigured } = await import("../supabase/client");
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.functions.invoke<{ message?: string }>("coach-message", {
    body: {
      signal: {
        kind: signal.kind,
        habitName: signal.habitName,
        tone: signal.tone,
        suggestedValue: signal.suggestedValue ?? null,
        unit: signal.unit ?? null,
        progressPct: signal.progressPct ?? null,
        fallbackMessage: signal.message,
      },
    },
  });
  if (error) throw error;
  return typeof data?.message === "string" ? data.message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
