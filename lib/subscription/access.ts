export type ProAccessSource = "admin" | "trial" | "subscription" | "free";

export type ProAccessProfile = {
  is_pro?: boolean | null;
  pro_trial_ends_at?: string | null;
  revenuecat_entitlement_active?: boolean | null;
  pro_expires_at?: string | null;
};

export type ProAccess = {
  hasPro: boolean;
  source: ProAccessSource;
  expiresAt: string | null;
};

function isFutureTimestamp(value: string | null | undefined, now: Date): value is string {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function resolveProAccess(
  profile: ProAccessProfile | null | undefined,
  now = new Date(),
): ProAccess {
  if (profile?.is_pro) return { hasPro: true, source: "admin", expiresAt: null };

  if (isFutureTimestamp(profile?.pro_trial_ends_at, now)) {
    return { hasPro: true, source: "trial", expiresAt: profile.pro_trial_ends_at };
  }

  if (
    profile?.revenuecat_entitlement_active &&
    (!profile.pro_expires_at || isFutureTimestamp(profile.pro_expires_at, now))
  ) {
    return { hasPro: true, source: "subscription", expiresAt: profile.pro_expires_at ?? null };
  }

  return { hasPro: false, source: "free", expiresAt: null };
}

export function subscriptionStatusLabel(
  profile: ProAccessProfile | null | undefined,
  now = new Date(),
): string {
  const access = resolveProAccess(profile, now);
  if (access.source === "admin" || access.source === "subscription") return "Pro";
  if (access.source === "trial") return "Trial";
  return "Free";
}
