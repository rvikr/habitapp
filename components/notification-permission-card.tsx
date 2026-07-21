import { useCallback, useState, useEffect, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { AppState, Linking, Platform, View, Text, TouchableOpacity } from "react-native";
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
  onShown,
}: {
  suppressIfStorageKeyPresent?: string;
  onShown?: () => void;
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [checkedSuppressionKey, setCheckedSuppressionKey] = useState<string | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const shownRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await getPermissionStatus();
      if (mountedRef.current) setStatus(nextStatus);
    } catch {
      // ignore — keep last known status
    } finally {
      if (mountedRef.current) setPermissionChecked(true);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Re-check the OS permission whenever the app returns to the foreground. The
  // "denied" branch deep-links to device Settings; coming back is a
  // background→foreground (AppState "active") transition — not a remount or a
  // navigation focus event — so without this the granted state stays stale and
  // the banner lingers until the next app restart.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshStatus();
    });
    return () => sub.remove();
  }, [refreshStatus]);

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

  const cardVisible =
    permissionChecked &&
    status !== "granted" &&
    !suppressed &&
    (!suppressIfStorageKeyPresent || checkedSuppressionKey === suppressIfStorageKeyPresent);
  const visible = cardVisible && status === "undetermined";

  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      return;
    }
    if (shownRef.current) return;
    shownRef.current = true;
    onShown?.();
  }, [onShown, visible]);

  if (!cardVisible) return null;

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
