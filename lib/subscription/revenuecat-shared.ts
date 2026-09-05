export const PRO_ENTITLEMENT_ID = "Pro";
export const PRO_MONTHLY_PRODUCT_ID = "rc_49_1m";
export const PRO_ANNUAL_PRODUCT_ID = "rc_499_12m";
export const GOOGLE_PLAY_SUBSCRIPTIONS_URL =
  "https://play.google.com/store/account/subscriptions?package=health.lagan.app";
export const APP_STORE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";

type GooglePlayProductLike = {
  priceString?: string | null;
  defaultOption?: {
    freePhase?: {
      billingPeriod?: { unit?: string | null; value?: number | null } | null;
    } | null;
    introPhase?: {
      price?: { formatted?: string | null } | null;
      billingPeriod?: { unit?: string | null; value?: number | null } | null;
      billingCycleCount?: number | null;
    } | null;
    fullPricePhase?: {
      price?: { formatted?: string | null } | null;
    } | null;
  } | null;
};

type AppleProductLike = {
  priceString?: string | null;
  introPrice?: {
    price?: number | null;
    priceString?: string | null;
    cycles?: number | null;
    periodUnit?: string | null;
    periodNumberOfUnits?: number | null;
  } | null;
};

export type StorePaidIntroOffer = {
  priceString: string;
  cycles: number;
  periodUnit: string;
  periodNumberOfUnits: number;
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

/** Returns an eligible free-trial length for either supported store. */
export function storeTrialDays(
  product: (GooglePlayProductLike & AppleProductLike) | null | undefined,
  appleIntroEligible = false,
): number | null {
  const googleDays = googlePlayTrialDays(product);
  if (googleDays) return googleDays;

  const intro = product?.introPrice;
  if (!appleIntroEligible || !intro || intro.price !== 0) return null;
  const units = intro.periodNumberOfUnits;
  const cycles = intro.cycles;
  if (
    typeof units !== "number" ||
    !Number.isFinite(units) ||
    units <= 0 ||
    typeof cycles !== "number" ||
    !Number.isFinite(cycles) ||
    cycles <= 0
  ) {
    return null;
  }
  if (intro.periodUnit === "DAY") return units * cycles;
  if (intro.periodUnit === "WEEK") return units * cycles * 7;
  return null;
}

/** Returns an eligible paid Apple introductory offer using the store-localized price. */
export function storePaidIntroOffer(
  product: (GooglePlayProductLike & AppleProductLike) | null | undefined,
  appleIntroEligible = false,
): StorePaidIntroOffer | null {
  const googleIntro = product?.defaultOption?.introPhase;
  const googlePrice = googleIntro?.price?.formatted;
  const googlePeriod = googleIntro?.billingPeriod;
  if (
    googlePrice &&
    googlePeriod?.unit &&
    typeof googlePeriod.value === "number" &&
    googlePeriod.value > 0
  ) {
    return {
      priceString: googlePrice,
      cycles: googleIntro.billingCycleCount ?? 1,
      periodUnit: googlePeriod.unit,
      periodNumberOfUnits: googlePeriod.value,
    };
  }

  const intro = product?.introPrice;
  if (
    !appleIntroEligible ||
    !intro ||
    typeof intro.price !== "number" ||
    intro.price <= 0 ||
    !intro.priceString ||
    typeof intro.cycles !== "number" ||
    intro.cycles <= 0 ||
    !intro.periodUnit ||
    typeof intro.periodNumberOfUnits !== "number" ||
    intro.periodNumberOfUnits <= 0
  ) {
    return null;
  }

  return {
    priceString: intro.priceString,
    cycles: intro.cycles,
    periodUnit: intro.periodUnit,
    periodNumberOfUnits: intro.periodNumberOfUnits,
  };
}

/** Uses the recurring store price instead of a free/introductory phase price. */
export function storeRenewalPrice(
  product: (GooglePlayProductLike & AppleProductLike) | null | undefined,
  fallback: string,
): string {
  return googlePlayRenewalPrice(product, fallback);
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
