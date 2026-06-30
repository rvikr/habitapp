export const PRO_ENTITLEMENT_ID = "pro";
export const PRO_MONTHLY_PRODUCT_ID = "pro_monthly";
export const PRO_ANNUAL_PRODUCT_ID = "pro_annual";

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
  const monthly =
    offering?.monthly ??
    packages.find((pack) => pack.product.identifier === PRO_MONTHLY_PRODUCT_ID) ??
    null;
  const annual =
    offering?.annual ??
    packages.find((pack) => pack.product.identifier === PRO_ANNUAL_PRODUCT_ID) ??
    null;

  return {
    monthly,
    annual,
    available: packages.length > 0 || Boolean(monthly) || Boolean(annual),
  };
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
