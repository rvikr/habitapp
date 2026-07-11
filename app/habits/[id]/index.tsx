import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabit, streakFor, longestStreakFor, getHabitCoachInsight } from "@/lib/data/habits";
import { toggleHabit, deleteHabit, logCompletion } from "@/lib/data/actions";
import { useCelebrate } from "@/components/celebration";
import CoachCard from "@/components/coach-card";
import type { CoachSignal } from "@/lib/coach/coach";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import LogPrompt from "@/components/log-prompt";
import ProgressRing from "@/components/progress-ring";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import type { Habit, HabitCompletion } from "@/types/db";
import { currentWeekStartKey, localDateDaysAgo, localDateKey } from "@/lib/utils/date";
import { formatAmount, isQuantityHabit, progressForHabit } from "@/lib/coach/habit-intelligence";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { getHabitVisualForHabit } from "@/lib/data/habit-images";

const CARD_CLASS =
  "bg-surface-container dark:bg-d-surface rounded-2xl border border-outline-variant dark:border-d-outline-variant";

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const celebrate = useCelebrate();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const { t, language } = useLanguage();
  const { colorScheme } = useTheme();
  const dark = colorScheme === "dark";
  const [habit, setHabit] = useState<Habit | null>(null);
  const [completions, setCompletions] = useState<HabitCompletion[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogPrompt, setShowLogPrompt] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [insight, setInsight] = useState<CoachSignal | null>(null);
  const [insightDismissed, setInsightDismissed] = useState(false);
  // Pessimistic default so the Pro upsell row never flashes at Pro users.
  const [hasPro, setHasPro] = useState(true);

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      if (!id) return;
      const { habit: h, completions: c } = await getHabit(id, options);
      setHabit(h);
      setCompletions(c);
      const [nextInsight, access] = await Promise.all([
        h ? getHabitCoachInsight(h, c) : Promise.resolve(null),
        getCurrentProAccess().catch(() => null),
      ]);
      setInsight(nextInsight);
      if (access) setHasPro(access.hasPro);
    },
    [id],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  }, [load]);

  const today = localDateKey();
  const todayCompletion = completions.find((c) => c.completed_on === today);
  const progress = habit ? progressForHabit(habit, todayCompletion) : null;
  const doneToday = progress?.isDone ?? false;
  const streak = streakFor(completions);
  const longestStreak = longestStreakFor(completions);

  async function handleToggle() {
    if (!habit || toggling) return;
    // Quantity habits can't be finished in one tap — open the log sheet instead.
    if (isQuantityHabit(habit) && !doneToday) {
      setShowLogPrompt(true);
      return;
    }
    setToggling(true);
    try {
      if (!doneToday) celebrate();
      const result = await toggleHabit(habit.id, doneToday);
      if (!result.ok) showAlert(t("Could not update habit"), result.error ?? t("Try again."));
      load({ force: true });
    } finally {
      setToggling(false);
    }
  }

  async function handleMarkAllDone() {
    if (!habit) return { ok: false, error: t("Habit not loaded.") };
    const result = await toggleHabit(habit.id, false, habit.target);
    if (!result.ok) return result;
    setShowLogPrompt(false);
    celebrate();
    load({ force: true });
    return result;
  }

  async function handleLog(value: number, note: string) {
    if (!habit) return { ok: false, error: t("Habit not loaded.") };
    const result = await logCompletion(habit.id, value, note, undefined, habit);
    if (!result.ok) return result;
    setShowLogPrompt(false);
    celebrate();
    load({ force: true });
    return result;
  }

  async function handleQuickLog() {
    if (!habit) return;
    const value = habit.default_log_value ?? 1;
    const result = await logCompletion(habit.id, value, "", undefined, habit);
    if (!result.ok) {
      showAlert(t("Could not log progress"), result.error ?? t("Try again."));
      return;
    }
    celebrate();
    load();
  }

  async function handleInsightAction(signal: CoachSignal) {
    if (!habit) return;
    // Sleep habits need the structured prompt (bed/wake times), same as the
    // dashboard's coach action; everything else logs the suggested value.
    const sleepHabit = habit.habit_type === "sleep" || habit.metric_type === "hours";
    if (signal.suggestedAction === "log_value" && signal.suggestedValue && !sleepHabit) {
      const result = await logCompletion(
        habit.id,
        signal.suggestedValue,
        "Logged from AI coach",
        undefined,
        habit,
      );
      if (!result.ok) {
        showAlert(t("Could not log progress"), result.error ?? t("Try again."));
        return;
      }
      celebrate();
      load({ force: true });
      return;
    }
    setShowLogPrompt(true);
  }

  async function handleDelete() {
    if (!habit) return;
    showAlert(t("Delete habit?"), t("This archives the habit and cancels its reminders."), [
      { text: t("Cancel"), style: "cancel" },
      {
        text: t("Delete"),
        style: "destructive",
        onPress: async () => {
          const result = await deleteHabit(habit.id);
          if (!result.ok) {
            showAlert(t("Could not delete habit"), result.error ?? t("Try again."));
            return;
          }
          router.replace("/");
        },
      },
    ]);
  }

  if (!habit) return <HabitDetailSkeleton onBack={handleBack} />;

  const visual = getHabitVisualForHabit(habit);
  const accent = visual.accent;
  const locale = language === "hi" ? "hi-IN" : "en-US";
  const quantityPending = isQuantityHabit(habit) && !doneToday;
  const toggleAccessibilityLabel = doneToday
    ? t("Mark {name} as undone", { name: habit.name })
    : quantityPending
      ? t("Log custom amount")
      : t("Mark {name} as done today", { name: habit.name });
  const toggleLabel = doneToday
    ? t("Mark as undone")
    : quantityPending
      ? t("Log custom amount")
      : t("Mark as done today");

  // Derived display stats — everything comes from the already-fetched logs.
  const loggedValues = completions
    .map((c) => (c.value == null ? null : Number(c.value)))
    .filter((v): v is number => v != null && Number.isFinite(v));
  const avgPerLog =
    loggedValues.length > 0
      ? loggedValues.reduce((sum, v) => sum + v, 0) / loggedValues.length
      : null;
  // Monday-based calendar week, so the THIS WEEK stat and the history list agree.
  const weekStartKey = currentWeekStartKey();
  const weekLogCount = completions.filter((c) => c.completed_on >= weekStartKey).length;
  const showAvgCard = isQuantityHabit(habit) && avgPerLog != null;
  const historyItems = completions.filter((c) => c.completed_on >= weekStartKey);
  const yesterdayKey = localDateDaysAgo(1);

  const historyDateLabel = (key: string) => {
    if (key === today) return t("Today");
    if (key === yesterdayKey) return t("Yesterday");
    return new Date(`${key}T00:00:00`).toLocaleDateString(locale, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };
  const metDailyTarget = (c: HabitCompletion) =>
    habit.target != null && Number(habit.target) > 0
      ? (c.value ?? 0) >= Number(habit.target)
      : true;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
          onPress={handleBack}
          style={{ width: 40 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-on-background dark:text-d-on-background"
          style={{ fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 18 }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {habit.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Completion ring hero */}
        <View className="items-center mb-lg" style={{ paddingTop: 16 }}>
          <ProgressRing
            progress={progress?.ratio ?? 0}
            size={180}
            strokeWidth={10}
            color={accent}
            trackColor={dark ? "#2C2C36" : "#E6E0D5"}
          >
            <Text
              className="text-on-background dark:text-d-on-background"
              style={{
                fontSize: 44,
                fontFamily: "SpaceGrotesk_700Bold",
                fontVariant: ["tabular-nums"],
              }}
            >
              {Math.round((progress?.ratio ?? 0) * 100)}%
            </Text>
            <Text
              className="text-on-surface-variant dark:text-d-on-surface-variant"
              style={{
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginTop: 2,
              }}
            >
              {t("COMPLETION")}
            </Text>
          </ProgressRing>
          {progress && (
            <Text
              className="text-body-md font-semibold mt-md"
              style={{ color: accent }}
              numberOfLines={1}
            >
              {t(progress.label)}
            </Text>
          )}
          {habit.description ? (
            <Text
              className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs px-margin-mobile text-center"
              numberOfLines={2}
            >
              {habit.description}
            </Text>
          ) : null}
        </View>

        {/* Stats */}
        <View className="mx-margin-mobile mb-lg gap-sm">
          <View className={`${CARD_CLASS} p-lg flex-row items-start justify-between`}>
            <View className="flex-1 pr-md">
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Current Streak")}
              </Text>
              <Text
                style={{
                  fontSize: 32,
                  fontFamily: "SpaceGrotesk_700Bold",
                  color: accent,
                  marginTop: 4,
                }}
              >
                {streak} <Text style={{ fontSize: 18 }}>{t("day streak")}</Text>
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
                {t("Longest streak: {count} days", { count: longestStreak })}
              </Text>
            </View>
            <MaterialCommunityIcons name="fire" size={28} color="#F26B1F" />
          </View>

          <View className="flex-row gap-sm">
            <View className={`${CARD_CLASS} flex-1 p-lg`}>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Total")}
              </Text>
              <Text
                className="text-on-background dark:text-d-on-background"
                style={{ fontSize: 26, fontFamily: "SpaceGrotesk_700Bold", marginTop: 4 }}
              >
                {completions.length}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
                {t("total logs")}
              </Text>
            </View>
            <View className={`${CARD_CLASS} flex-1 p-lg`}>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {showAvgCard ? t("Avg per log") : t("THIS WEEK")}
              </Text>
              <Text
                className="text-on-background dark:text-d-on-background"
                style={{ fontSize: 26, fontFamily: "SpaceGrotesk_700Bold", marginTop: 4 }}
                numberOfLines={1}
              >
                {showAvgCard ? formatAmount(avgPerLog as number) : weekLogCount}
              </Text>
              <Text
                className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs"
                numberOfLines={1}
              >
                {showAvgCard ? (habit.unit ?? "") : t("completions")}
              </Text>
            </View>
          </View>
        </View>

        {/* AI Coach tip for this habit */}
        {insight && !insightDismissed && (
          <CoachCard
            variant="compact"
            signal={insight}
            hasPro={hasPro}
            onAction={(signal) => void handleInsightAction(signal)}
            onDismiss={() => setInsightDismissed(true)}
            onUpsell={() => router.push("/pro" as never)}
          />
        )}
        {!insight && completions.length === 0 && (
          <View className="mx-margin-mobile mb-lg rounded-2xl bg-surface-container dark:bg-d-surface border border-outline-variant dark:border-d-outline-variant p-md">
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
              {t("Log a few days to see patterns.")}
            </Text>
          </View>
        )}

        {/* Today toggle — kept above history so logging never requires scrolling */}
        <View className="px-margin-mobile gap-sm mb-lg">
          {habit.target != null && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("Log {value}", {
                value: `+${formatAmount(habit.default_log_value ?? 1)} ${habit.unit ?? ""}`.trim(),
              })}
              accessibilityState={{ disabled: doneToday }}
              className="rounded-full items-center justify-center bg-secondary"
              style={{ minHeight: 48, opacity: doneToday ? 0.5 : 1 }}
              onPress={handleQuickLog}
              disabled={doneToday}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                +{formatAmount(habit.default_log_value ?? 1)} {habit.unit ?? ""}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={toggleAccessibilityLabel}
            accessibilityState={{ disabled: toggling }}
            className={`rounded-full items-center justify-center ${doneToday ? "bg-secondary" : "bg-primary"}`}
            style={{ minHeight: 48 }}
            onPress={handleToggle}
            disabled={toggling}
          >
            <Text className="text-on-primary text-label-lg font-semibold">{toggleLabel}</Text>
          </TouchableOpacity>
        </View>

        {/* Recent history timeline */}
        <View className="mx-margin-mobile mb-lg">
          <Text
            className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-sm"
            style={{ letterSpacing: 1.2 }}
          >
            {t("Recent History")}
          </Text>
          {historyItems.length === 0 ? (
            <View className={`${CARD_CLASS} p-lg items-center gap-xs`}>
              <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                {t("No logs yet")}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
                {t("This week will fill in as you log this habit.")}
              </Text>
            </View>
          ) : (
            <View>
              {historyItems.map((completion, index) => {
                const met = metDailyTarget(completion);
                const isLastItem = index === historyItems.length - 1;
                return (
                  <View key={completion.id} style={{ flexDirection: "row", alignItems: "stretch" }}>
                    <View style={{ width: 20, alignItems: "center" }}>
                      <View
                        style={{
                          width: 2,
                          height: 26,
                          backgroundColor:
                            index === 0 ? "transparent" : dark ? "#2C2C36" : "#E6E0D5",
                        }}
                      />
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: met ? accent : dark ? "#7A7E88" : "#8F8A82",
                        }}
                      />
                      <View
                        style={{
                          width: 2,
                          flex: 1,
                          backgroundColor: isLastItem
                            ? "transparent"
                            : dark
                              ? "#2C2C36"
                              : "#E6E0D5",
                        }}
                      />
                    </View>
                    <View
                      className={`${CARD_CLASS} flex-1 p-md flex-row items-center`}
                      style={{ marginLeft: 12, marginBottom: isLastItem ? 0 : 10 }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text
                          className="text-on-surface dark:text-d-on-surface"
                          style={{ fontSize: 13, fontWeight: "600" }}
                        >
                          {historyDateLabel(completion.completed_on)},{" "}
                          {new Date(completion.created_at).toLocaleTimeString(locale, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </Text>
                        <Text
                          className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
                          style={{ marginTop: 2 }}
                          numberOfLines={1}
                        >
                          {[
                            completion.value != null
                              ? `${formatAmount(Number(completion.value))} ${habit.unit ?? ""}`.trim()
                              : null,
                            completion.note || null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || t("Done today")}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={met ? "check-circle" : "check"}
                        size={20}
                        color={met ? "#3EBB7F" : "#8F8A82"}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Manage habit */}
        <View className="px-margin-mobile gap-sm">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("Edit habit")}
            className="rounded-full items-center justify-center flex-row gap-xs bg-primary-fixed"
            style={{ minHeight: 48 }}
            onPress={() => router.push(`/habits/${habit.id}/edit`)}
          >
            <MaterialCommunityIcons name="pencil" size={18} color="#3D1800" />
            <Text className="text-label-lg font-semibold" style={{ color: "#3D1800" }}>
              {t("Edit habit")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t("Delete habit")}
            className="rounded-full items-center justify-center flex-row gap-xs border border-outline dark:border-d-outline"
            style={{ minHeight: 48 }}
            onPress={handleDelete}
          >
            <MaterialCommunityIcons name="delete-outline" size={18} color="#FF5A5A" />
            <Text className="text-error text-label-lg font-semibold">{t("Delete habit")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <LogPrompt
        visible={showLogPrompt}
        habit={habit}
        currentValue={progress?.current ?? 0}
        onSubmit={handleLog}
        onMarkAllDone={handleMarkAllDone}
        onDismiss={() => setShowLogPrompt(false)}
      />
    </SafeAreaView>
  );
}

function HabitDetailSkeleton({ onBack }: { onBack: () => void }) {
  const { t } = useLanguage();

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center px-margin-mobile py-sm">
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("Go back")}
          onPress={onBack}
          style={{ width: 40 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <View className="flex-1 items-center">
          <SkeletonText className="h-5" width={120} />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="items-center mb-lg" style={{ paddingTop: 16 }}>
          <Skeleton className="rounded-full" style={{ width: 180, height: 180 }} />
          <SkeletonText className="mt-md" width={140} />
        </View>

        <View className="mx-margin-mobile mb-lg gap-sm">
          <Skeleton className="rounded-2xl" style={{ height: 104 }} />
          <View className="flex-row gap-sm">
            <Skeleton className="flex-1 rounded-2xl" style={{ height: 96 }} />
            <Skeleton className="flex-1 rounded-2xl" style={{ height: 96 }} />
          </View>
        </View>

        <View className="mx-margin-mobile gap-sm">
          <SkeletonText width={110} />
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="rounded-2xl" style={{ height: 64, marginLeft: 32 }} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
