import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLanguage } from "@/components/language-provider";
import { ProComparison } from "@/components/pro-comparison";
import {
  getCurrentProAccess,
  getProPackages,
  purchaseProPackage,
  restoreProPurchases,
  type ProPackagesUnavailableReason,
} from "@/lib/subscription/revenuecat";
import {
  describeRevenueCatError,
  isRevenueCatPurchaseCancelled,
} from "@/lib/subscription/revenuecat-shared";
import { reportError } from "@/lib/services/sentry";
import type { ProAccess } from "@/lib/subscription/access";

type PaywallPackage = Awaited<ReturnType<typeof getProPackages>>["monthly"];

type PlanIssue = { kind: ProPackagesUnavailableReason } | { kind: "error"; detail: string };

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(describeRevenueCatError(error));
}

export default function ProScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [access, setAccess] = useState<ProAccess | null>(null);
  const [monthly, setMonthly] = useState<PaywallPackage>(null);
  const [annual, setAnnual] = useState<PaywallPackage>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [planIssue, setPlanIssue] = useState<PlanIssue | null>(null);
  const canPurchaseInApp = Platform.OS === "android";

  const load = useCallback(async () => {
    setLoading(true);
    let failure: PlanIssue | null = null;
    const empty = { monthly: null, annual: null, available: false } as const;
    const [currentAccess, packages] = await Promise.all([
      getCurrentProAccess(),
      canPurchaseInApp
        ? getProPackages().catch((error: unknown) => {
            reportError(toError(error), { context: "pro-paywall-offerings" });
            failure = { kind: "error", detail: describeRevenueCatError(error) };
            return empty;
          })
        : Promise.resolve(empty),
    ]);
    setAccess(currentAccess);
    setMonthly(packages.monthly);
    setAnnual(packages.annual);
    setPlanIssue(
      failure ?? ("reason" in packages && packages.reason ? { kind: packages.reason } : null),
    );
    setLoading(false);
  }, [canPurchaseInApp]);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(pack: NonNullable<PaywallPackage>, label: string) {
    setBusy(label);
    try {
      const nextAccess = await purchaseProPackage(pack);
      setAccess(nextAccess);
      if (nextAccess.hasPro) router.back();
    } catch (error) {
      if (isRevenueCatPurchaseCancelled(error)) return;
      reportError(toError(error), { context: "pro-paywall-purchase" });
      showAlert(
        t("Could not start subscription"),
        describeRevenueCatError(error) || t("Try again."),
      );
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    try {
      const nextAccess = await restoreProPurchases();
      setAccess(nextAccess);
      showAlert(
        nextAccess.hasPro ? t("Subscription restored") : t("No active subscription found"),
        nextAccess.hasPro
          ? t("Pro access is active on this account.")
          : t("Try another store account if needed."),
      );
    } catch (error) {
      reportError(toError(error), { context: "pro-paywall-restore" });
      showAlert(
        t("Could not restore purchases"),
        describeRevenueCatError(error) || t("Try again."),
      );
    } finally {
      setBusy(null);
    }
  }

  function showPlansUnavailable() {
    const body =
      planIssue?.kind === "signed-out"
        ? t("Sign in again to subscribe.")
        : planIssue?.kind === "unsupported"
          ? t("Purchases aren't supported in this app build.")
          : planIssue?.kind === "empty-offering"
            ? t(
                "Subscription plans aren't set up for this app version yet. Please try again later.",
              )
            : planIssue?.kind === "error"
              ? `${t("We couldn't load subscription plans. Check your connection and try again.")}\n\n${planIssue.detail}`
              : t("We couldn't load subscription plans. Check your connection and try again.");
    showAlert(t("Plans unavailable"), body, [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Retry"), onPress: () => void load() },
    ]);
  }

  const expiry = access?.expiresAt
    ? new Date(access.expiresAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const activeMessage =
    access?.source === "trial" && access.trialDaysLeft
      ? access.trialDaysLeft === 1
        ? t("1 day of Pro trial left")
        : t("{count} days of Pro trial left", { count: access.trialDaysLeft })
      : expiry
        ? t("Pro active until {date}", { date: expiry })
        : t("Pro access is active");

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile py-sm flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-md"
            accessibilityRole="button"
            accessibilityLabel={t("Go back")}
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
          </TouchableOpacity>
          <Text className="text-headline-md text-on-background dark:text-d-on-background">
            {t("Lagan Pro")}
          </Text>
        </View>

        <View className="px-margin-mobile gap-lg">
          <View className="pt-lg gap-sm">
            <View className="w-14 h-14 rounded-full bg-primary items-center justify-center">
              <MaterialCommunityIcons name="star-four-points" size={28} color="#fff" />
            </View>
            <Text className="text-display-sm text-on-background dark:text-d-on-background">
              {t("Unlock Pro")}
            </Text>
            <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
              {t(
                "Pro includes the AI coach, AI routine refinement, AI smart reminders, and future AI features.",
              )}
            </Text>
            {access?.hasPro && (
              <View className="bg-secondary-container rounded-xl px-md py-sm">
                <Text className="text-label-lg text-on-secondary-container">{activeMessage}</Text>
              </View>
            )}
          </View>

          {!canPurchaseInApp ? (
            <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
              <View className="flex-row items-center gap-sm">
                <MaterialCommunityIcons name="cellphone" size={22} color="#F26B1F" />
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold flex-1">
                  {t("Subscribe on Android")}
                </Text>
              </View>
              <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant leading-5">
                {t(
                  "Pro subscriptions are available in the Android app for now. If you already subscribed, your Pro access is active here automatically.",
                )}
              </Text>
            </View>
          ) : (
            <View className="gap-sm">
              {[
                {
                  label: "Monthly",
                  pack: monthly,
                  icon: "calendar-month",
                  price: "₹49",
                  period: "per month",
                  badge: null as string | null,
                },
                {
                  label: "Annual",
                  pack: annual,
                  icon: "calendar-star",
                  price: "₹499",
                  period: "per year",
                  badge: "Save 15%",
                },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
                  accessibilityRole="button"
                  accessibilityLabel={t("Buy {label}", { label: t(item.label) })}
                  accessibilityState={{ disabled: Boolean(busy) }}
                  onPress={() => {
                    if (busy) return;
                    return item.pack ? buy(item.pack, item.label) : showPlansUnavailable();
                  }}
                >
                  <View className="w-11 h-11 rounded-full bg-primary-fixed items-center justify-center">
                    <MaterialCommunityIcons name={item.icon as any} size={22} color="#F26B1F" />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-sm">
                      <Text className="text-body-lg text-on-surface dark:text-d-on-surface font-semibold">
                        {t(item.label)}
                      </Text>
                      {item.badge && (
                        <View className="bg-secondary-container rounded-full px-sm py-xs">
                          <Text className="text-label-sm text-on-secondary-container font-semibold">
                            {t(item.badge)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {(item.pack?.product.priceString ?? item.price) + " · " + t(item.period)}
                    </Text>
                  </View>
                  {busy === item.label ? (
                    <Text className="text-label-sm text-primary font-semibold">
                      {t("Processing...")}
                    </Text>
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#8F8A82" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loading && canPurchaseInApp && (
            <Text className="text-label-sm text-primary text-center">{t("Loading plans...")}</Text>
          )}

          <ProComparison />

          <View className="gap-xs">
            {canPurchaseInApp && (
              <TouchableOpacity
                className="self-center py-xs"
                onPress={() => {
                  if (!busy) void restore();
                }}
                accessibilityRole="button"
                accessibilityLabel={busy === "restore" ? t("Restoring") : t("Restore purchases")}
                accessibilityState={{ disabled: Boolean(busy) }}
              >
                <Text className="text-label-sm text-primary font-semibold">
                  {busy === "restore" ? t("Restoring") : t("Restore purchases")}
                </Text>
              </TouchableOpacity>
            )}
            {canPurchaseInApp && (
              <>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center leading-5">
                  {t(
                    "Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Payment is charged to your {store} account at confirmation of purchase.",
                    {
                      store: t("Google Play"),
                    },
                  )}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center leading-5">
                  {t(
                    "Manage or cancel: Google Play → your profile → Payments & subscriptions → Subscriptions.",
                  )}
                </Text>
              </>
            )}
            <View className="flex-row justify-center gap-md pt-xs">
              <TouchableOpacity
                onPress={() => Linking.openURL("https://lagan.health/terms")}
                accessibilityRole="link"
                accessibilityLabel={t("Terms of Use")}
              >
                <Text className="text-label-sm text-primary font-semibold">
                  {t("Terms of Use")}
                </Text>
              </TouchableOpacity>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                ·
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL("https://lagan.health/privacy")}
                accessibilityRole="link"
                accessibilityLabel={t("Privacy Policy")}
              >
                <Text className="text-label-sm text-primary font-semibold">
                  {t("Privacy Policy")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
