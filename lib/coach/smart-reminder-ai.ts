import { localDateKey } from "../utils/date.ts";
import { isRateLimited, retryAfterMsFromRateLimit } from "./ai-rate-limit.ts";
import {
  maxSmartReminderCount,
  sanitizeSmartReminderPlanTimes,
  type SmartReminderDecisionContext,
} from "./smart-reminders.ts";

type ResolveAiSmartReminderOptions = {
  enabled: boolean;
  now?: Date;
  invoke?: (contexts: SmartReminderDecisionContext[]) => Promise<unknown>;
  storage?: SmartReminderStorage;
  ttlMs?: number;
  cooldownMs?: number;
};

type AiSmartReminderPlan = {
  habitId: string;
  times: Date[];
};

type SmartReminderStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
};

type CachedSmartReminderPlans = {
  cachedAt: number;
  plans: {
    habitId: string;
    times: string[];
  }[];
};

const CACHE_PREFIX = "habbit:smart-reminders";
const CACHE_VERSION = "v1";
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
const inflightInvocations = new Map<string, Promise<Map<string, Date[]>>>();

export async function resolveAiSmartReminderPlans(
  contexts: SmartReminderDecisionContext[],
  options: ResolveAiSmartReminderOptions,
): Promise<Map<string, Date[]>> {
  const resolved = new Map<string, Date[]>();
  if (!options.enabled || contexts.length === 0) return resolved;

  const now = options.now ?? new Date();
  const ttlMs = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const storage = options.storage ?? (await defaultStorage());
  const key = smartReminderPlansCacheKey(contexts, now);
  const cached = await readCachedPlans(storage, key, contexts, now, ttlMs);
  if (cached) return cached;

  if (await isCoolingDown(storage, now)) return resolved;

  const inflight = inflightInvocations.get(key);
  if (inflight) return inflight;

  const invocation = resolveFreshAiSmartReminderPlans(contexts, {
    ...options,
    now,
    storage,
    cooldownMs,
  });
  inflightInvocations.set(key, invocation);
  try {
    return await invocation;
  } finally {
    inflightInvocations.delete(key);
  }
}

async function resolveFreshAiSmartReminderPlans(
  contexts: SmartReminderDecisionContext[],
  options: ResolveAiSmartReminderOptions & {
    now: Date;
    storage?: SmartReminderStorage;
    cooldownMs: number;
  },
): Promise<Map<string, Date[]>> {
  const resolved = new Map<string, Date[]>();

  try {
    const response = await (options.invoke ?? invokeSmartReminderPlans)(contexts);
    const plans = sanitizeAiSmartReminderPlans(response, contexts, options.now);
    for (const plan of plans) resolved.set(plan.habitId, plan.times);
    if (plans.length > 0) await writeCachedPlans(options.storage, contexts, options.now, plans);
  } catch (error) {
    if (isRateLimited(error)) {
      const retryAfterMs = await retryAfterMsFromRateLimit(error);
      await writeCooldown(options.storage, options.now, retryAfterMs ?? options.cooldownMs);
    }
    return resolved;
  }

  return resolved;
}

export function sanitizeAiSmartReminderPlans(
  input: unknown,
  contexts: SmartReminderDecisionContext[],
  now: Date,
): AiSmartReminderPlan[] {
  if (!isRecord(input) || !Array.isArray(input.plans)) return [];

  const contextById = new Map(contexts.map((context) => [context.habitId, context]));
  const plans: AiSmartReminderPlan[] = [];
  const seen = new Set<string>();

  for (const item of input.plans) {
    if (!isRecord(item) || typeof item.habitId !== "string" || seen.has(item.habitId)) continue;
    const context = contextById.get(item.habitId);
    if (!context) continue;

    const times = sanitizeSmartReminderPlanTimes(item.times, now, {
      maxCount: maxSmartReminderCount(context),
    });
    if (!times) continue;

    seen.add(item.habitId);
    plans.push({ habitId: item.habitId, times });
  }

  return plans;
}

