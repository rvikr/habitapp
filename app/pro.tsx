import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
} from "@/lib/subscription/revenuecat";
import type { ProAccess } from "@/lib/subscription/access";

type PaywallPackage = Awaited<ReturnType<typeof getProPackages>>["monthly"];

export default function ProScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [access, setAccess] = useState<ProAccess | null>(null);
  const [monthly, setMonthly] = useState<PaywallPackage>(null);
  const [annual, setAnnual] = useState<PaywallPackage>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [currentAccess, packages] = await Promise.all([
      getCurrentProAccess(),
      getProPackages().catch(() => ({ monthly: null, annual: null, available: false })),
    ]);
    setAccess(currentAccess);
    setMonthly(packages.monthly);
    setAnnual(packages.annual);
    setLoading(false);
  }, []);

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
      Alert.alert(
        t("Could not start subscription"),
        error instanceof Error ? error.message : t("Try again."),
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
      Alert.alert(
        nextAccess.hasPro ? t("Subscription restored") : t("No active subscription found"),
        nextAccess.hasPro
          ? t("Pro access is active on this account.")
          : t("Try another store account if needed."),
      );
    } catch (error) {
      Alert.alert(
        t("Could not restore purchases"),
        error instanceof Error ? error.message : t("Try again."),
      );
    } finally {
      setBusy(null);
    }
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
          <TouchableOpacity onPress={() => router.back()} className="mr-md">
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

          {Platform.OS === "web" ? (
            <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
              <View className="flex-row items-center gap-sm">
                <MaterialCommunityIcons name="cellphone" size={22} color="#F26B1F" />
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold flex-1">
                  {t("Subscribe in the app")}
                </Text>
              </View>
              <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant leading-5">
                {t(
                  "Pro subscriptions are available in the iOS and Android app. If you already subscribed, your Pro access is active here automatically.",
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
                  disabled={Boolean(busy)}
                  onPress={() =>
                    item.pack
                      ? buy(item.pack, item.label)
                      : Alert.alert(
                          t("Coming soon"),
                          t("Subscriptions will be available shortly. Hang tight!"),
                        )
                  }
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
                    <ActivityIndicator color="#F26B1F" />
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={22} color="#8F8A82" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {loading && Platform.OS !== "web" && <ActivityIndicator color="#F26B1F" />}

          <ProComparison />

          <View className="gap-xs">
            {Platform.OS !== "web" && (
              <TouchableOpacity
                className="self-center py-xs"
                onPress={restore}
                disabled={Boolean(busy)}
              >
                <Text className="text-label-sm text-primary font-semibold">
                  {busy === "restore" ? t("Restoring") : t("Restore purchases")}
                </Text>
              </TouchableOpacity>
            )}
            {Platform.OS !== "web" && (
              <>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center leading-5">
                  {t(
                    "Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Payment is charged to your {store} account at confirmation of purchase.",
                    {
                      store: Platform.OS === "ios" ? t("Apple ID") : t("Google Play"),
                    },
                  )}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center leading-5">
                  {Platform.OS === "ios"
                    ? t("Manage or cancel: App Store → your profile → Subscriptions.")
                    : t(
                        "Manage or cancel: Google Play → your profile → Payments & subscriptions → Subscriptions.",
                      )}
                </Text>
              </>
            )}
            <View className="flex-row justify-center gap-md pt-xs">
              <TouchableOpacity onPress={() => Linking.openURL("https://lagan.health/terms")}>
                <Text className="text-label-sm text-primary font-semibold">
                  {t("Terms of Use")}
                </Text>
              </TouchableOpacity>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                ·
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL("https://lagan.health/privacy")}>
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
