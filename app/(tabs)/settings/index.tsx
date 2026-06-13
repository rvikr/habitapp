import { useState, useCallback } from "react";
import Constants from "expo-constants";
import { requestReviewManually } from "@/lib/platform/store-review";
import { requestSleepPermission } from "@/lib/platform/sleep";
import { isStepTrackingAvailable, requestStepPermission } from "@/lib/platform/steps";
import {
  Linking,
  Platform,
  Switch,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { supabase, getCurrentUser } from "@/lib/supabase/client";
import { signOut } from "@/lib/data/actions";
import { avatarFromUser } from "@/lib/utils/avatar";
import { useTheme } from "@/components/theme-provider";
import { useLanguage } from "@/components/language-provider";
import { useTrackingPreferences } from "@/components/tracking-preferences-provider";
import {
  resolveProAccess,
  subscriptionStatusLabel,
  type ProAccessProfile,
} from "@/lib/subscription/access";

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || "https://lagan.health/terms";
const APP_VERSION = Constants.expoConfig?.version ?? "—";

type UserInfo = {
  displayName: string;
  email: string | null;
  avatarUrl: string;
  subscriptionLabel: string;
  hasPro: boolean;
};

function SettingsRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl mb-xs"
      onPress={onPress}
    >
      <MaterialCommunityIcons name={icon as any} size={20} color={danger ? "#FF5A5A" : "#F26B1F"} />
      <Text
        className={`flex-1 ml-md text-body-md ${danger ? "text-error" : "text-on-surface dark:text-d-on-surface"}`}
      >
        {label}
      </Text>
      {!danger && <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />}
    </TouchableOpacity>
  );
}

