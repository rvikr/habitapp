import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { requestAccountDeletion } from "@/lib/data/actions";
import { exportMyData } from "@/lib/utils/privacy";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "@/lib/services/analytics";
import { isSentryOptedOut, setSentryOptOut } from "@/lib/services/sentry";

const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || "https://lagan.health/privacy";
const ACCOUNT_DELETION_URL =
  process.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL || "https://lagan.health/account-deletion";

export default function PrivacyScreen() {
  const router = useRouter();
  const [analyticsOff, setAnalyticsOff] = useState(false);
  const [crashReportsOff, setCrashReportsOff] = useState(false);
  const [reason, setReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [savingDeletion, setSavingDeletion] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([isAnalyticsOptedOut(), isSentryOptedOut()]).then(
      ([analyticsOptedOut, sentryOptedOut]) => {
        setAnalyticsOff(analyticsOptedOut);
        setCrashReportsOff(sentryOptedOut);
      },
    );
  }, []);

  async function toggleAnalytics(next: boolean) {
    setAnalyticsOff(next);
    await setAnalyticsOptOut(next);
  }

  async function toggleCrashReports(next: boolean) {
    setCrashReportsOff(next);
    await setSentryOptOut(next);
  }

  async function handleExport() {
    setExporting(true);
    const result = await exportMyData();
    setExporting(false);
    if (!result.ok) {
      Alert.alert("Could not export data", result.error ?? "Try again.");
      return;
    }
    setExportText(result.data ?? "{}");
  }

  function handleDeletionRequest() {
    if (!deletePassword.trim()) {
      Alert.alert("Password required", "Confirm your password before requesting account deletion.");
      return;
    }
    Alert.alert(
      "Delete account?",
      "This permanently removes your account and all your data (habits, completions, profile). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete forever",
          style: "destructive",
          onPress: async () => {
            setSavingDeletion(true);
            const result = await requestAccountDeletion(reason, deletePassword);
            setSavingDeletion(false);
            if (!result.ok) {
              Alert.alert("Could not delete account", result.error ?? "Try again.");
              return;
            }
            setReason("");
            setDeletePassword("");
            router.replace("/login");
          },
        },
      ],
    );
  }

  function openPrivacyPolicy() {
    if (!PRIVACY_POLICY_URL) {
      Alert.alert(
        "Privacy policy URL missing",
        "Set EXPO_PUBLIC_PRIVACY_POLICY_URL before submitting to the stores.",
      );
      return;
    }
    Linking.openURL(PRIVACY_POLICY_URL);
  }

  function openAccountDeletionPage() {
    if (!ACCOUNT_DELETION_URL) {
      Alert.alert(
        "Account deletion URL missing",
        "Set EXPO_PUBLIC_ACCOUNT_DELETION_URL before submitting to the stores.",
      );
      return;
    }
    Linking.openURL(ACCOUNT_DELETION_URL);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity onPress={() => router.back()} className="mr-md">
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="text-headline-md text-on-background dark:text-d-on-background">
          Privacy & Data
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-margin-mobile gap-md">
          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
            <View className="flex-row items-center justify-between">
              <View className="flex-1 mr-md">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  Analytics opt-out
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  Stops product analytics events on this device.
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
                  Crash reporting opt-out
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  Stops crash reports from being sent from this device.
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
            onPress={handleExport}
          >
            <MaterialCommunityIcons name="file-export-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              View my data export
            </Text>
            {exporting ? (
              <ActivityIndicator color="#F26B1F" />
            ) : (
              <MaterialCommunityIcons name="chevron-right" size={20} color="#8F8A82" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center"
            onPress={openPrivacyPolicy}
          >
            <MaterialCommunityIcons name="shield-account-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              Privacy policy
            </Text>
            <MaterialCommunityIcons name="open-in-new" size={20} color="#8F8A82" />
          </TouchableOpacity>

          <TouchableOpacity
            className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center"
            onPress={openAccountDeletionPage}
          >
            <MaterialCommunityIcons name="account-remove-outline" size={22} color="#F26B1F" />
            <Text className="flex-1 ml-md text-body-md text-on-surface dark:text-d-on-surface font-semibold">
              Account deletion page
            </Text>
            <MaterialCommunityIcons name="open-in-new" size={20} color="#8F8A82" />
          </TouchableOpacity>

          <View className="bg-error-container rounded-xl p-md gap-sm">
            <Text className="text-body-md text-on-error-container font-semibold">
              Request account deletion
            </Text>
            <TextInput
              className="bg-surface-lowest text-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="Optional note"
              placeholderTextColor="#8F8A82"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
            />
            <TextInput
              className="bg-surface-lowest text-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="Confirm password"
              placeholderTextColor="#8F8A82"
              value={deletePassword}
              onChangeText={setDeletePassword}
              secureTextEntry
              textContentType="password"
              autoCapitalize="none"
            />
            <TouchableOpacity
              className="bg-error rounded-full py-sm items-center"
              onPress={handleDeletionRequest}
              disabled={savingDeletion}
            >
              {savingDeletion ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-on-error text-label-lg font-semibold">Request deletion</Text>
              )}
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
                Data export
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                Includes integrity checks for counts, duplicates, and orphaned logs.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setExportText(null)}>
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
