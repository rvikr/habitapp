import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import HabitProgressVisual from "@/components/habit-progress-visual";
import ProgressRing from "@/components/progress-ring";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import { useLanguage } from "@/components/language-provider";
import {
  getSleepDashboardData,
  getSleepPermissionStatus,
  manualLogSleep,
  syncLastNightSleep,
  type SleepDashboardData,
  type SleepPermissionStatus,
} from "@/lib/platform/sleep";
import type { SleepEntry } from "@/types/db";

const SLEEP_BG = "#e6deff";
const SLEEP_FG = "#F26B1F";

function formatHours(minutes: number | null | undefined, t: (message: string) => string): string {
  if (!minutes || minutes <= 0) return `0 ${t("hr")}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${t("hr")}`;
}

function statusLabel(
  status: SleepPermissionStatus | "checking" | "syncing" | "idle",
  t: (message: string) => string,
): string {
  if (status === "granted") return t("Auto-sync on");
  if (status === "undetermined") return t("Permission needed");
  if (status === "denied") return t("Permission is off");
  if (status === "providerUpdateRequired") return t("Health Connect update needed");
  if (status === "unavailable") return t("Sync unavailable");
  if (status === "syncing") return t("Syncing");
  if (status === "checking") return t("Checking");
  return t("Not checked");
}

const AUTO_SYNC_THROTTLE_MS = 15 * 60 * 1000;

function sourceLabel(source: SleepEntry["source"], t: (message: string) => string): string {
  if (source === "healthConnect") return "Health Connect";
  if (source === "healthKit") return "Apple Health";
  return t("Manual");
}

function scoreTone(score: number | null | undefined, t: (message: string) => string): string {
  if (score == null) return t("No score yet");
  if (score >= 85) return t("Great sleep");
  if (score >= 70) return t("Solid night");
  if (score >= 50) return t("Needs recovery");
  return t("Low sleep");
}

