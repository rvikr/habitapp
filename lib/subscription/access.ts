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
  trialDaysLeft: number | null;
  // Set when a past trial is the reason the user is on the free tier, so the
  // UI can explain the downgrade instead of features silently disappearing.
  trialEndedAt: string | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isFutureTimestamp(value: string | null | undefined, now: Date): value is string {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function trialDaysLeft(value: string | null | undefined, now = new Date()): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime()) return null;
  return Math.max(1, Math.ceil((timestamp - now.getTime()) / MS_PER_DAY));
}

export function resolveProAccess(
  profile: ProAccessProfile | null | undefined,
  now = new Date(),
): ProAccess {
  if (profile?.is_pro) {
    return {
      hasPro: true,
      source: "admin",
      expiresAt: null,
      trialDaysLeft: null,
      trialEndedAt: null,
    };
  }

  if (
    profile?.revenuecat_entitlement_active &&
    (!profile.pro_expires_at || isFutureTimestamp(profile.pro_expires_at, now))
  ) {
    return {
      hasPro: true,
      source: "subscription",
      expiresAt: profile.pro_expires_at ?? null,
      trialDaysLeft: null,
      trialEndedAt: null,
    };
  }

  if (isFutureTimestamp(profile?.pro_trial_ends_at, now)) {
    return {
      hasPro: true,
      source: "trial",
      expiresAt: profile.pro_trial_ends_at,
      trialDaysLeft: trialDaysLeft(profile.pro_trial_ends_at, now),
      trialEndedAt: null,
    };
  }

  const endedTimestamp = profile?.pro_trial_ends_at ? Date.parse(profile.pro_trial_ends_at) : NaN;
  const trialEndedAt =
    Number.isFinite(endedTimestamp) && endedTimestamp <= now.getTime()
      ? (profile?.pro_trial_ends_at ?? null)
      : null;
  return { hasPro: false, source: "free", expiresAt: null, trialDaysLeft: null, trialEndedAt };
}

/**
 * A brand-new in-app purchase may only be offered when the user does not already
 * have Pro. Admin comps (`is_pro`) and app-managed trials grant `hasPro` without a
 * real store subscription, so Google Play has nothing to block and would charge the
 * user again for access they already hold. Pro users change plans through the store
 * (Manage subscription) instead of re-subscribing. Callers that render during an
 * in-flight load should also gate on their loading state so buy controls never flash
 * before entitlement is known.
 */
export function canOfferProPurchase(access: ProAccess | null | undefined): boolean {
  return !access?.hasPro;
}

export function shouldShowTrialSubscriptionBanner(
  access: ProAccess | null | undefined,
  dismissedForSession: boolean,
): boolean {
  return (
    !dismissedForSession &&
    access?.source === "trial" &&
    typeof access.trialDaysLeft === "number" &&
    access.trialDaysLeft > 0
  );
}

const TRIAL_ENDED_BANNER_WINDOW_MS = 7 * MS_PER_DAY;

export function shouldShowTrialEndedBanner(
  access: ProAccess | null | undefined,
  dismissedForTrialEnd: string | null,
  now = new Date(),
): boolean {
  if (!access || access.source !== "free" || !access.trialEndedAt) return false;
  if (dismissedForTrialEnd === access.trialEndedAt) return false;
  const ended = Date.parse(access.trialEndedAt);
  return Number.isFinite(ended) && now.getTime() - ended <= TRIAL_ENDED_BANNER_WINDOW_MS;
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
