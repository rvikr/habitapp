import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import HabitProgressVisual from "@/components/habit-progress-visual";
import ProgressRing from "@/components/progress-ring";
import { useTheme } from "@/components/theme-provider";
import {
  getSleepDashboardData,
  getSleepPermissionStatus,
  manualLogSleep,
  syncLastNightSleep,
  type SleepDashboardData,
  type SleepPermissionStatus,
} from "@/lib/sleep";
import type { SleepEntry } from "@/types/db";

const SLEEP_BG = "#e6deff";
const SLEEP_FG = "#F26B1F";

function formatHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "0 hr";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hr`;
}

function statusLabel(status: SleepPermissionStatus | "checking" | "syncing" | "idle"): string {
  if (status === "granted") return "Ready to sync";
  if (status === "undetermined") return "Permission needed";
  if (status === "denied") return "Permission is off";
  if (status === "providerUpdateRequired") return "Health Connect update needed";
  if (status === "unavailable") return "Sync unavailable";
  if (status === "syncing") return "Syncing";
  if (status === "checking") return "Checking";
  return "Not checked";
}

function sourceLabel(source: SleepEntry["source"]): string {
  if (source === "healthConnect") return "Health Connect";
  if (source === "healthKit") return "Apple Health";
  return "Manual";
}

function scoreTone(score: number | null | undefined): string {
  if (score == null) return "No score yet";
  if (score >= 85) return "Great sleep";
  if (score >= 70) return "Solid night";
  if (score >= 50) return "Needs recovery";
  return "Low sleep";
}

export default function SleepScreen() {
  const { colorScheme } = useTheme();
  const track = colorScheme === "dark" ? "#3d3450" : "#E6E0D5";
  const [data, setData] = useState<SleepDashboardData | null>(null);
  const [status, setStatus] = useState<SleepPermissionStatus | "checking" | "syncing" | "idle">("idle");
  const [refreshing, setRefreshing] = useState(false);
  const [manualHours, setManualHours] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [dashboard, permission] = await Promise.all([getSleepDashboardData(), getSleepPermissionStatus()]);
    setData(dashboard);
    setStatus(permission);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const latest = data?.latestEntry ?? null;
  const targetMinutes = data?.targetMinutes ?? 480;
  const durationRatio = latest ? Math.min(latest.duration_minutes / targetMinutes, 1) : 0;
  const trend = [...(data?.entries ?? [])].slice(0, 7).reverse();

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleSync() {
    if (busy) return;
    setBusy(true);
    setStatus("syncing");
    const result = await syncLastNightSleep();
    if (!result.ok) {
      setStatus(result.status ?? "idle");
      Alert.alert("Could not sync sleep", result.error ?? "Try again.");
    }
    await load();
    setBusy(false);
  }

  async function handleManualLog() {
    const value = Number(manualHours);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert("Enter sleep hours", "Use a number like 7.5.");
      return;
    }
    setBusy(true);
    const result = await manualLogSleep(value);
    if (!result.ok) {
      Alert.alert("Could not log sleep", result.error ?? "Try again.");
    } else {
      setManualHours("");
    }
    await load();
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
          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">Sleep tracker</Text>
          <Text className="text-headline-lg text-on-background dark:text-d-on-background">Last night</Text>
        </View>

        <View className="mx-margin-mobile rounded-2xl p-lg gap-md" style={{ backgroundColor: SLEEP_BG }}>
          <View className="flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-label-lg font-semibold" style={{ color: SLEEP_FG }}>{scoreTone(latest?.score)}</Text>
              <Text className="text-display-sm font-bold" style={{ color: SLEEP_FG }}>
                {latest ? latest.score : "--"}
              </Text>
              <Text className="text-body-sm" style={{ color: SLEEP_FG }}>
                {latest ? `${formatHours(latest.duration_minutes)} synced from ${sourceLabel(latest.source)}` : "Sync or log sleep to calculate your score."}
              </Text>
            </View>
            <ProgressRing
              progress={latest ? latest.score / 100 : 0}
              size={104}
              strokeWidth={9}
              color={SLEEP_FG}
              trackColor="#E6E0D5"
            >
              <HabitProgressVisual visualType="sleep_moon" progress={durationRatio} size="compact" color={SLEEP_FG} trackColor="#FFC56B" />
            </ProgressRing>
          </View>

          <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md">
            <View className="flex-row items-center justify-between">
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                {formatHours(latest?.duration_minutes)} / {formatHours(targetMinutes)}
              </Text>
              <Text className="text-label-lg text-primary font-semibold">{Math.round(durationRatio * 100)}%</Text>
            </View>
            <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden mt-sm">
              <View className="h-2 rounded-full" style={{ width: `${durationRatio * 100}%`, backgroundColor: SLEEP_FG }} />
            </View>
          </View>
        </View>

        <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
          <View className="flex-row items-center gap-sm">
            <MaterialCommunityIcons name={status === "granted" ? "check-circle" : "alert-circle-outline"} size={22} color={SLEEP_FG} />
            <View className="flex-1">
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">{statusLabel(status)}</Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                iOS uses Apple Health. Android uses Health Connect. Web supports manual logging.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            className="bg-primary rounded-full py-sm items-center"
            onPress={handleSync}
            disabled={busy}
            style={{ opacity: busy ? 0.6 : 1 }}
          >
            {busy && status === "syncing" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-on-primary text-label-lg font-semibold">Sync recent sleep</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
          <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">Manual fallback</Text>
          <View className="flex-row gap-sm">
            <TextInput
              className="flex-1 bg-surface-lowest dark:bg-d-surface-lowest text-on-surface dark:text-d-on-surface rounded-xl px-md py-sm text-body-md"
              placeholder="Hours, e.g. 7.5"
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
              <Text className="text-on-primary text-label-lg font-semibold">Log</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">7-DAY TREND</Text>
          {trend.length === 0 ? (
            <View className="items-center py-lg gap-xs">
              <MaterialCommunityIcons name="sleep" size={36} color={SLEEP_FG} />
              <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
                Sleep scores will appear here after your first sync or manual log.
              </Text>
            </View>
          ) : (
            <View className="flex-row items-end justify-between" style={{ height: 142 }}>
              {trend.map((entry) => {
                const height = Math.max(12, Math.round((entry.score / 100) * 92));
                const date = new Date(`${entry.sleep_date}T12:00:00`);
                return (
                  <View key={entry.id} className="items-center gap-xs" style={{ width: 38 }}>
                    <Text className="text-label-sm text-on-surface dark:text-d-on-surface font-semibold">{entry.score}</Text>
                    <View className="w-7 rounded-full" style={{ height, backgroundColor: SLEEP_FG }} />
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                      {date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {latest?.stage_minutes && (
          <View className="mx-margin-mobile mt-md bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-xs">
            <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs">SLEEP DETAIL</Text>
            <Text className="text-body-sm text-on-surface dark:text-d-on-surface">
              Deep {formatHours(latest.stage_minutes.deep ?? 0)} · REM {formatHours(latest.stage_minutes.rem ?? 0)} · Awake {formatHours(latest.stage_minutes.awake ?? 0)}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
