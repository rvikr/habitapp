type AiFeature = "coach-message" | "habit-routine" | "smart-reminders" | "progress-report";

type SupabaseAdminClient = {
  from: (table: string) => {
    insert: (value: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
};

export type ProfileEntitlementRow = {
  is_pro?: boolean | null;
  pro_trial_ends_at?: string | null;
  revenuecat_entitlement_active?: boolean | null;
  pro_expires_at?: string | null;
};

type ProAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "pro_required" | "pro_guard_failed"; status: number };

// Mirrors the SQL has_pro_access() function and the client's resolveProAccess():
// an admin flag, an unexpired trial, or an active RevenueCat entitlement that has
// not lapsed grants access. Kept pure so it can be unit-tested without a client.
export function hasProAccess(
  row: ProfileEntitlementRow | null,
  now: number = Date.now(),
): boolean {
  if (!row) return false;
  if (row.is_pro) return true;
  const inFuture = (value: string | null | undefined): boolean => {
    if (!value) return false;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > now;
  };
  if (inFuture(row.pro_trial_ends_at)) return true;
  if (
    row.revenuecat_entitlement_active &&
    (row.pro_expires_at == null || inFuture(row.pro_expires_at))
  ) {
    return true;
  }
  return false;
}

export async function enforceProAccess(
  admin: SupabaseAdminClient,
  userId: string,
  feature: AiFeature,
): Promise<ProAccessResult> {
  // Resolve Pro access by reading the profiles entitlement columns directly rather
  // than through the has_pro_access() RPC. A table select is immune to the
  // PostgREST function schema-cache misses / migration drift that otherwise surface
  // as a spurious pro_guard_failed, and it matches exactly what the client reads.
  const { data, error } = await admin
    .from("profiles")
    .select("is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Pro access guard failed", { feature, userId, error: error.message });
    return { allowed: false, reason: "pro_guard_failed", status: 503 };
  }

  if (hasProAccess(data as ProfileEntitlementRow | null)) return { allowed: true };

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