function TrackingToggleRow({
  icon,
  label,
  description,
  value,
  onValueChange,
}: {
  icon: string;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl mb-xs">
      <MaterialCommunityIcons name={icon as any} size={20} color="#F26B1F" />
      <View className="flex-1 ml-md">
        <Text className="text-body-md text-on-surface dark:text-d-on-surface">{label}</Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
        thumbColor="#fff"
      />
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colorScheme, toggle } = useTheme();
  const { languageName, t, toggleLanguage } = useLanguage();
  const { stepsEnabled, sleepEnabled, setStepsEnabled, setSleepEnabled } = useTrackingPreferences();
  const [user, setUser] = useState<UserInfo | null>(null);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (u) {
      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "display_name, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at",
        )
        .eq("user_id", u.id)
        .maybeSingle();
      const proProfile = profile as ProAccessProfile | null;
      const proAccess = resolveProAccess(proProfile);
      setUser({
        displayName:
          (profile?.display_name as string | null | undefined) ??
          (u.user_metadata?.full_name as string | undefined) ??
          u.email?.split("@")[0] ??
          t("there"),
        email: u.email ?? null,
        avatarUrl: avatarFromUser(u),
        subscriptionLabel: subscriptionStatusLabel(proProfile),
        hasPro: proAccess.hasPro,
      });
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSignOut() {
    showAlert(t("Sign out?"), t("You can sign back in any time."), [
      { text: t("Cancel"), style: "cancel" },
      { text: t("Sign out"), style: "destructive", onPress: () => signOut() },
    ]);
  }

  function openAiCoach() {
    router.push("/settings/coach");
  }

  async function handleRateLagan() {
    const opened = await requestReviewManually();
    if (!opened) {
      showAlert(
        t("Store unavailable"),
        t("Lagan's store page is not available on this device yet."),
      );
    }
  }

  async function handleStepToggle(next: boolean) {
    if (!next) {
      setStepsEnabled(false);
      return;
    }
    // Auto step tracking needs a device pedometer (mobile only). On web — and on
    // any device without one — mirror the sleep toggle: surface a message and
    // leave the switch off instead of flipping a preference that can never sync.
    if (!(await isStepTrackingAvailable())) {
      const message =
        Platform.OS === "web"
          ? t(
              "Automatic step tracking works in the Lagan iOS and Android app. You can still log steps manually on web.",
            )
          : t("Step tracking isn't available on this device.");
      showAlert(t("Step tracking"), message);
      return;
    }
    const status = await requestStepPermission();
    if (status === "granted") {
      setStepsEnabled(true);
      return;
    }
    const message =
      status === "providerUpdateRequired"
        ? t("Update Health Connect to enable step tracking.")
        : t("Allow motion access to enable step tracking.");
    showAlert(t("Step tracking"), message);
  }

  async function handleSleepToggle(next: boolean) {
    if (!next) {
      setSleepEnabled(false);
      return;
    }
    const status = await requestSleepPermission();
    if (status === "granted") {
      setSleepEnabled(true);
      return;
    }
    const message =
      status === "unavailable"
        ? Platform.OS === "web"
          ? t(
              "Automatic sleep sync works in the Lagan iOS and Android app. You can still log sleep manually on web.",
            )
          : t("Sleep sync isn't available on this device.")
        : status === "providerUpdateRequired"
          ? t("Update Health Connect to enable sleep tracking.")
          : t("Allow health access to enable sleep tracking.");
    showAlert(t("Sleep tracking"), message);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile pt-md pb-sm">
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">
            {t("Settings")}
          </Text>
        </View>

        {/* Profile card */}
        <TouchableOpacity
          className="mx-margin-mobile mb-lg flex-row items-center bg-surface-container dark:bg-d-surface-container rounded-xl p-md"
          onPress={() => router.push("/settings/profile")}
        >
          {user?.avatarUrl ? (
            <Image
              source={{ uri: user.avatarUrl }}
              className="w-14 h-14 rounded-full"
              resizeMode="cover"
            />
          ) : (
            <View className="w-14 h-14 rounded-full bg-primary-fixed items-center justify-center">
              <MaterialCommunityIcons name="account" size={28} color="#F26B1F" />
            </View>
          )}
          <View className="flex-1 ml-md">
            <Text
              className="text-body-lg text-on-surface dark:text-d-on-surface font-semibold"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {user?.displayName}
            </Text>
            <Text
              className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {user?.email}
            </Text>
            <Text className="text-label-sm text-primary font-semibold">
              {t(user?.subscriptionLabel ?? "Free")}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />
        </TouchableOpacity>

        {/* Appearance */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            {t("APPEARANCE")}
          </Text>
          <TouchableOpacity
            className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl"
            onPress={toggle}
          >
            <MaterialCommunityIcons
              name={colorScheme === "dark" ? "weather-night" : "weather-sunny"}
              size={20}
              color="#F26B1F"
            />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface">
              {colorScheme === "dark" ? t("Dark mode") : t("Light mode")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {t("Toggle")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Language */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            {t("LANGUAGE")}
          </Text>
          <TouchableOpacity
            className="flex-row items-center px-md py-sm bg-surface-container dark:bg-d-surface-container rounded-xl"
            onPress={toggleLanguage}
          >
            <MaterialCommunityIcons name="translate" size={20} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface">
              {t("Language")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {languageName}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tracking */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            {t("TRACKING")}
          </Text>
          <TrackingToggleRow
            icon="walk"
            label={t("Step tracking")}
            description={
              Platform.OS === "web"
                ? t("Auto-sync needs the Lagan mobile app. On web, log steps manually.")
                : t("Auto-sync steps from your device pedometer.")
            }
            value={stepsEnabled}
            onValueChange={handleStepToggle}
          />
          <TrackingToggleRow
            icon="sleep"
            label={t("Sleep tracking")}
            description={
              Platform.OS === "web"
                ? t("Auto-sync needs the Lagan mobile app. Synced sleep still shows here.")
                : t("Auto-sync sleep from Health Connect or Apple Health.")
            }
            value={sleepEnabled}
            onValueChange={handleSleepToggle}
          />
        </View>

        {/* Account */}
        <View className="px-margin-mobile mb-lg">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
            {t("ACCOUNT")}
          </Text>
          <SettingsRow
            icon="star-four-points"
            label={t("Lagan Pro")}
            onPress={() => router.push("/pro" as never)}
          />
          <SettingsRow
            icon="bell"
            label={t("Reminders")}
            onPress={() => router.push("/settings/reminders")}
          />
          <SettingsRow icon="message-text-outline" label={t("AI Coach")} onPress={openAiCoach} />
          <SettingsRow
            icon="message-alert-outline"
            label={t("Send Feedback")}
            onPress={() => router.push("/settings/feedback" as never)}
          />
          <SettingsRow icon="star-outline" label={t("Rate Lagan")} onPress={handleRateLagan} />
          <SettingsRow
            icon="email-outline"
            label={t("Contact Support")}
            onPress={() => router.push("/settings/feedback" as never)}
          />
          <SettingsRow
            icon="shield-lock"
            label={t("Security")}
            onPress={() => router.push("/settings/security")}
          />
          <SettingsRow
            icon="database-lock"
            label={t("Privacy & Data")}
            onPress={() => router.push("/settings/privacy" as never)}
          />
          <SettingsRow
            icon="file-document-outline"
            label={t("Terms & Conditions")}
            onPress={() => {
              if (!TERMS_URL) {
                showAlert(t("Not configured"), t("Set EXPO_PUBLIC_TERMS_URL in your environment."));
                return;
              }
              Linking.openURL(TERMS_URL);
            }}
          />
        </View>

        {/* Danger */}
        <View className="px-margin-mobile">
          <SettingsRow icon="logout" label={t("Sign out")} onPress={handleSignOut} danger />
        </View>

        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center mt-lg">
          {t("Version {version}", { version: APP_VERSION })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
