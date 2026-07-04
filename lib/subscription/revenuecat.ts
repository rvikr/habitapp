import { Platform } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { getCurrentUser, isSupabaseConfigured, supabase } from "../supabase/client";
import { reportError } from "../services/sentry";
import { resolveProAccess, type ProAccess, type ProAccessProfile } from "./access";
import {
  PRO_ANNUAL_PRODUCT_ID,
  PRO_ENTITLEMENT_ID,
  PRO_MONTHLY_PRODUCT_ID,
  selectProPaywallPackages,
} from "./revenuecat-shared";

export { PRO_ANNUAL_PRODUCT_ID, PRO_ENTITLEMENT_ID, PRO_MONTHLY_PRODUCT_ID };

type RevenueCatModule = typeof import("react-native-purchases");

let configuredUserId: string | null = null;

function normalizeRevenueCatApiKey(value: string | undefined): string {
  const key = value?.trim() ?? "";
  if (!key || key.startsWith("$") || key.includes("your-public")) return "";
  return key;
}

function revenueCatApiKey(): string {
  if (Platform.OS === "ios") {
    return normalizeRevenueCatApiKey(process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY);
  }
  if (Platform.OS === "android") {
    return normalizeRevenueCatApiKey(process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY);
  }
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

export type ProPackagesUnavailableReason = "signed-out" | "unsupported" | "empty-offering";

export async function getProPackages(): Promise<{
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
  available: boolean;
  reason?: ProPackagesUnavailableReason;
}> {
  const user = await getCurrentUser();
  if (!user) return { monthly: null, annual: null, available: false, reason: "signed-out" };
  const module = await purchasesModule();
  if (!module) return { monthly: null, annual: null, available: false, reason: "unsupported" };
  await configureRevenueCat(user.id);

  // getOfferings failures propagate so the paywall can log and surface them.
  const offerings = await module.default.getOfferings();
  const selected = selectProPaywallPackages(offerings.current);
  if (!selected.monthly && !selected.annual) return { ...selected, reason: "empty-offering" };
  return selected;
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
