import { useCallback, useMemo, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useFocusEffect, useRouter } from "expo-router";
import { ScrollView, Share, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLanguage } from "@/components/language-provider";
import { showAlert } from "@/lib/platform/alert";
import { clearHomeWidgetDiagnostics, getHomeWidgetDiagnostics } from "@/lib/platform/home-widget";
import {
  formatHomeWidgetDiagnostics,
  type HomeWidgetDiagnosticEntry,
} from "@/lib/widgets/widget-diagnostics";

function entryText(entry: HomeWidgetDiagnosticEntry): string {
  const details = [
    entry.category && `category=${entry.category}`,
    entry.httpStatus != null && `http=${entry.httpStatus}`,
    entry.operationId && `operation=${entry.operationId}`,
  ].filter(Boolean);
  return [
    new Date(entry.timestampMs).toLocaleString(),
    entry.stage,
    ...details,
    `app=${entry.appVersion} (${entry.buildNumber})`,
    `runtime=${entry.runtimeVersion}`,
    `os=${entry.osVersion}`,
  ].join("\n");
}

export default function WidgetDiagnosticsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [entries, setEntries] = useState<HomeWidgetDiagnosticEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const shareText = useMemo(() => formatHomeWidgetDiagnostics(entries), [entries]);

  const load = useCallback(async () => {
    setLoading(true);
    setEntries(await getHomeWidgetDiagnostics());
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function confirmClear() {
    showAlert(
      t("Clear widget diagnostics?"),
      t("This removes diagnostic events stored on this iPhone."),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Clear"),
          style: "destructive",
          onPress: () => {
            void clearHomeWidgetDiagnostics().then(() => setEntries([]));
          },
        },
      ],
    );
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
          {t("Widget Diagnostics")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}>
        <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg mb-md">
          <View className="flex-row items-center mb-sm">
            <MaterialCommunityIcons name="shield-check-outline" size={22} color="#3EBB7F" />
            <Text className="flex-1 text-title-md text-on-surface dark:text-d-on-surface font-bold ml-sm">
              {t("Privacy-safe device log")}
            </Text>
          </View>
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant">
            {t(
              "Contains widget execution stages, response categories, and build information. It never includes your account, habits, server URL, or credentials.",
            )}
          </Text>
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-sm">
            {t("The newest 50 events are kept for up to 7 days.")}
          </Text>
        </View>

        <View className="flex-row mb-md">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("Share diagnostics")}
            className="flex-1 bg-primary rounded-full py-sm px-md items-center mr-xs"
            disabled={!entries.length}
            style={{ opacity: entries.length ? 1 : 0.5 }}
            onPress={() => void Share.share({ message: shareText })}
          >
            <Text className="text-on-primary font-bold text-body-md">{t("Share")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("Clear diagnostics")}
            className="flex-1 border border-error rounded-full py-sm px-md items-center ml-xs"
            disabled={!entries.length}
            style={{ opacity: entries.length ? 1 : 0.5 }}
            onPress={confirmClear}
          >
            <Text className="text-error font-bold text-body-md">{t("Clear")}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center py-lg">
            {t("Loading diagnostics…")}
          </Text>
        ) : entries.length ? (
          [...entries].reverse().map((entry, index) => (
            <View
              key={`${entry.timestampMs}-${entry.stage}-${index}`}
              className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md mb-sm"
            >
              <Text
                selectable
                className="text-label-sm text-on-surface dark:text-d-on-surface"
                style={{ fontFamily: "monospace" }}
              >
                {entryText(entry)}
              </Text>
            </View>
          ))
        ) : (
          <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg items-center">
            <MaterialCommunityIcons name="text-box-search-outline" size={32} color="#8F8A82" />
            <Text className="text-title-md text-on-surface dark:text-d-on-surface font-bold mt-sm">
              {t("No widget diagnostics yet")}
            </Text>
            <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center mt-xs">
              {t("Try the iOS widget Check in button, then return here.")}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
