import { useState, useCallback, useRef } from "react";
import {
  Linking,
  Platform,
  View,
  Text,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Svg, { Circle, Path } from "react-native-svg";
import {
  getHabitsForToday,
  getStats,
  getConsistencyData,
  type DayConsistency,
} from "@/lib/data/habits";
import { buildLifeBalanceWheelSegments, type LifeBalanceSegment } from "@/lib/coach/life-balance";
import { XP_PER_LEVEL } from "@/lib/coach/xp";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import ProgressRing from "@/components/progress-ring";
import HabitProgressVisual from "@/components/habit-progress-visual";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useTrackingPreferences } from "@/components/tracking-preferences-provider";
import {
  getSleepDashboardData,
  syncLastNightSleep,
  requestSleepPermission,
  type SleepDashboardData,
} from "@/lib/platform/sleep";
import { summarizeSleepRange, type SleepTrendRange } from "@/lib/data/sleep-shared";
import { showAlert } from "@/lib/platform/alert";
import { localDateKey, addLocalDays } from "@/lib/utils/date";
import { GET_APP_URL } from "@/lib/constants";

type StatsData = Awaited<ReturnType<typeof getStats>>;

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

const AUTO_SLEEP_SYNC_MS = 15 * 60 * 1000;

function formatSleepHours(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "—";
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function scoreTone(score: number | null | undefined, t: (s: string) => string): string {
  if (score == null) return t("No score yet");
  if (score >= 85) return t("Great sleep");
  if (score >= 70) return t("Solid night");
  if (score >= 50) return t("Needs recovery");
  return t("Low sleep");
}

export default function ProgressScreen() {
  const { t, language } = useLanguage();
  const { colorScheme } = useTheme();
  const { sleepEnabled, setSleepEnabled, hydrated: trackingHydrated } = useTrackingPreferences();
  const [stats, setStats] = useState<StatsData>(null);
  const [consistencyDays, setConsistencyDays] = useState<DayConsistency[]>([]);
  const [lifeSegments, setLifeSegments] = useState<LifeBalanceSegment[]>([]);
  const [sleepData, setSleepData] = useState<SleepDashboardData | null>(null);
  const [sleepRange, setSleepRange] = useState<SleepTrendRange>(7);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lastSleepSyncAt = useRef(0);

  const trackColor = colorScheme === "dark" ? "#353540" : "#E6E0D5";

  const load = useCallback(async (options?: { force?: boolean }) => {
    const [habitsResult, statsData, days, sleepDashboard] = await Promise.all([
      getHabitsForToday(options),
      getStats(options),
      getConsistencyData(options),
      getSleepDashboardData(options),
    ]);

    const { habits, todayProgress } = habitsResult;
    setStats(statsData);
    setConsistencyDays(days);
    setLifeSegments(buildLifeBalanceWheelSegments(habits, todayProgress));
    setSleepData(sleepDashboard);
    setLoaded(true);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (trackingHydrated && sleepEnabled) {
        const now = Date.now();
        if (now - lastSleepSyncAt.current > AUTO_SLEEP_SYNC_MS) {
          lastSleepSyncAt.current = now;
          syncLastNightSleep({ requestPermission: false })
            .then(() => load({ force: true }))
            .catch(() => {});
        }
      }
    }, [load, sleepEnabled, trackingHydrated]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    if (trackingHydrated && sleepEnabled) {
      lastSleepSyncAt.current = Date.now();
      syncLastNightSleep({ requestPermission: false })
        .then(() => load({ force: true }))
        .catch(() => {});
    }
    setRefreshing(false);
  }, [load, sleepEnabled, trackingHydrated]);

  // Mirrors Settings' sleep toggle: request Health permission, and only enable
  // tracking on grant. On success, kick an immediate sync so stats appear here
  // without waiting for the next focus.
  const handleEnableSleep = useCallback(async () => {
    const status = await requestSleepPermission();
    if (status === "granted") {
      setSleepEnabled(true);
      lastSleepSyncAt.current = Date.now();
      syncLastNightSleep({ requestPermission: false })
        .then(() => load({ force: true }))
        .catch(() => {});
      return;
    }
    const message =
      status === "unavailable"
        ? t("Sleep sync isn't available on this device.")
        : status === "providerUpdateRequired"
          ? t("Update Health Connect to enable sleep tracking.")
          : t("Allow health access to enable sleep tracking.");
    showAlert(t("Sleep tracking"), message);
  }, [load, setSleepEnabled, t]);

  const level = stats?.level ?? 1;
  const xp = stats?.xp ?? 0;
  const xpForNext = stats?.xpForNext ?? XP_PER_LEVEL;
  const xpPct = xpForNext > 0 ? Math.min((xp / xpForNext) * 100, 100) : 0;
  const currentStreak = stats?.currentStreak ?? 0;
  const longestStreak = stats?.longestStreak ?? 0;
  const totalCompletions = stats?.totalCompletions ?? 0;

  const lifeAverage =
    lifeSegments.length > 0
      ? lifeSegments.reduce((sum, s) => sum + s.score, 0) / lifeSegments.length
      : 0;

  // Split consistency days into current week vs full grid
  const now = new Date();
  const currentDayOfWeek = (now.getDay() + 6) % 7; // 0=Mon, 6=Sun
  const currentWeekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addLocalDays(now, i - currentDayOfWeek);
    const key = localDateKey(d);
    const found = consistencyDays.find((day) => day.date === key);
    return {
      label: WEEK_LABELS[i],
      ratio: found?.ratio ?? 0,
      isFuture: d > now,
      isToday: key === localDateKey(now),
    };
  });
  const weekCompletedDays = currentWeekDays.filter((d) => !d.isFuture && d.ratio > 0).length;
  const weekNonFutureDays = currentWeekDays.filter((d) => !d.isFuture).length;
  const isOnTrack = weekNonFutureDays > 0 && weekCompletedDays / weekNonFutureDays >= 0.5;

  // Sleep score + trend data
  const sleepRangeSummary = summarizeSleepRange(sleepData?.entries ?? [], sleepRange);
  const sleepTrend = sleepRangeSummary.trendEntries;
  const sleepLatest = sleepRangeSummary.entries[0] ?? null;
  const sleepTargetMinutes = sleepData?.targetMinutes ?? 480;
  const sleepWindowCount = sleepRangeSummary.count;
  const sleepAvgScore = sleepRangeSummary.averageScore;
  const sleepAvgDurationMinutes = sleepRangeSummary.averageDurationMinutes;
  const sleepAvgDurationRatio = Math.min(sleepAvgDurationMinutes / sleepTargetMinutes, 1);
  const sleepLatestDurationRatio = sleepLatest
    ? Math.min(sleepLatest.duration_minutes / sleepTargetMinutes, 1)
    : 0;
  const sleepLatestLabel = sleepLatest
    ? new Date(`${sleepLatest.sleep_date}T12:00:00`).toLocaleDateString(
        language === "hi" ? "hi-IN" : "en-US",
        { weekday: "short", month: "short", day: "numeric" },
      )
    : null;
  const sleepLastHours = sleepLatest ? formatSleepHours(sleepLatest.duration_minutes) : "—";

  // Build 5×7 grid rows from consistency data (already 35 days from Monday)
  const calendarRows: DayConsistency[][] = [];
  for (let row = 0; row < 5; row++) {
    calendarRows.push(consistencyDays.slice(row * 7, row * 7 + 7));
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View className="px-margin-mobile pt-md pb-xs">
          <Text
            className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
            style={{ letterSpacing: 0.3, textTransform: "uppercase" }}
          >
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </Text>
          <Text
            className="text-headline-lg text-on-background dark:text-d-on-background"
            style={{ fontFamily: "SpaceGrotesk_700Bold", letterSpacing: -0.5 }}
          >
            {t("Momentum")}
          </Text>
          {loaded && (
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
              {t("Level {level} • {completions} completions", {
                level,
                completions: totalCompletions,
              })}
            </Text>
          )}
        </View>

        {/* XP / Level */}
        {loaded ? (
          <View className="mx-margin-mobile mt-sm mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
            <View className="flex-row items-center justify-between mb-sm">
              <View className="flex-row items-center gap-sm">
                <View className="w-9 h-9 rounded-full bg-primary-fixed items-center justify-center">
                  <MaterialCommunityIcons name="star-circle-outline" size={20} color="#F26B1F" />
                </View>
                <View>
                  <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                    {t("XP from habits")}
                  </Text>
                  <Text
                    className="text-headline-md text-on-surface dark:text-d-on-surface"
                    style={{ fontFamily: "SpaceGrotesk_700Bold" }}
                  >
                    {t("Level {level}", { level })}
                  </Text>
                </View>
              </View>
              <Text
                className="text-label-lg text-on-surface dark:text-d-on-surface"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {xp} / {xpForNext} XP
              </Text>
            </View>
            <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden">
              <View className="h-full bg-primary rounded-full" style={{ width: `${xpPct}%` }} />
            </View>
          </View>
        ) : (
          <View className="mx-margin-mobile mt-sm mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-sm">
            <View className="flex-row justify-between">
              <SkeletonText width={100} />
              <SkeletonText width={80} />
            </View>
            <Skeleton className="h-2 rounded-full" />
          </View>
        )}

        {/* Streak + Completions cards */}
        {loaded ? (
          <View className="px-margin-mobile mt-sm mb-sm flex-row gap-sm">
            <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
              <View className="flex-row items-center gap-xs mb-xs">
                <MaterialCommunityIcons name="fire" size={16} color="#F26B1F" />
                <Text
                  className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                  style={{ letterSpacing: 0.5 }}
                >
                  {t("LONGEST STREAK")}
                </Text>
              </View>
              <Text
                className="text-headline-lg text-on-surface dark:text-d-on-surface"
                style={{ fontFamily: "SpaceGrotesk_700Bold", fontVariant: ["tabular-nums"] }}
              >
                {longestStreak > 0 ? longestStreak : currentStreak}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Days")}
              </Text>
            </View>
            <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
              <View className="flex-row items-center gap-xs mb-xs">
                <MaterialCommunityIcons name="check-circle-outline" size={16} color="#3EBB7F" />
                <Text
                  className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                  style={{ letterSpacing: 0.5 }}
                >
                  {t("COMPLETIONS")}
                </Text>
              </View>
              <Text
                className="text-headline-lg text-on-surface dark:text-d-on-surface"
                style={{ fontFamily: "SpaceGrotesk_700Bold", fontVariant: ["tabular-nums"] }}
              >
                {totalCompletions}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Total")}
              </Text>
            </View>
          </View>
        ) : (
          <View className="px-margin-mobile mt-sm mb-sm flex-row gap-sm">
            <Skeleton className="flex-1 h-24 rounded-xl" />
            <Skeleton className="flex-1 h-24 rounded-xl" />
          </View>
        )}

        {/* Weekly Momentum */}
        <View className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <View className="flex-row items-center justify-between mb-md">
            <Text
              className="text-body-md text-on-surface dark:text-d-on-surface font-semibold"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              {t("Weekly Momentum")}
            </Text>
            {loaded && isOnTrack && (
              <View className="flex-row items-center gap-xs bg-secondary-container dark:bg-d-secondary-container px-sm py-xs rounded-full">
                <View className="w-1.5 h-1.5 rounded-full bg-secondary dark:bg-d-secondary" />
                <Text className="text-label-sm text-secondary dark:text-d-secondary font-semibold">
                  {t("On Track")}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row gap-xs">
            {(loaded
              ? currentWeekDays
              : WEEK_LABELS.map((label) => ({ label, ratio: 0, isFuture: false, isToday: false }))
            ).map((day, i) => (
              <View key={i} className="flex-1 items-center gap-xs">
                <Text
                  className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                  style={{ letterSpacing: 0.3 }}
                >
                  {day.label}
                </Text>
                {loaded ? (
                  <ConsistencyCell ratio={day.ratio} isFuture={day.isFuture} size={36} />
                ) : (
                  <Skeleton className="rounded-lg" style={{ width: 36, height: 36 }} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Consistency Calendar */}
        <View className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <View className="flex-row items-center justify-between mb-md">
            <Text
              className="text-body-md text-on-surface dark:text-d-on-surface font-semibold"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
            >
              {t("Consistency")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {t("Last 30 Days")}
            </Text>
          </View>
          {/* Column headers */}
          <View className="flex-row gap-xs mb-xs">
            {WEEK_LABELS.map((label, i) => (
              <Text
                key={i}
                className="flex-1 text-center text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                style={{ letterSpacing: 0.3 }}
              >
                {label}
              </Text>
            ))}
          </View>
          {/* Grid rows */}
          {loaded ? (
            calendarRows.map((week, rowIdx) => (
              <View key={rowIdx} className="flex-row gap-xs mb-xs">
                {week.map((day, colIdx) => (
                  <ConsistencyCell
                    key={colIdx}
                    ratio={day.ratio}
                    isFuture={day.isFuture}
                    size={undefined}
                  />
                ))}
              </View>
            ))
          ) : (
            <>
              {[0, 1, 2, 3, 4].map((rowIdx) => (
                <View key={rowIdx} className="flex-row gap-xs mb-xs">
                  {[0, 1, 2, 3, 4, 5, 6].map((colIdx) => (
                    <Skeleton key={colIdx} className="flex-1 rounded-lg aspect-square" />
                  ))}
                </View>
              ))}
            </>
          )}
        </View>

        {/* Sleep score + current streak row */}
        {loaded && (
          <View className="mx-margin-mobile mb-sm flex-row gap-sm">
            <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
              <MaterialCommunityIcons name="fire" size={20} color="#F26B1F" />
              <Text
                className="text-headline-md text-on-surface dark:text-d-on-surface mt-xs"
                style={{ fontFamily: "SpaceGrotesk_700Bold", fontVariant: ["tabular-nums"] }}
              >
                {currentStreak}
              </Text>
              <Text
                className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                style={{ letterSpacing: 0.3 }}
              >
                {t("CURRENT STREAK")}
              </Text>
            </View>
            <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
              <MaterialCommunityIcons name="weather-night" size={20} color="#3EBB7F" />
              <Text
                className="text-headline-md text-on-surface dark:text-d-on-surface mt-xs"
                style={{ fontFamily: "SpaceGrotesk_700Bold", fontVariant: ["tabular-nums"] }}
              >
                {sleepLastHours}
              </Text>
              <Text
                className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                style={{ letterSpacing: 0.3 }}
              >
                {t("LAST NIGHT")}
              </Text>
            </View>
          </View>
        )}

        {/* Life Balance Wheel */}
        <View className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <View className="flex-row items-center justify-between mb-md">
            <Text
              className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant"
              style={{ letterSpacing: 0.6 }}
            >
              {t("LIFE BALANCE WHEEL")}
            </Text>
            {loaded && (
              <Text
                className="text-label-lg text-on-surface dark:text-d-on-surface"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {Math.round(lifeAverage * 100)}%
              </Text>
            )}
          </View>
          {loaded ? (
            <>
              <View className="items-center">
                <LifeBalanceWheelGraphic
                  segments={lifeSegments}
                  trackColor={trackColor}
                  centerLabel={`${Math.round(lifeAverage * 100)}%`}
                />
              </View>
              {lifeSegments.length > 0 && (
                <View className="flex-row flex-wrap gap-sm mt-md">
                  {lifeSegments.map((segment) => (
                    <View
                      key={segment.category}
                      className="flex-row items-center gap-xs"
                      style={{ width: "48%", minHeight: 20 }}
                    >
                      <View
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: segment.color }}
                      />
                      <Text
                        className="text-label-sm text-on-surface dark:text-d-on-surface flex-1"
                        numberOfLines={1}
                      >
                        {t(segment.category)}
                      </Text>
                      <Text
                        className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                        style={{ fontVariant: ["tabular-nums"] }}
                      >
                        {Math.round(segment.score * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View className="items-center py-md">
              <Skeleton className="rounded-full" style={{ width: 176, height: 176 }} />
            </View>
          )}
        </View>
        {/* Sleep Section */}
        {loaded &&
          (Platform.OS !== "web" && !sleepEnabled ? (
            <TouchableOpacity
              onPress={handleEnableSleep}
              className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface rounded-2xl border border-outline-variant dark:border-d-outline-variant p-md flex-row items-center gap-md"
              accessibilityRole="button"
              accessibilityLabel={t("Enable sleep tracking")}
            >
              <MaterialCommunityIcons name="sleep" size={24} color="#3EBB7F" />
              <View className="flex-1">
                <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">
                  {t("Enable sleep tracking")}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {t(
                    "Sync sleep from Health Connect or Apple Health to see your score and trends here.",
                  )}
                </Text>
              </View>
              <Text className="text-primary text-label-lg font-semibold">{t("Enable")}</Text>
            </TouchableOpacity>
          ) : (
            <>
              {/* Sleep Score Overview */}
              <View
                className="mx-margin-mobile mb-sm rounded-2xl p-lg gap-md"
                style={{ backgroundColor: "#e6deff" }}
              >
                {sleepWindowCount === 0 ? (
                  <View className="items-center py-md gap-sm">
                    <MaterialCommunityIcons name="sleep" size={32} color="#F26B1F" />
                    <Text
                      className="text-body-md font-semibold text-center"
                      style={{
                        color: "#F26B1F",
                        fontFamily: "SpaceGrotesk_600SemiBold",
                      }}
                    >
                      {t("Sleep data is not available")}
                    </Text>
                    <Text className="text-label-sm text-center" style={{ color: "#F26B1F" }}>
                      {t("No sleep data was found for the last {days} days.", {
                        days: sleepRange,
                      })}
                    </Text>
                    {Platform.OS === "web" && (
                      <>
                        <Text className="text-label-sm text-center" style={{ color: "#F26B1F" }}>
                          {t(
                            "Automatic sleep sync works in the Lagan iOS and Android app. Sleep synced there shows up here.",
                          )}
                        </Text>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(GET_APP_URL)}
                          accessibilityRole="button"
                          accessibilityLabel={t("Get the app")}
                        >
                          <Text className="text-label-lg font-semibold text-primary">
                            {t("Get the app")}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : (
                  <>
                    <View className="flex-row items-center justify-between">
                      <View className="flex-1 gap-xs">
                        <Text className="text-label-lg font-semibold" style={{ color: "#F26B1F" }}>
                          {scoreTone(sleepAvgScore, t)}
                        </Text>
                        <Text
                          style={{
                            fontSize: 52,
                            fontFamily: "SpaceGrotesk_700Bold",
                            color: "#F26B1F",
                            lineHeight: 56,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {sleepAvgScore ?? "—"}
                        </Text>
                        <Text className="text-body-sm" style={{ color: "#F26B1F" }}>
                          {t("Avg over last {days} days · {count} nights", {
                            days: sleepRange,
                            count: sleepWindowCount,
                          })}
                        </Text>
                      </View>
                      <ProgressRing
                        progress={sleepAvgScore != null ? sleepAvgScore / 100 : 0}
                        size={104}
                        strokeWidth={9}
                        color="#F26B1F"
                        trackColor="#E6E0D5"
                      >
                        <HabitProgressVisual
                          visualType="sleep_moon"
                          progress={sleepAvgDurationRatio}
                          size="compact"
                          color="#F26B1F"
                          trackColor="#FFC56B"
                        />
                      </ProgressRing>
                    </View>

                    {sleepLatest ? (
                      <View className="bg-surface-lowest dark:bg-d-surface-lowest rounded-xl p-md gap-xs">
                        <View className="flex-row items-center justify-between">
                          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                            {t("Last logged · {date}", { date: sleepLatestLabel ?? "" })}
                          </Text>
                          <Text className="text-label-lg text-primary font-semibold">
                            {t("Score {score}", { score: sleepLatest.score })}
                          </Text>
                        </View>
                        <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                          {sleepLastHours} / {formatSleepHours(sleepTargetMinutes)}
                        </Text>
                        <View className="h-2 bg-surface-high dark:bg-d-surface-high rounded-full overflow-hidden mt-xs">
                          <View
                            className="h-2 rounded-full"
                            style={{
                              width: `${sleepLatestDurationRatio * 100}%`,
                              backgroundColor: "#F26B1F",
                            }}
                          />
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </View>

              {/* Sleep Trend */}
              <View className="mx-margin-mobile mb-sm bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
                <View className="flex-row items-center justify-between mb-md">
                  <View className="flex-row items-center gap-sm">
                    <MaterialCommunityIcons name="weather-night" size={18} color="#3EBB7F" />
                    <Text
                      className="text-body-md text-on-surface dark:text-d-on-surface font-semibold"
                      style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                    >
                      {t("Sleep Trend")}
                    </Text>
                  </View>
                  <View className="flex-row bg-surface-lowest dark:bg-d-surface-lowest rounded-full p-1">
                    {([7, 30] as const).map((option) => {
                      const active = option === sleepRange;
                      return (
                        <TouchableOpacity
                          key={option}
                          onPress={() => setSleepRange(option)}
                          className="px-sm py-1 rounded-full"
                          style={{ backgroundColor: active ? "#3EBB7F" : "transparent" }}
                          accessibilityRole="button"
                          accessibilityLabel={t("Show {days} day sleep trend", { days: option })}
                          accessibilityState={{ selected: active }}
                        >
                          <Text
                            className="text-label-sm font-semibold"
                            style={{ color: active ? "#fff" : "#3EBB7F" }}
                          >
                            {t("{days}d", { days: option })}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                {sleepTrend.length === 0 ? (
                  <View className="items-center py-md gap-xs">
                    <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
                      {t("Sleep data is not available for the last {days} days.", {
                        days: sleepRange,
                      })}
                    </Text>
                  </View>
                ) : sleepRange === 7 ? (
                  <View className="flex-row items-end justify-between" style={{ height: 120 }}>
                    {sleepTrend.map((entry) => {
                      const height = Math.max(10, Math.round((entry.score / 100) * 80));
                      const date = new Date(`${entry.sleep_date}T12:00:00`);
                      return (
                        <View key={entry.id} className="items-center gap-xs flex-1">
                          <Text className="text-label-sm text-on-surface dark:text-d-on-surface font-semibold">
                            {entry.score}
                          </Text>
                          <View
                            className="w-7 rounded-full"
                            style={{ height, backgroundColor: "#3EBB7F" }}
                          />
                          <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                            {date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View>
                    <View className="flex-row items-end gap-1" style={{ height: 100 }}>
                      {sleepTrend.map((entry) => {
                        const height = Math.max(6, Math.round((entry.score / 100) * 88));
                        return (
                          <View
                            key={entry.id}
                            className="flex-1 rounded-sm"
                            style={{ height, backgroundColor: "#3EBB7F", minWidth: 4 }}
                          />
                        );
                      })}
                    </View>
                    <View className="flex-row justify-between mt-sm">
                      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                        {new Date(`${sleepTrend[0].sleep_date}T12:00:00`).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )}
                      </Text>
                      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                        {new Date(
                          `${sleepTrend[sleepTrend.length - 1].sleep_date}T12:00:00`,
                        ).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </>
          ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ConsistencyCell({
  ratio,
  isFuture,
  size,
}: {
  ratio: number;
  isFuture: boolean;
  size?: number;
}) {
  let backgroundColor: string;
  if (isFuture) {
    backgroundColor = "transparent";
  } else if (ratio >= 0.8) {
    backgroundColor = "#F26B1F";
  } else if (ratio >= 0.5) {
    backgroundColor = "rgba(242,107,31,0.55)";
  } else if (ratio > 0) {
    backgroundColor = "rgba(242,107,31,0.25)";
  } else {
    backgroundColor = "rgba(242,107,31,0.08)";
  }

  const style = size
    ? { width: size, height: size, borderRadius: 8, backgroundColor }
    : { flex: 1, aspectRatio: 1, borderRadius: 8, backgroundColor };

  return <View style={style} />;
}

function LifeBalanceWheelGraphic({
  segments,
  trackColor,
  centerLabel,
}: {
  segments: LifeBalanceSegment[];
  trackColor: string;
  centerLabel: string;
}) {
  const size = 176;
  const center = size / 2;
  const radius = 78;
  const segmentAngle = 360 / Math.max(segments.length, 1);
  const gap = 2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {[0.25, 0.5, 0.75, 1].map((ring) => (
          <Circle
            key={ring}
            cx={center}
            cy={center}
            r={radius * ring}
            stroke={trackColor}
            strokeWidth={1}
            fill="none"
            opacity={0.72}
          />
        ))}
        {segments.map((segment, index) => {
          const startAngle = index * segmentAngle + gap;
          const endAngle = (index + 1) * segmentAngle - gap;
          return (
            <Path
              key={`${segment.category}-track`}
              d={sectorPath(center, center, radius, startAngle, endAngle)}
              fill={trackColor}
              opacity={0.26}
            />
          );
        })}
        {segments.map((segment, index) => {
          if (segment.score <= 0) return null;
          const startAngle = index * segmentAngle + gap;
          const endAngle = (index + 1) * segmentAngle - gap;
          const scoreRadius = Math.max(radius * segment.score, 14);
          return (
            <Path
              key={segment.category}
              d={sectorPath(center, center, scoreRadius, startAngle, endAngle)}
              fill={segment.color}
              opacity={0.82}
            />
          );
        })}
      </Svg>
      <View className="w-16 h-16 rounded-full bg-surface-lowest dark:bg-d-surface-lowest items-center justify-center">
        <Text
          className="text-headline-md text-on-surface dark:text-d-on-surface"
          style={{ fontVariant: ["tabular-nums"] }}
        >
          {centerLabel}
        </Text>
      </View>
    </View>
  );
}

function pointOnCircle(centerX: number, centerY: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(radians),
    y: centerY + radius * Math.sin(radians),
  };
}

function sectorPath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  const start = pointOnCircle(centerX, centerY, radius, startAngle);
  const end = pointOnCircle(centerX, centerY, radius, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x.toFixed(3)} ${start.y.toFixed(3)}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(3)} ${end.y.toFixed(3)}`,
    "Z",
  ].join(" ");
}
