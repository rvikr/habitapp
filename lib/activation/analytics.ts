import type { ActivationStage, ActivationVariant } from "./contracts.ts";

export type ActivationAnalyticsVariant = ActivationVariant | "unassigned";
export type ActivationAnalyticsStage = ActivationStage | "unassigned";

export type ActivationAnalyticsContext = {
  variant: ActivationAnalyticsVariant;
  bucket: number | null;
  rolloutPercentage: number | null;
  stage: ActivationAnalyticsStage;
  platform: string;
};

export type ActivationAnalyticsEventName =
  | "activation_exposed"
  | "signup_mode_opened"
  | "signup_submitted"
  | "signup_confirmed"
  | "activation_entry"
  | "routine_started"
  | "routine_step_completed"
  | "routine_created"
  | "first_habit_logged"
  | "notification_prompt_shown"
  | "signup_failed"
  | "routine_failed";

export type SignupFailureCategory =
  | "missing_fields"
  | "invalid_email"
  | "weak_password"
  | "password_mismatch"
  | "duplicate_account"
  | "rate_limited"
  | "signup_disabled"
  | "confirmation_expired"
  | "network"
  | "provider"
  | "unknown";

export type RoutineFailureCategory =
  | "missing_goal"
  | "missing_constraint"
  | "no_selection"
  | "auth_lost"
  | "validation"
  | "network"
  | "partial_save"
  | "save_failed"
  | "unknown";

const COMMON_PROPERTY_KEYS = [
  "activation_variant",
  "activation_bucket",
  "rollout_percentage",
  "activation_stage",
  "platform",
] as const;

const EVENT_PROPERTY_KEYS: Record<ActivationAnalyticsEventName, readonly string[]> = {
  activation_exposed: [],
  signup_mode_opened: ["method"],
  signup_submitted: ["method"],
  signup_confirmed: ["authenticated"],
  activation_entry: [],
  routine_started: ["flow", "step_count"],
  routine_step_completed: ["flow", "step_index", "step_count", "step_id"],
  routine_created: ["flow", "requested_count", "created_count", "failed_count", "outcome"],
  first_habit_logged: ["queued"],
  notification_prompt_shown: ["surface"],
  signup_failed: ["method", "failure_category", "failure_stage"],
  routine_failed: ["flow", "failure_category", "requested_count", "created_count", "failed_count"],
};

const SAFE_VARIANTS = ["control", "activation_v2", "unassigned"] as const;
const SAFE_STAGES = ["pre_value", "first_log", "engaged", "unassigned"] as const;
const SAFE_PLATFORMS = ["ios", "android", "web", "windows", "macos", "unknown"] as const;
const SAFE_STRING_PROPERTY_VALUES: Record<string, readonly string[]> = {
  method: ["email", "google"],
  flow: ["control", "quick_start", "manual"],
  step_id: [
    "goals",
    "lifestyle",
    "sleep",
    "workload",
    "stress",
    "fitnessLevel",
    "body",
    "baseline",
    "constraint",
  ],
  outcome: ["complete", "partial"],
  surface: ["first_log_flow", "dashboard"],
  failure_category: [
    "missing_fields",
    "invalid_email",
    "weak_password",
    "password_mismatch",
    "duplicate_account",
    "rate_limited",
    "signup_disabled",
    "confirmation_expired",
    "network",
    "provider",
    "missing_goal",
    "missing_constraint",
    "no_selection",
    "auth_lost",
    "validation",
    "partial_save",
    "save_failed",
    "unknown",
  ],
  failure_stage: ["validation", "submission", "confirmation"],
};
const SAFE_INTEGER_PROPERTIES = new Set([
  "step_index",
  "step_count",
  "requested_count",
  "created_count",
  "failed_count",
]);
const SAFE_BOOLEAN_PROPERTIES = new Set(["authenticated", "queued"]);

function isAllowedString(value: unknown, allowed: readonly string[]): value is string {
  return typeof value === "string" && allowed.includes(value);
}

function validInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= max;
}

function validatedEventProperty(
  key: string,
  value: unknown,
): string | number | boolean | undefined {
  const stringValues = SAFE_STRING_PROPERTY_VALUES[key];
  if (stringValues) return isAllowedString(value, stringValues) ? value : undefined;
  if (SAFE_INTEGER_PROPERTIES.has(key)) return validInteger(value) ? value : undefined;
  if (SAFE_BOOLEAN_PROPERTIES.has(key)) return typeof value === "boolean" ? value : undefined;
  return undefined;
}

