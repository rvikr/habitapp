type AiFeature = "coach-message" | "habit-routine" | "smart-reminders";

type SupabaseAdminClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

type ProAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "pro_required" | "pro_guard_failed"; status: number };

export async function enforceProAccess(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
): Promise<ProAccessResult> {
  const { data, error } = await admin.rpc("has_pro_access", { p_user_id: userId });
  if (error) {
    console.error("Pro access guard failed", { feature, userId, error: error.message });
    return { allowed: false, reason: "pro_guard_failed", status: 503 };
  }

  if (data === true) return { allowed: true };

  const { error: eventError } = await admin.from("ai_usage_events").insert({
    user_id: userId,
    feature,
    status: "blocked",
    reason: "pro_required",
  });
  if (eventError) {
    console.error("Pro access event log failed", { feature, userId, error: eventError.message });
  }

  return { allowed: false, reason: "pro_required", status: 402 };
}
