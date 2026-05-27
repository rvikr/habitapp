type AiFeature =
  | "coach-message"
  | "habit-routine"
  | "smart-reminders"
  | "progress-report"
  | "validate-habit";

type SupabaseAdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

type AiQuotaResult =
  | { allowed: true }
  | { allowed: false; reason: string; status: number; retryAfterSeconds?: number };

const AI_LIMITS: Record<AiFeature, { hourly: number; daily: number }> = {
  "coach-message": { hourly: 12, daily: 40 },
  "habit-routine": { hourly: 4, daily: 10 },
  "smart-reminders": { hourly: 8, daily: 20 },
  "progress-report": { hourly: 2, daily: 3 },
  "validate-habit": { hourly: 20, daily: 60 },
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export async function enforceAiQuota(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
): Promise<AiQuotaResult> {
  const limits = AI_LIMITS[feature];
  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_feature: feature,
    p_hourly_limit: limits.hourly,
    p_daily_limit: limits.daily,
  });

  if (error) {
    console.error("AI quota guard failed", { feature, userId, error: error.message });
    return { allowed: false, reason: "quota_guard_failed", status: 503 };
  }

  const result = asRecord(data);
  if (result.allowed === true) return { allowed: true };

  const reason = typeof result.reason === "string" ? result.reason : "quota_denied";
  const retryAfterSeconds = typeof result.retryAfterSeconds === "number" ? result.retryAfterSeconds : undefined;
  return {
    allowed: false,
    reason,
    status: reason === "quota_exceeded" ? 429 : 200,
    retryAfterSeconds,
  };
}

export async function recordAiUsageEvent(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
  status: "succeeded" | "failed" | "fallback",
  reason?: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from("ai_usage_events").insert({
    user_id: userId,
    feature,
    status,
    reason: reason ?? null,
    metadata,
  });
  if (error) console.error("AI usage event log failed", { feature, userId, status, error: error.message });
}
