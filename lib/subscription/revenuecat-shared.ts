export const PRO_ENTITLEMENT_ID = "Pro";
export const PRO_MONTHLY_PRODUCT_ID = "rc_49_1m";
export const PRO_ANNUAL_PRODUCT_ID = "rc_499_12m";
export const GOOGLE_PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions?package=health.lagan.app";

type GooglePlayProductLike = {
  priceString?: string | null;
  defaultOption?: {
    freePhase?: {
      billingPeriod?: { unit?: string | null; value?: number | null } | null;
    } | null;
    fullPricePhase?: {
      price?: { formatted?: string | null } | null;
    } | null;
  } | null;
};

/** Returns the exact eligible Google Play trial length exposed by RevenueCat. */
export function googlePlayTrialDays(
  product: GooglePlayProductLike | null | undefined,
): number | null {
  const period = product?.defaultOption?.freePhase?.billingPeriod;
  const value = period?.value;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (period?.unit === "DAY") return value;
  if (period?.unit === "WEEK") return value * 7;
  return null;
}

/** Uses the post-offer recurring price instead of a free/intro phase price. */
export function googlePlayRenewalPrice(
  product: GooglePlayProductLike | null | undefined,
  fallback: string,
): string {
  return (
    product?.defaultOption?.fullPricePhase?.price?.formatted || product?.priceString || fallback
  );
}

type RevenueCatPackageLike = {
  product: {
    identifier: string;
  };
};

type RevenueCatOfferingLike<Package extends RevenueCatPackageLike> = {
  monthly?: Package | null;
  annual?: Package | null;
  availablePackages?: readonly Package[] | null;
};

export function selectProPaywallPackages<Package extends RevenueCatPackageLike>(
  offering: RevenueCatOfferingLike<Package> | null | undefined,
): {
  monthly: Package | null;
  annual: Package | null;
  available: boolean;
} {
  const packages = offering?.availablePackages ?? [];
  // Google Play subscription identifiers arrive as "productId:basePlanId".
  const matchesProduct = (pack: RevenueCatPackageLike, productId: string) =>
    pack.product.identifier === productId || pack.product.identifier.startsWith(`${productId}:`);
  const monthly =
    offering?.monthly ??
    packages.find((pack) => matchesProduct(pack, PRO_MONTHLY_PRODUCT_ID)) ??
    null;
  const annual =
    offering?.annual ??
    packages.find((pack) => matchesProduct(pack, PRO_ANNUAL_PRODUCT_ID)) ??
    null;

  return {
    monthly,
    annual,
    available: packages.length > 0 || Boolean(monthly) || Boolean(annual),
  };
}

/**
 * Human-readable summary of a RevenueCat/Play Billing failure, including the
 * SDK error code when present, so alerts and Sentry events name the real cause.
 */
export function describeRevenueCatError(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  const candidate = error as {
    message?: unknown;
    code?: unknown;
    underlyingErrorMessage?: unknown;
  };
  const parts: string[] = [];
  if (typeof candidate.message === "string" && candidate.message) parts.push(candidate.message);
  if (candidate.code !== undefined && candidate.code !== null) {
    parts.push(`(code ${String(candidate.code)})`);
  }
  if (typeof candidate.underlyingErrorMessage === "string" && candidate.underlyingErrorMessage) {
    parts.push(`— ${candidate.underlyingErrorMessage}`);
  }
  return parts.join(" ");
}

export function isRevenueCatPurchaseCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { userCancelled?: unknown; code?: unknown };
  return (
    candidate.userCancelled === true ||
    candidate.code === "1" ||
    candidate.code === 1 ||
    candidate.code === "PURCHASE_CANCELLED_ERROR"
  );
}
