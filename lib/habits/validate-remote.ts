import type {
  HabitValidationCategory,
  HabitValidationInput,
  HabitValidationResult,
  HabitValidationStatus,
} from "./validate";

const VALID_STATUSES: HabitValidationStatus[] = ["ok", "warn", "block"];
const VALID_CATEGORIES: HabitValidationCategory[] = ["policy", "unhealthy", "impossible"];

// Definitive Gemini verdicts are stable for identical input, so re-saving an
// unchanged habit should not spend another edge-function (and Gemini) call.
const RESULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RESULT_CACHE_MAX_ENTRIES = 50;
// After a provider failure, suppress remote validation briefly so repeated
// saves during an outage fail open immediately instead of re-hitting Gemini
// (each edge-function call consumes the user's AI quota before Gemini runs).
const FAILURE_COOLDOWN_MS = 2 * 60 * 1000;

type CachedValidation = { result: HabitValidationResult; cachedAt: number };

type ValidateHabitRemoteOptions = {
  invoke?: (input: HabitValidationInput) => Promise<unknown>;
  now?: Date;
  enabled?: boolean;
};

const resultCache = new Map<string, CachedValidation>();
let failureCooldownUntil = 0;

export function clearHabitValidationRemoteState(): void {
  resultCache.clear();
  failureCooldownUntil = 0;
}

function validationFingerprint(input: HabitValidationInput): string {
  return JSON.stringify([
    input.name,
    input.description,
    input.unit,
    input.target,
    input.habitType,
    input.metricType,
  ]);
}

function failOpen(
  source: "gemini" | "gemini_unavailable" = "gemini_unavailable",
): HabitValidationResult {
  return { status: "ok", category: null, message: null, suggestion: null, source };
}

function parseRemoteResult(payload: unknown): HabitValidationResult {
  if (typeof payload !== "object" || payload === null) return failOpen();
  const raw = payload as Record<string, unknown>;

  // The edge function tags genuine Gemini verdicts "gemini" and its own
  // fail-open responses (outage, quota, missing key) "gemini_unavailable";
  // only the former are stable enough to cache.
  const source: HabitValidationResult["source"] =
    raw.source === "gemini" ? "gemini" : "gemini_unavailable";

  const status =
    typeof raw.status === "string" && VALID_STATUSES.includes(raw.status as HabitValidationStatus)
      ? (raw.status as HabitValidationStatus)
      : "ok";
  if (status === "ok") return failOpen(source);

  const category =
    typeof raw.category === "string" &&
    VALID_CATEGORIES.includes(raw.category as HabitValidationCategory)
      ? (raw.category as HabitValidationCategory)
      : null;
  const message =
    typeof raw.message === "string" && raw.message.trim().length > 0
      ? raw.message.trim().slice(0, 240)
      : null;

  let suggestion: HabitValidationResult["suggestion"] = null;
  if (typeof raw.suggestion === "object" && raw.suggestion !== null) {
    const s = raw.suggestion as Record<string, unknown>;
    const next: HabitValidationResult["suggestion"] = {};
    if (typeof s.target === "number" && Number.isFinite(s.target) && s.target > 0)
      next.target = s.target;
    if (typeof s.unit === "string" && s.unit.trim().length > 0)
      next.unit = s.unit.trim().slice(0, 16);
    if (typeof s.name === "string" && s.name.trim().length > 0)
      next.name = s.name.trim().slice(0, 80);
    if (Object.keys(next).length > 0) suggestion = next;
  }

  return { status, category, message, suggestion, source };
}

function writeCachedResult(key: string, result: HabitValidationResult, now: number): void {
  if (resultCache.size >= RESULT_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
  resultCache.set(key, { result, cachedAt: now });
}

export async function validateHabitRemote(
  input: HabitValidationInput,
  options: ValidateHabitRemoteOptions = {},
): Promise<HabitValidationResult> {
  if (options.enabled === false) return failOpen();
  const now = (options.now ?? new Date()).getTime();
  const key = validationFingerprint(input);

  const cached = resultCache.get(key);
  if (cached) {
    if (now - cached.cachedAt < RESULT_CACHE_TTL_MS) return cached.result;
    resultCache.delete(key);
  }

  if (now < failureCooldownUntil) return failOpen();

  try {
    const invoke = options.invoke ?? invokeValidateHabit;
    const result = parseRemoteResult(await invoke(input));
    if (result.source === "gemini") writeCachedResult(key, result, now);
    else failureCooldownUntil = now + FAILURE_COOLDOWN_MS;
    return result;
  } catch {
    failureCooldownUntil = now + FAILURE_COOLDOWN_MS;
    return failOpen();
  }
}

async function invokeValidateHabit(input: HabitValidationInput): Promise<unknown> {
  const { supabase } = await import("../supabase/client");
  const { data, error } = await supabase.functions.invoke("validate-habit", {
    body: {
      habit: {
        name: input.name,
        description: input.description,
        unit: input.unit,
        target: input.target,
        habitType: input.habitType,
        metricType: input.metricType,
      },
    },
  });
  if (error) throw error;
  return data;
}
