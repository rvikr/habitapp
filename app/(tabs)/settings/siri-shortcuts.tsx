import { useCallback, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { Linking, Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLanguage } from "@/components/language-provider";
import { showAlert } from "@/lib/platform/alert";
import { hasValidHomeWidgetActionSession } from "@/lib/platform/home-widget";
import {
  ensureHomeWidgetActionSession,
  WIDGET_BACKGROUND_ACTIONS_ENABLED,
} from "@/lib/widgets/widget-session";

type ShortcutStatus = "checking" | "ready" | "setup_required" | "unsupported";

function supportsAppIntents(): boolean {
  if (Platform.OS !== "ios") return false;
  const major = Number.parseInt(String(Platform.Version).split(".")[0] ?? "0", 10);
  return Number.isFinite(major) && major >= 16;
}

export default function SiriShortcutsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [status, setStatus] = useState<ShortcutStatus>("checking");

  const refreshStatus = useCallback(async () => {
    if (!supportsAppIntents()) {
      setStatus("unsupported");
      return;
    }
    if (!WIDGET_BACKGROUND_ACTIONS_ENABLED) {
      setStatus("setup_required");
      return;
    }
    setStatus("checking");
    await ensureHomeWidgetActionSession();
    setStatus((await hasValidHomeWidgetActionSession()) ? "ready" : "setup_required");
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshStatus();
    }, [refreshStatus]),
  );

  const statusCopy =
    status === "ready"
      ? {
          icon: "check-circle" as const,
          color: "#3EBB7F",
          title: t("Ready for Siri"),
          body: t("Siri can log your Lagan habits without opening the app."),
        }
      : status === "unsupported"
        ? {
            icon: "information-outline" as const,
            color: "#8F8A82",
            title: t("Requires iOS 16 or later"),
            body: t("You can continue logging habits inside Lagan."),
          }
        : {
            icon: status === "checking" ? ("progress-clock" as const) : ("lock-outline" as const),
            color: "#F26B1F",
            title: status === "checking" ? t("Checking setup") : t("Open Today to finish setup"),
            body: t("Lagan securely prepares Siri after your habits sync."),
          };

  async function openShortcuts() {
    try {
      await Linking.openURL("shortcuts://");
    } catch {
      showAlert(t("Shortcuts unavailable"), t("Open Apple's Shortcuts app on this iPhone."));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-md">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Back")}
          className="w-10 h-10 items-center justify-center"
          onPress={() => router.back()}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text className="flex-1 text-headline-md text-on-background dark:text-d-on-background font-bold ml-sm">
          {t("Siri & Shortcuts")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg mb-lg">
          <View className="flex-row items-center mb-sm">
            <MaterialCommunityIcons name={statusCopy.icon} size={24} color={statusCopy.color} />
            <Text className="text-title-md text-on-surface dark:text-d-on-surface font-bold ml-sm">
              {statusCopy.title}
            </Text>
          </View>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
            {statusCopy.body}
          </Text>
        </View>

        <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm">
          {t("TRY SAYING")}
        </Text>
        <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg mb-lg">
          <Text className="text-body-lg text-on-surface dark:text-d-on-surface font-semibold mb-md">
            “{t("Hey Siri, log Water with Lagan")}”
          </Text>
          <Text className="text-body-lg text-on-surface dark:text-d-on-surface font-semibold">
            “{t("Hey Siri, log a habit with Lagan")}”
          </Text>
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-md">
            {t("The generic phrase asks you which habit to log.")}
          </Text>
        </View>

        <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg mb-lg">
          <Text className="text-title-md text-on-surface dark:text-d-on-surface font-bold mb-sm">
            {t("What gets logged")}
          </Text>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
            {t(
              "Siri uses your habit's default check-in amount and never logs beyond today's target.",
            )}
          </Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Open Shortcuts")}
          className="bg-primary rounded-full py-md px-lg items-center"
          disabled={status === "unsupported"}
          style={{ opacity: status === "unsupported" ? 0.5 : 1 }}
          onPress={openShortcuts}
        >
          <Text className="text-on-primary font-bold text-body-lg">{t("Open Shortcuts")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
