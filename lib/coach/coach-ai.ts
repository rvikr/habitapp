import type { CoachSignal } from "./coach";

type CoachMessageStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type ResolveCoachMessageOptions = {
  enabled: boolean;
  invoke?: (signal: CoachSignal) => Promise<string | null | undefined>;
  storage?: CoachMessageStorage;
  now?: Date;
  ttlMs?: number;
  /** Return fallback immediately on cache miss; refresh the cache in background. */
  nonBlocking?: boolean;
};

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;

export async function resolveCoachMessage(
  signal: CoachSignal,
  options: ResolveCoachMessageOptions,
): Promise<string> {
  if (!options.enabled) return signal.message;

  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const key = coachMessageCacheKey(signal);
  const storage = options.storage ?? (await defaultStorage());
  const cached = await readCachedMessage(storage, key, now, ttlMs);
  if (cached) return cached;

  if (options.nonBlocking) {
    void (async () => {
      try {
        const generated = (await (options.invoke ?? invokeCoachMessage)(signal))?.trim();
        if (generated)
          await storage?.setItem(
            key,
            JSON.stringify({ message: generated, cachedAt: now.getTime() }),
          );
      } catch {}
    })();
    return signal.message;
  }

  try {
    const generated = (await (options.invoke ?? invokeCoachMessage)(signal))?.trim();
    if (!generated) return signal.message;
    await storage?.setItem(key, JSON.stringify({ message: generated, cachedAt: now.getTime() }));
    return generated;
  } catch {
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
): Promise<string | null> {
  if (!storage) return null;
  const raw = await storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown; cachedAt?: unknown };
    if (typeof parsed.message !== "string" || typeof parsed.cachedAt !== "number") return null;
    if (now.getTime() - parsed.cachedAt > ttlMs) return null;
    return parsed.message;
  } catch {
    return null;
  }
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
