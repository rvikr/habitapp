import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { requestAccountDeletion, signInWithGoogle } from "@/lib/data/actions";
import { hasPasswordIdentity } from "@/lib/auth/identity";
import { getCurrentUser } from "@/lib/supabase/client";
import { exportMyData } from "@/lib/utils/privacy";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "@/lib/services/analytics";
import { isSentryOptedOut, setSentryOptOut } from "@/lib/services/sentry";
import { useLanguage } from "@/components/language-provider";
import {
  AI_DISCLOSURE_VERSION,
  getAiAccessProfile,
  setAiAdultAttestation,
  type AiAccessProfile,
} from "@/lib/services/ai-access";

const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || "https://lagan.health/privacy";
const ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || "https://lagan.health/account-deletion";

export default function PrivacyScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [analyticsOff, setAnalyticsOff] = useState(false);
  const [crashReportsOff, setCrashReportsOff] = useState(false);
  const [reason, setReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [savingDeletion, setSavingDeletion] = useState(false);
  // Assume a password account until the user loads; OAuth-only accounts
  // confirm deletion with a fresh Google sign-in instead of a password.
  const [usesPassword, setUsesPassword] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [aiAccess, setAiAccess] = useState<AiAccessProfile | null>(null);
  const [savingAiAccess, setSavingAiAccess] = useState(false);
  const hasCurrentAiAttestation = Boolean(
    aiAccess?.attestedAt && aiAccess.disclosureVersion === AI_DISCLOSURE_VERSION,
  );

  useEffect(() => {
    Promise.all([isAnalyticsOptedOut(), isSentryOptedOut()]).then(
      ([analyticsOptedOut, sentryOptedOut]) => {
        setAnalyticsOff(analyticsOptedOut);
        setCrashReportsOff(sentryOptedOut);
      },
    );
    getCurrentUser().then((user) => {
      if (user) setUsesPassword(hasPasswordIdentity(user));
    });
    getAiAccessProfile()
      .then(setAiAccess)
      .catch(() => setAiAccess(null));
  }, []);

  async function toggleAnalytics(next: boolean) {
    setAnalyticsOff(next);
    await setAnalyticsOptOut(next);
  }

  async function toggleCrashReports(next: boolean) {
    setCrashReportsOff(next);
    await setSentryOptOut(next);
  }

  async function updateAiAccess(attested: boolean) {
    setSavingAiAccess(true);
    try {
      await setAiAdultAttestation(attested);
      setAiAccess(await getAiAccessProfile());
    } catch {
      showAlert(t("Could not update AI access"), t("Try again."));
    } finally {
      setSavingAiAccess(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportMyData();
    setExporting(false);
    if (!result.ok) {
      showAlert(t("Could not export data"), t(result.error ?? "Try again."));
      return;
    }
    setExportText(result.data ?? "{}");
  }

  async function performDeletion() {
    setSavingDeletion(true);
    const result = await requestAccountDeletion(reason, deletePassword);
    setSavingDeletion(false);
    if (result.ok) {
      setReason("");
      setDeletePassword("");
      router.replace("/login");
      return;
    }
    if (result.needsReauth) {
      // OAuth-only account with a stale session: confirm identity with a
      // fresh Google sign-in, then retry. On web this may redirect the page;
      // after returning, tapping "Request deletion" again completes it.
      showAlert(
        t("Confirm it's you"),
        t("Sign in with Google again to confirm, then we'll delete your account."),
        [
          { text: t("Cancel"), style: "cancel" },
          {
            text: t("Continue with Google"),
            onPress: async () => {
              const { error, cancelled } = await signInWithGoogle();
              if (cancelled) return;
              if (error) {
                showAlert(t("Could not confirm"), t(error.message ?? "Try again."));
                return;
              }
              setSavingDeletion(true);
              const retry = await requestAccountDeletion(reason, deletePassword);
              setSavingDeletion(false);
              if (!retry.ok) {
                showAlert(t("Could not delete account"), t(retry.error ?? "Try again."));
                return;
              }
              setReason("");
              setDeletePassword("");
              router.replace("/login");
            },
          },
        ],
      );
      return;
    }
    showAlert(t("Could not delete account"), t(result.error ?? "Try again."));
  }

  function handleDeletionRequest() {
    if (usesPassword && !deletePassword.trim()) {
      showAlert(
        t("Password required"),
        t("Confirm your password before requesting account deletion."),
      );
      return;
    }
    showAlert(
      t("Delete account?"),
      t(
        "This permanently removes your account and all your data (habits, completions, profile). This cannot be undone.",
      ),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Delete forever"),
          style: "destructive",
          onPress: () => void performDeletion(),
        },
      ],
    );
  }

  function openPrivacyPolicy() {
    if (!PRIVACY_POLICY_URL) {
      showAlert(
        t("Privacy policy URL missing"),
        t("Set EXPO_PUBLIC_PRIVACY_POLICY_URL before submitting to the stores."),
      );
      return;
    }
    Linking.openURL(PRIVACY_POLICY_URL);
  }

  function openAccountDeletionPage() {
    if (!ACCOUNT_DELETION_URL) {
      showAlert(
        t("Account deletion URL missing"),
        t("Set EXPO_PUBLIC_ACCOUNT_DELETION_URL before submitting to the stores."),
      );
      return;
    }
    Linking.openURL(ACCOUNT_DELETION_URL);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
          onPress={() => router.back()}
          className="mr-md"
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          {t("Privacy & Data")}
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-md">
          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
            <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              {t("Gemini AI access (18+)")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {t(
                "Lagan sends only the habit and progress context needed for an AI feature to Google Gemini. AI can be inaccurate and is not medical advice. We record your 18+ confirmation, not your birth date.",
              )}
            </Text>
            {aiAccess?.state === "feature_disabled" ? (
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("All Gemini features are currently disabled.")}
              </Text>
            ) : null}
            <TouchableOpacity
              className={`rounded-full py-sm items-center ${
                hasCurrentAiAttestation ? "bg-error-container" : "bg-primary"
              }`}
              accessibilityRole="button"
              accessibilityLabel={
                savingAiAccess
                  ? t("Saving...")
                  : hasCurrentAiAttestation
                    ? t("Revoke AI access")
                    : t("I confirm I am 18 or older")
              }
              accessibilityState={{ disabled: savingAiAccess }}
              onPress={() => {
                if (!savingAiAccess) void updateAiAccess(!hasCurrentAiAttestation);
              }}
            >
              <Text
                className={`text-label-lg font-semibold ${
                  hasCurrentAiAttestation ? "text-on-error-container" : "text-on-primary"
                }`}
              >
                {savingAiAccess
                  ? t("Saving...")
                  : hasCurrentAiAttestation
                    ? t("Revoke AI access")
                    : t("I confirm I am 18 or older")}
              </Text>
            </TouchableOpacity>
            {hasCurrentAiAttestation ? (
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Revoking immediately switches AI features back to deterministic fallbacks.")}
              </Text>
            ) : null}
          </View>

          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-md">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {t("Analytics opt-out")}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t("Stops product analytics events on this device.")}
                </Text>
              </View>
              <Switch
                value={analyticsOff}
                onValueChange={toggleAnalytics}
                trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-md">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {t("Crash reporting opt-out")}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t("Stops crash reports from being sent from this device.")}
                </Text>
              </View>
              <Switch
                value={crashReportsOff}
                onValueChange={toggleCrashReports}
                trackColor={{ false: "#E6E0D5", true: "#F26B1F" }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={exporting ? t("Exporting...") : t("View my data export")}
            accessibilityState={{ disabled: exporting }}
            onPress={() => {
              if (!exporting) void handleExport();
            }}
          >
            <MaterialCommunityIcons name="file-export-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              {t("View my data export")}
            </Text>
            {exporting ? (
              <Text className="text-label-sm text-primary font-semibold">{t("Exporting...")}</Text>
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={t("Privacy policy")}
            onPress={openPrivacyPolicy}
          >
            <MaterialCommunityIcons name="shield-account-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              {t("Privacy policy")}
            </Text>
            <MaterialCommunityIcons name="open-in-new" size={20} color="#8F8A82" />
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center"
            accessibilityRole="button"
            accessibilityLabel={t("Account deletion page")}
            onPress={openAccountDeletionPage}
          >
            <MaterialCommunityIcons name="account-remove-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              {t("Account deletion page")}
            </Text>
            <MaterialCommunityIcons name="open-in-new" size={20} color="#8F8A82" />
          </TouchableOpacity>

          <View className="bg-error-container rounded-xl p-md gap-sm">
            <Text className="text-body-md text-on-error-container font-semibold">
              {t("Request account deletion")}
            </Text>
            <TextInput
              className="bg-surface-lowest text-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder={t("Optional note")}
              placeholderTextColor="#8F8A82"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />
            {usesPassword ? (
              <TextInput
                className="bg-surface-lowest text-on-surface rounded-xl px-md py-sm text-body-md"
                placeholder={t("Confirm password")}
                placeholderTextColor="#8F8A82"
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                textContentType="password"
                autoCapitalize="none"
              />
            ) : (
              <Text className="text-label-sm text-on-error-container">
                {t(
                  "You signed in with Google, so there is no password to confirm. We may ask you to sign in with Google again before deleting.",
                )}
              </Text>
            )}
            <TouchableOpacity
              className="bg-error rounded-full py-sm items-center"
              accessibilityRole="button"
              accessibilityLabel={
                savingDeletion ? t("Requesting deletion...") : t("Request deletion")
              }
              accessibilityState={{ disabled: savingDeletion }}
              onPress={() => {
                if (!savingDeletion) handleDeletionRequest();
              }}
            >
              <Text className="text-on-error text-label-lg font-semibold">
                {savingDeletion ? t("Requesting deletion...") : t("Request deletion")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={exportText != null}
        animationType="slide"
        onRequestClose={() => setExportText(null)}
      >
        <SafeAreaView className="flex-1 bg-background dark:bg-d-background">
          <View className="flex-row items-center justify-between px-margin-mobile py-sm">
            <View className="flex-1 mr-md">
              <Text className="text-headline-md text-on-background dark:text-d-on-background">
                {t("Data export")}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Includes integrity checks for counts, duplicates, and orphaned logs.")}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("Close data export")}
              onPress={() => setExportText(null)}
            >
              <MaterialCommunityIcons name="close" size={24} color="#F26B1F" />
            </TouchableOpacity>
          </View>
          <ScrollView className="flex-1 px-margin-mobile">
            <Text className="text-label-sm text-on-surface dark:text-d-on-surface font-mono">
              {exportText}
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