function smartReminderPlansCacheKey(contexts: SmartReminderDecisionContext[], now: Date): string {
  const dateKey = localDateKey(now);
  const fingerprint = stableStringify(
    contexts
      .map((context) => ({
        habitId: context.habitId,
        habitName: context.habitName,
        habitType: context.habitType,
        metricType: context.metricType,
        strategy: context.strategy,
        intervalMinutes: context.intervalMinutes,
        target: context.target,
        unit: context.unit,
        progress: {
          current: context.progress.current,
          target: context.progress.target,
          ratio: Number(context.progress.ratio.toFixed(4)),
          isDone: context.progress.isDone,
        },
        completions: context.completions.slice(-14).map((completion) => ({
          completedOn: completion.completedOn,
          createdAt: completion.createdAt,
          value: completion.value,
        })),
        manualTimes: [...context.manualTimes].sort(),
        reminderDays: [...context.reminderDays].sort((a, b) => a - b),
        streak: context.streak,
        typicalHour: context.typicalHour,
      }))
      .sort((a, b) => a.habitId.localeCompare(b.habitId)),
  );

  return `${CACHE_PREFIX}:${CACHE_VERSION}:plans:${dateKey}:${hashString(fingerprint)}`;
}

async function readCachedPlans(
  storage: SmartReminderStorage | undefined,
  key: string,
  contexts: SmartReminderDecisionContext[],
  now: Date,
  ttlMs: number,
): Promise<Map<string, Date[]> | null> {
  if (!storage) return null;
  const raw = await storage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CachedSmartReminderPlans;
    if (!Array.isArray(parsed.plans) || typeof parsed.cachedAt !== "number") return null;
    if (now.getTime() - parsed.cachedAt > ttlMs) return null;

    const plans = sanitizeAiSmartReminderPlans({ plans: parsed.plans }, contexts, now);
    if (plans.length === 0) return null;

    const resolved = new Map<string, Date[]>();
    for (const plan of plans) resolved.set(plan.habitId, plan.times);
    return resolved;
  } catch {
    return null;
  }
}

async function writeCachedPlans(
  storage: SmartReminderStorage | undefined,
  contexts: SmartReminderDecisionContext[],
  now: Date,
  plans: AiSmartReminderPlan[],
): Promise<void> {
  if (!storage) return;
  const value: CachedSmartReminderPlans = {
    cachedAt: now.getTime(),
    plans: plans.map((plan) => ({
      habitId: plan.habitId,
      times: plan.times.map(timeString),
    })),
  };
  await storage.setItem(smartReminderPlansCacheKey(contexts, now), JSON.stringify(value));
}

async function isCoolingDown(
  storage: SmartReminderStorage | undefined,
  now: Date,
): Promise<boolean> {
  if (!storage) return false;
  const raw = await storage.getItem(cooldownCacheKey());
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as { retryAt?: unknown };
    if (typeof parsed.retryAt !== "number") return false;
    if (now.getTime() < parsed.retryAt) return true;
    await storage.removeItem?.(cooldownCacheKey());
    return false;
  } catch {
    return false;
  }
}

async function writeCooldown(
  storage: SmartReminderStorage | undefined,
  now: Date,
  cooldownMs: number,
): Promise<void> {
  if (!storage) return;
  await storage.setItem(
    cooldownCacheKey(),
    JSON.stringify({ retryAt: now.getTime() + cooldownMs }),
  );
}

function cooldownCacheKey(): string {
  return `${CACHE_PREFIX}:${CACHE_VERSION}:cooldown`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function defaultStorage(): Promise<SmartReminderStorage | undefined> {
  try {
    return await import("../platform/storage");
  } catch {
    return undefined;
  }
}

async function invokeSmartReminderPlans(
  contexts: SmartReminderDecisionContext[],
): Promise<unknown> {
  const { supabase, isSupabaseConfigured } = await import("../supabase/client");
  if (!isSupabaseConfigured()) return null;

  const now = contexts[0]?.now ?? new Date();
  const { data, error } = await supabase.functions.invoke("smart-reminders", {
    body: {
      date: localDateKey(now),
      contexts: contexts.map((context) => ({
        habitId: context.habitId,
        habitName: context.habitName,
        habitType: context.habitType,
        metricType: context.metricType,
        strategy: context.strategy,
        intervalMinutes: context.intervalMinutes,
        target: context.target,
        unit: context.unit,
        progress: {
          current: context.progress.current,
          target: context.progress.target,
          ratio: context.progress.ratio,
          label: context.progress.label,
        },
        completions: context.completions.slice(-14),
        manualTimes: context.manualTimes,
        reminderDays: context.reminderDays,
        streak: context.streak,
        typicalHour: context.typicalHour,
        currentTime: timeString(now),
      })),
    },
  });

  if (error) throw error;
  return data;
}

function timeString(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
