type AiFeature =
  | "coach-message"
  | "habit-routine"
  | "smart-reminders"
  | "progress-report"
  | "validate-habit";

export type AiAccessState =
  | "eligible"
  | "attestation_required"
  | "feature_disabled"
  | "provider_unconfirmed";

export type AiFallbackReason =
  | "ai_attestation_required"
  | "feature_disabled"
  | "paid_service_unconfirmed"
  | "safety_blocked"
  | "quota_exceeded"
  | "provider_unavailable"
  | "invalid_output";

type SupabaseAdminClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    insert: (
      value: Record<string, unknown>,
    ) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

type AiQuotaResult =
  | { allowed: true; requestId: string }
  | {
    allowed: false;
    requestId: string;
    reason: string;
    status: number;
    retryAfterSeconds?: number;
  };

export type AiUsageDetails = {
  requestId?: string;
  promptVersion?: string;
  model?: string;
  latencyMs?: number;
  providerStatus?: number;
  finishReason?: string;
  safetyCategory?: string;
  inputTokens?: number;
  outputTokens?: number;
};

const AI_LIMITS: Record<AiFeature, { hourly: number; daily: number }> = {
  "coach-message": { hourly: 12, daily: 40 },
  "habit-routine": { hourly: 4, daily: 10 },
  "smart-reminders": { hourly: 8, daily: 20 },
  "progress-report": { hourly: 2, daily: 3 },
  "validate-habit": { hourly: 20, daily: 60 },
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

export async function enforceAiQuota(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
  requestId = crypto.randomUUID(),
): Promise<AiQuotaResult> {
  const paidServiceConfirmed =
    globalThis.Deno?.env.get("GEMINI_PAID_SERVICE_CONFIRMED")?.toLowerCase() ===
      "true";
  if (!paidServiceConfirmed) {
    await recordAiUsageEvent(
      admin,
      userId,
      feature,
      "blocked",
      "paid_service_unconfirmed",
      { requestId },
    );
    return {
      allowed: false,
      requestId,
      reason: "paid_service_unconfirmed",
      status: 503,
    };
  }

  const limits = AI_LIMITS[feature];
  const { data, error } = await admin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_feature: feature,
    p_hourly_limit: limits.hourly,
    p_daily_limit: limits.daily,
    p_request_id: requestId,
  });

  if (error) {
    console.error("AI quota guard failed", {
      feature,
      userId,
      error: error.message,
    });
    await recordAiUsageEvent(
      admin,
      userId,
      feature,
      "fallback",
      "provider_unavailable",
      {
        requestId,
      },
    );
    return {
      allowed: false,
      requestId,
      reason: "provider_unavailable",
      status: 503,
    };
  }

  const result = asRecord(data);
  const resolvedRequestId =
    typeof result.requestId === "string" && result.requestId
      ? result.requestId
      : requestId;
  if (result.allowed === true) {
    return { allowed: true, requestId: resolvedRequestId };
  }

  const reason = typeof result.reason === "string"
    ? result.reason
    : "provider_unavailable";
  const retryAfterSeconds = typeof result.retryAfterSeconds === "number"
    ? result.retryAfterSeconds
    : undefined;
  return {
    allowed: false,
    requestId: resolvedRequestId,
    reason,
    status: reason === "quota_exceeded"
      ? 429
      : reason === "ai_attestation_required"
      ? 403
      : reason === "feature_disabled"
      ? 503
      : 503,
    retryAfterSeconds,
  };
}

export async function recordAiUsageEvent(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
  status: "succeeded" | "failed" | "fallback" | "blocked",
  reason?: string,
  details: AiUsageDetails = {},
) {
  const safeInteger = (value: number | undefined) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.trunc(value))
      : null;
  const { error } = await admin.from("ai_usage_events").insert({
    request_id: details.requestId ?? crypto.randomUUID(),
    user_id: userId,
    feature,
    status,
    reason: reason ?? null,
    prompt_version: details.promptVersion?.slice(0, 64) ?? null,
    model: details.model?.slice(0, 128) ?? null,
    latency_ms: safeInteger(details.latencyMs),
    provider_status: safeInteger(details.providerStatus),
    finish_reason: details.finishReason?.slice(0, 64) ?? null,
    safety_category: details.safetyCategory?.slice(0, 64) ?? null,
    input_tokens: safeInteger(details.inputTokens),
    output_tokens: safeInteger(details.outputTokens),
    metadata: {},
  });
  if (error) {
    console.error("AI usage event log failed", {
      feature,
      userId,
      status,
      error: error.message,
    });
  }
}
