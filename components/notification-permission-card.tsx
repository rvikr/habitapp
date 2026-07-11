import { useCallback, useState, useEffect } from "react";
import { useFocusEffect } from "expo-router";
import { Linking, Platform, View, Text, TouchableOpacity } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { requestPermission, getPermissionStatus } from "@/lib/platform/notifications";
import { getItem } from "@/lib/platform/storage";
import { useLanguage } from "@/components/language-provider";

// Web-only: detect iOS Safari (not standalone) so we can show install guidance
// instead of the push-permission Allow button, since iOS only allows push for
// installed (home-screen) PWAs.
function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export default function NotificationPermissionCard({
  suppressIfStorageKeyPresent,
}: {
  suppressIfStorageKeyPresent?: string;
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [checkedSuppressionKey, setCheckedSuppressionKey] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);

  useEffect(() => {
    getPermissionStatus().then(setStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!suppressIfStorageKeyPresent) {
        setCheckedSuppressionKey(null);
        setSuppressed(false);
        return () => {
          cancelled = true;
        };
      }

      setCheckedSuppressionKey(null);
      setSuppressed(false);
      void getItem(suppressIfStorageKeyPresent)
        .then((value) => {
          if (!cancelled) setSuppressed(value === "1");
        })
        .catch(() => {
          if (!cancelled) setSuppressed(false);
        })
        .finally(() => {
          if (!cancelled) setCheckedSuppressionKey(suppressIfStorageKeyPresent);
        });
      return () => {
        cancelled = true;
      };
    }, [suppressIfStorageKeyPresent]),
  );

  if (
    status === "granted" ||
    suppressed ||
    (suppressIfStorageKeyPresent && checkedSuppressionKey !== suppressIfStorageKeyPresent)
  ) {
    return null;
  }

  // On iOS Safari (not installed), push isn't available yet. Guide the user
  // to install the PWA first instead of showing a non-functional Allow button.
  const showIosInstallGuide =
    Platform.OS === "web" && isIosBrowser() && !isStandalone() && status !== "denied";

  if (showIosInstallGuide) {
    return (
      <View className="bg-surface-container dark:bg-d-surface rounded-2xl border border-outline-variant dark:border-d-outline-variant p-md flex-row items-center gap-md mx-margin-mobile mb-md">
        <MaterialCommunityIcons name="cellphone-arrow-down" size={24} color="#F26B1F" />
        <View className="flex-1">
          <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
            {t("Get habit reminders on iPhone")}
          </Text>
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
            {t(
              "Tap Share → Add to Home Screen, then open Lagan from your home screen to enable notifications.",
            )}
          </Text>
        </View>
      </View>
    );
  }

  // When denied, the OS won't show the permission dialog again, so on native we
  // deep-link straight to the app's system settings instead of a dead-end label.
  // On web the browser can't be reopened programmatically, so we keep guidance.
  const deniedOnNative = status === "denied" && Platform.OS !== "web";

  return (
    <View className="bg-surface-container dark:bg-d-surface rounded-2xl border border-outline-variant dark:border-d-outline-variant p-md flex-row items-center gap-md mx-margin-mobile mb-md">
      <MaterialCommunityIcons name="bell-alert" size={24} color="#F26B1F" />
      <View className="flex-1">
        <Text className="text-body-md text-on-background dark:text-d-on-background font-semibold">
          {t("Enable notifications")}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {status === "denied"
            ? deniedOnNative
              ? t("Notifications are off — turn them on to get habit reminders.")
              : t("Notifications blocked — enable in Settings.")
            : t("Allow notifications for habit reminders.")}
        </Text>
      </View>
      {status === "undetermined" && (
        <TouchableOpacity
          className="bg-primary px-md py-xs rounded-full"
          accessibilityRole="button"
          onPress={async () => {
            const granted = await requestPermission();
            setStatus(granted ? "granted" : "denied");
          }}
        >
          <Text className="text-on-primary text-label-sm font-semibold">{t("Allow")}</Text>
        </TouchableOpacity>
      )}
      {deniedOnNative && (
        <TouchableOpacity
          className="bg-primary px-md py-xs rounded-full"
          accessibilityRole="button"
          onPress={() => {
            void Linking.openSettings();
          }}
        >
          <Text className="text-on-primary text-label-sm font-semibold">{t("Settings")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