export function activationAnalyticsProperties(
  context: ActivationAnalyticsContext,
): Record<string, string | number | null> {
  return {
    activation_variant: isAllowedString(context.variant, SAFE_VARIANTS)
      ? context.variant
      : "unassigned",
    activation_bucket: validInteger(context.bucket, 99) ? context.bucket : null,
    rollout_percentage: validInteger(context.rolloutPercentage, 100)
      ? context.rolloutPercentage
      : null,
    activation_stage: isAllowedString(context.stage, SAFE_STAGES) ? context.stage : "unassigned",
    platform: isAllowedString(context.platform, SAFE_PLATFORMS) ? context.platform : "unknown",
  };
}

export function unassignedActivationAnalyticsContext(platform: string): ActivationAnalyticsContext {
  return {
    variant: "unassigned",
    bucket: null,
    rolloutPercentage: null,
    stage: "unassigned",
    platform,
  };
}

export function buildActivationAnalyticsEvent(
  name: ActivationAnalyticsEventName,
  context: ActivationAnalyticsContext,
  candidateProperties: Record<string, unknown>,
): {
  name: ActivationAnalyticsEventName;
  properties: Record<string, string | number | boolean | null>;
} {
  const common = activationAnalyticsProperties(context);
  const properties: Record<string, string | number | boolean | null> = {};
  for (const key of COMMON_PROPERTY_KEYS) properties[key] = common[key];
  for (const key of EVENT_PROPERTY_KEYS[name]) {
    const value = validatedEventProperty(key, candidateProperties[key]);
    if (value !== undefined) properties[key] = value;
  }
  return { name, properties };
}

export function sanitizeAnalyticsPath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  const segments = path.split("/");
  const habitsIndex = segments.findIndex((segment) => segment === "habits");
  if (habitsIndex >= 0) {
    const candidate = segments[habitsIndex + 1];
    if (candidate && candidate !== "new" && candidate !== "wizard" && candidate !== "[id]") {
      segments[habitsIndex + 1] = "[id]";
    }
  }
  return segments.join("/") || "/";
}

export function isSupabaseUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  return [record.name, record.message, record.error, record.error_description, record.code]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
}

export function categorizeSignupFailure(error: unknown): SignupFailureCategory {
  const text = errorText(error);
  if (!text) return "unknown";
  if (
    text.includes("expired") &&
    (text.includes("confirmation") || text.includes("link") || text.includes("token"))
  ) {
    return "confirmation_expired";
  }
  if (text.includes("required")) return "missing_fields";
  if (text.includes("invalid email") || text.includes("valid email")) return "invalid_email";
  if (text.includes("do not match") || text.includes("does not match")) return "password_mismatch";
  if (
    text.includes("weak password") ||
    text.includes("uppercase") ||
    text.includes("lowercase") ||
    text.includes("at least 8")
  ) {
    return "weak_password";
  }
  if (text.includes("already registered") || text.includes("already exists")) {
    return "duplicate_account";
  }
  if (
    text.includes("rate limit") ||
    text.includes("too many") ||
    text.includes("after 60 seconds")
  ) {
    return "rate_limited";
  }
  if (text.includes("signup") && text.includes("disabled")) return "signup_disabled";
  if (
    text.includes("network") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("load failed")
  ) {
    return "network";
  }
  return "provider";
}

const STAGE_RANK: Record<ActivationStage, number> = {
  pre_value: 0,
  first_log: 1,
  engaged: 2,
};

export function createFirstLogAnalyticsGate() {
  const stages = new Map<string, ActivationStage>();
  return {
    sync(userId: string, stage: ActivationStage): void {
      const current = stages.get(userId);
      if (!current || STAGE_RANK[stage] > STAGE_RANK[current]) stages.set(userId, stage);
    },
    positiveCompletion(userId: string): boolean {
      if (stages.get(userId) !== "pre_value") return false;
      stages.set(userId, "first_log");
      return true;
    },
    clear(userId?: string): void {
      if (userId) stages.delete(userId);
      else stages.clear();
    },
  };
}
