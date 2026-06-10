import { Platform } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { getCurrentUser, isSupabaseConfigured, supabase } from "../supabase/client";
import { reportError } from "../services/sentry";
import { resolveProAccess, type ProAccess, type ProAccessProfile } from "./access";

export const PRO_ENTITLEMENT_ID = "pro";
export const PRO_MONTHLY_PRODUCT_ID = "pro_monthly";
export const PRO_ANNUAL_PRODUCT_ID = "pro_annual";

type RevenueCatModule = typeof import("react-native-purchases");

let configuredUserId: string | null = null;

function revenueCatApiKey(): string {
  if (Platform.OS === "ios") return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
  if (Platform.OS === "android") return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
  return "";
}

async function purchasesModule(): Promise<RevenueCatModule | null> {
  if (Platform.OS === "web") return null;
  const apiKey = revenueCatApiKey();
  if (!apiKey) return null;
  try {
    return await import("react-native-purchases");
  } catch {
    return null;
  }
}

export async function configureRevenueCat(userId: string): Promise<boolean> {
  const module = await purchasesModule();
  if (!module) return false;
  if (configuredUserId === userId) return true;
  if (__DEV__) void module.default.setLogLevel(module.LOG_LEVEL.DEBUG);
  module.default.configure({ apiKey: revenueCatApiKey(), appUserID: userId });
  configuredUserId = userId;
  return true;
}

export async function logOutRevenueCat(): Promise<void> {
  const module = await purchasesModule();
  if (!module || !configuredUserId) return;
  configuredUserId = null;
  await module.default.logOut?.().catch(() => undefined);
}

export async function getCurrentProAccess(): Promise<ProAccess> {
  if (!isSupabaseConfigured()) return resolveProAccess(null);
  const user = await getCurrentUser();
  if (!user) return resolveProAccess(null);

  const { data } = await supabase
    .from("profiles")
    .select("is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return resolveProAccess(data as ProAccessProfile | null);
}

export async function syncRevenueCatSubscription(userId?: string): Promise<ProAccess> {
  const user = userId ? { id: userId } : await getCurrentUser();
  if (!user || !isSupabaseConfigured()) return resolveProAccess(null);

  await configureRevenueCat(user.id);
  await supabase.functions.invoke("sync-subscription").catch((error) => {
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "sync-subscription",
    });
  });
  return getCurrentProAccess();
}

export async function getProPackages(): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  available: boolean;
}> {
  const user = await getCurrentUser();
  if (!user) return { monthly: null, annual: null, available: false };
  const module = await purchasesModule();
  if (!module) return { monthly: null, annual: null, available: false };
  await configureRevenueCat(user.id);

  const offerings = await module.default.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  return {
    monthly: packages.find((pack) => pack.product.identifier === PRO_MONTHLY_PRODUCT_ID) ?? null,
    annual: packages.find((pack) => pack.product.identifier === PRO_ANNUAL_PRODUCT_ID) ?? null,
    available: packages.length > 0,
  };
}

export async function purchaseProPackage(pack: PurchasesPackage): Promise<ProAccess> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to sign in again.");
  const module = await purchasesModule();
  if (!module) throw new Error("Subscriptions are not available on this device.");
  await configureRevenueCat(user.id);
  await module.default.purchasePackage(pack);
  return syncRevenueCatSubscription(user.id);
}

export async function restoreProPurchases(): Promise<ProAccess> {
  const user = await getCurrentUser();
  if (!user) throw new Error("You need to sign in again.");
  const module = await purchasesModule();
  if (!module) throw new Error("Subscriptions are not available on this device.");
  await configureRevenueCat(user.id);
  await module.default.restorePurchases();
  return syncRevenueCatSubscription(user.id);
}