export default function SleepScreen() {
  const { language, t } = useLanguage();
  const [data, setData] = useState<SleepDashboardData | null>(null);
  const [status, setStatus] = useState<SleepPermissionStatus | "checking" | "syncing" | "idle">(
    "idle",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastAutoSyncAt = useRef(0);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const [dashboard, permission] = await Promise.all([
      getSleepDashboardData(options),
      getSleepPermissionStatus(),
    ]);
    setData(dashboard);
    setStatus(permission);
    return permission;
  }, []);

  const runSync = useCallback(async () => {
    const result = await syncLastNightSleep();
    if (!result.ok) {
      setStatus(result.status ?? "idle");
      setSyncError(result.error ?? null);
    } else {
      setSyncError(null);
    }
    await load({ force: true });
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const permission = await load();
        if (permission !== "granted") return;
        const now = Date.now();
        if (now - lastAutoSyncAt.current < AUTO_SYNC_THROTTLE_MS) return;
        lastAutoSyncAt.current = now;
        setStatus("syncing");
        await runSync();
      })();
    }, [load, runSync]),
  );

  const latest = data?.latestEntry ?? null;
  const targetMinutes = data?.targetMinutes ?? 480;
  const durationRatio = latest ? Math.min(latest.duration_minutes / targetMinutes, 1) : 0;
  const trend = [...(data?.entries ?? [])].slice(0, 7).reverse();

  async function handleRefresh() {
    setRefreshing(true);
    const permission = await load({ force: true });
    if (permission === "granted") {
      lastAutoSyncAt.current = Date.now();
      setStatus("syncing");
      await runSync();
    }
    setRefreshing(false);
  }

  async function handleSync() {
    if (busy) return;
    setBusy(true);
    setStatus("syncing");
    const result = await syncLastNightSleep();
    if (!result.ok) {
      setStatus(result.status ?? "idle");
      setSyncError(result.error ?? null);
      Alert.alert(t("Could not sync sleep"), result.error ?? t("Try again."));
    } else {
      setSyncError(null);
      lastAutoSyncAt.current = Date.now();
    }
    await load({ force: true });
    setBusy(false);
  }

  async function handleManualLog() {
    const value = Number(manualHours);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(t("Enter sleep hours"), t("Use a number like 7.5."));
      return;
    }
    setBusy(true);
    const result = await manualLogSleep(value);
    if (!result.ok) {
      Alert.alert(t("Could not log sleep"), result.error ?? t("Try again."));
    } else {
      setManualHours("");
    }
    await load({ force: true });
    setBusy(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View className="px-margin-mobile pt-md pb-sm">
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
            {t("Sleep tracker")}
          </Text>
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">
            {t("Last night")}
          </Text>
        </View>

        {data ? (
          <View
            className="mx-margin-mobile rounded-2xl p-lg gap-md"
            style={{ backgroundColor: SLEEP_BG }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-label-lg font-semibold" style={{ color: SLEEP_FG }}>
                  {scoreTone(latest?.score, t)}
                </Text>
                <Text className="text-display-sm font-bold" style={{ color: SLEEP_FG }}>
                  {latest ? latest.score : "--"}
                </Text>
                <Text className="text-body-sm" style={{ color: SLEEP_FG }}>
                  {latest
                    ? t("{hours} synced from {source}", {
                        hours: formatHours(latest.duration_minutes, t),
                        source: sourceLabel(latest.source, t),
                      })
                    : t("Sync or log sleep to calculate your score.")}
                </Text>
              </View>
              <ProgressRing
                progress={latest ? latest.score / 100 : 0}
                size={104}
                strokeWidth={9}
                color={SLEEP_FG}
                trackColor="#E6E0D5"
              >
                <HabitProgressVisual
                  visualType="sleep_moon"
                  progress={durationRatio}
                  size="compact"
                  color={SLEEP_FG}
                  trackColor="#FFC56B"
                />
              </ProgressRing>
            </View>

            <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md">
              <View className="flex-row items-center justify-between">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {formatHours(latest?.duration_minutes, t)} / {formatHours(targetMinutes, t)}
                </Text>
                <Text className="text-label-lg text-primary font-semibold">
                  {Math.round(durationRatio * 100)}%
                </Text>
              </View>
              <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden mt-sm">
                <View
                  className="h-2 rounded-full"
                  style={{ width: `${durationRatio * 100}%`, backgroundColor: SLEEP_FG }}
                />
              </View>
            </View>
          </View>
        ) : (
          <SleepHeroSkeleton />
        )}

        {data ? (
          <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
            <View className="flex-row items-center gap-sm">
              <MaterialCommunityIcons
                name={status === "granted" ? "check-circle" : "alert-circle-outline"}
                size={22}
                color={SLEEP_FG}
              />
              <View className="flex-1">
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {statusLabel(status, t)}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {status === "granted" && !syncError
                    ? t("Last night's sleep syncs automatically when you open this screen.")
                    : t(
                        "iOS uses Apple Health. Android uses Health Connect. Web supports manual logging.",
                      )}
                </Text>
                {syncError ? (
                  <Text className="text-label-sm mt-xs" style={{ color: SLEEP_FG }}>
                    {syncError}
                  </Text>
                ) : null}
              </View>
            </View>
            {status !== "granted" || syncError ? (
              <TouchableOpacity
                className="bg-primary rounded-full py-sm items-center"
                onPress={handleSync}
                disabled={busy}
                style={{ opacity: busy ? 0.6 : 1 }}
              >
                {busy && status === "syncing" ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-on-primary text-label-lg font-semibold">
                    {status === "granted" ? t("Try sync again") : t("Sync recent sleep")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <SleepStatusSkeleton />
        )}

        <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
          <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
            {t("Manual fallback")}
          </Text>
          <View className="flex-row gap-sm">
            <TextInput
              className="flex-1 bg-surface-lowest dark:bg-d-surface-lowest text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder={t("Hours, e.g. 7.5")}
              placeholderTextColor="#8F8A82"
              value={manualHours}
              onChangeText={setManualHours}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              className="bg-primary px-md rounded-full items-center justify-center"
              onPress={handleManualLog}
              disabled={busy}
              style={{ opacity: busy ? 0.6 : 1 }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">{t("Log")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            {t("7-DAY TREND")}
          </Text>
          {!data ? (
            <SleepTrendSkeleton />
          ) : trend.length === 0 ? (
            <View className="items-center py-lg gap-xs">
              <MaterialCommunityIcons name="sleep" size={36} color={SLEEP_FG} />
              <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
                {t("Sleep scores will appear here after your first sync or manual log.")}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-end justify-between" style={{ height: 142 }}>
              {trend.map((entry) => {
                const height = Math.max(12, Math.round((entry.score / 100) * 92));
                const date = new Date(`${entry.sleep_date}T12:00:00`);
                return (
                  <View key={entry.id} className="items-center gap-xs" style={{ width: 38 }}>
                    <Text className="text-label-sm text-on-surface dark:text-d-on-surface font-semibold">
                      {entry.score}
                    </Text>
                    <View
                      className="w-7 rounded-full"
                      style={{ height, backgroundColor: SLEEP_FG }}
                    />
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {date
                        .toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", {
                          weekday: "short",
                        })
                        .slice(0, 2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {latest?.stage_minutes && (
          <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">
              {t("SLEEP DETAIL")}
            </Text>
            <Text className="text-body-sm text-on-surface dark:text-d-on-surface">
              {t("Deep {deep} · REM {rem} · Awake {awake}", {
                deep: formatHours(latest.stage_minutes.deep ?? 0, t),
                rem: formatHours(latest.stage_minutes.rem ?? 0, t),
                awake: formatHours(latest.stage_minutes.awake ?? 0, t),
              })}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SleepHeroSkeleton() {
  return (
    <View className="mx-margin-mobile rounded-2xl p-lg gap-md bg-surface-container dark:bg-d-surface-container">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 gap-sm">
          <SkeletonText width={104} />
          <SkeletonText className="h-12" width={76} />
          <SkeletonText width="82%" />
        </View>
        <Skeleton className="rounded-full" style={{ width: 104, height: 104 }} />
      </View>
      <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-sm">
        <View className="flex-row justify-between">
          <SkeletonText width={120} />
          <SkeletonText width={44} />
        </View>
        <Skeleton className="h-2 rounded-full" />
      </View>
    </View>
  );
}

function SleepStatusSkeleton() {
  return (
    <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
      <View className="flex-row items-center gap-sm">
        <Skeleton className="w-7 h-7 rounded-full" />
        <View className="flex-1 gap-xs">
          <SkeletonText width="48%" />
          <SkeletonText className="h-3" width="88%" />
        </View>
      </View>
      <Skeleton className="h-10 rounded-full" />
    </View>
  );
}

function SleepTrendSkeleton() {
  return (
    <View className="flex-row items-end justify-between" style={{ height: 142 }}>
      {[0, 1, 2, 3, 4, 5, 6].map((item) => (
        <View key={item} className="items-center gap-xs" style={{ width: 38 }}>
          <SkeletonText className="h-3" width={24} />
          <Skeleton className="w-7 rounded-full" style={{ height: 32 + item * 8 }} />
          <SkeletonText className="h-3" width={20} />
        </View>
      ))}
    </View>
  );
}
