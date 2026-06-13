import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ImageBackground,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabit, weekProgressFor, streakFor, getHabitCoachInsight } from "@/lib/data/habits";
import { toggleHabit, deleteHabit, logCompletion } from "@/lib/data/actions";
import { useCelebrate } from "@/components/celebration";
import CoachCard from "@/components/coach-card";
import type { CoachSignal } from "@/lib/coach/coach";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import Icon from "@/components/icon";
import LogEntryFab from "@/components/log-entry-fab";
import LogPrompt from "@/components/log-prompt";
import HabitProgressVisual from "@/components/habit-progress-visual";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import type { Habit, HabitCompletion } from "@/types/db";
import { localDateKey } from "@/lib/utils/date";
import { formatAmount, isQuantityHabit, progressForHabit } from "@/lib/coach/habit-intelligence";
import { useLanguage } from "@/components/language-provider";
import { getHabitImageForHabit } from "@/lib/data/habit-images";

const COLOR_FG: Record<string, string> = {
  primary: "#F26B1F",
  secondary: "#3EBB7F",
  tertiary: "#E4A23A",
  neutral: "#5A554D",
};

export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const celebrate = useCelebrate();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };
  const { t } = useLanguage();
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
  const weekDays = habit ? weekProgressFor(habit.id, completions) : [];

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
    const result = await logCompletion(habit.id, value, note);
    if (!result.ok) return result;
    setShowLogPrompt(false);
    celebrate();
    load({ force: true });
    return result;
  }

  async function handleQuickLog() {
    if (!habit) return;
    const value = habit.default_log_value ?? 1;
    const result = await logCompletion(habit.id, value, "");
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
      const result = await logCompletion(habit.id, signal.suggestedValue, "Logged from AI coach");
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

  const imageUrl = getHabitImageForHabit(habit);
  const accentColor = "#FFC56B";
  const fg = COLOR_FG[habit.color] ?? "#F26B1F";

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center justify-between px-margin-mobile py-sm">
        <TouchableOpacity onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <View className="flex-row gap-sm">
          <TouchableOpacity onPress={() => router.push(`/habits/${habit.id}/edit`)}>
            <MaterialCommunityIcons name="pencil" size={22} color="#F26B1F" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <MaterialCommunityIcons name="delete" size={22} color="#FF5A5A" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header hero with habit image background */}
        <View className="mx-margin-mobile mb-lg" style={{ borderRadius: 20, overflow: "hidden" }}>
          <ImageBackground source={{ uri: imageUrl }} style={{ padding: 20, minHeight: 200 }}>
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.45)",
              }}
            />
            <View style={{ zIndex: 1 }}>
              <View className="flex-row items-center gap-md mb-md">
                <View
                  className="w-14 h-14 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
                >
                  <Icon name={habit.icon} size={28} color="#fff" />
                </View>
                {progress && (
                  <HabitProgressVisual
                    visualType={habit.visual_type}
                    progress={progress.ratio}
                    size="large"
                    color={accentColor}
                    trackColor="rgba(255,255,255,0.22)"
                  />
                )}
              </View>
              <Text className="text-headline-lg font-bold mb-xs" style={{ color: "#fff" }}>
                {habit.name}
              </Text>
              {habit.description && (
                <Text className="text-body-md" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {habit.description}
                </Text>
              )}
              {progress && (
                <Text className="text-body-md font-semibold mt-sm" style={{ color: accentColor }}>
                  {progress.label}
                </Text>
              )}
            </View>
          </ImageBackground>
        </View>

        {/* Stats */}
        <View className="flex-row mx-margin-mobile mb-lg gap-sm">
          <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md items-center">
            <Text className="text-headline-md font-bold text-primary">{streak}</Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              day streak
            </Text>
          </View>
          <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md items-center">
            <Text className="text-headline-md font-bold text-secondary">{completions.length}</Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              total logs
            </Text>
          </View>
          <View className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md items-center">
            <MaterialCommunityIcons
              name={doneToday ? "check-circle" : "circle-outline"}
              size={28}
              color={doneToday ? "#3EBB7F" : "#8F8A82"}
            />
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {progress?.ratio ? `${Math.round(progress.ratio * 100)}%` : "today"}
            </Text>
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

        {/* Weekly bars */}
        <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
          <Text className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-md">
            THIS WEEK
          </Text>
          <View className="flex-row justify-between">
            {weekDays.map((day) => (
              <View key={day.key} className="items-center gap-xs">
                <View
                  className="w-8 h-8 rounded-full items-center justify-center"
                  style={{ backgroundColor: day.done ? fg : day.future ? "#e1e3e4" : "#E6E0D5" }}
                >
                  {day.done && <MaterialCommunityIcons name="check" size={16} color="#fff" />}
                </View>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                  {day.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Today toggle */}
        <View className="px-margin-mobile gap-sm">
          {habit.target != null && (
            <TouchableOpacity
              className="rounded-full py-sm items-center bg-secondary"
              onPress={handleQuickLog}
              disabled={doneToday}
              style={{ opacity: doneToday ? 0.5 : 1 }}
            >
              <Text className="text-on-primary text-label-lg font-semibold">
                +{formatAmount(habit.default_log_value ?? 1)} {habit.unit ?? ""}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            className={`rounded-full py-sm items-center ${doneToday ? "bg-secondary" : "bg-primary"}`}
            onPress={handleToggle}
            disabled={toggling}
          >
            <Text className="text-on-primary text-label-lg font-semibold">
              {doneToday ? "Mark as undone" : "Mark as done today"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {habit.target != null && <LogEntryFab onPress={() => setShowLogPrompt(true)} />}

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
  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <View className="flex-row items-center justify-between px-margin-mobile py-sm">
        <TouchableOpacity onPress={onBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#F26B1F" />
        </TouchableOpacity>
        <View className="flex-row gap-sm">
          <Skeleton className="w-6 h-6 rounded-full" />
          <Skeleton className="w-6 h-6 rounded-full" />
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
        <View className="mx-margin-mobile mb-lg rounded-2xl p-lg bg-surface-container dark:bg-d-surface-container gap-md">
          <View className="flex-row items-center gap-md">
            <Skeleton className="w-14 h-14 rounded-full" />
            <Skeleton className="rounded-full" style={{ width: 96, height: 96 }} />
          </View>
          <SkeletonText className="h-8" width="72%" />
          <SkeletonText width="86%" />
          <SkeletonText width="54%" />
        </View>

        <View className="flex-row mx-margin-mobile mb-lg gap-sm">
          {[0, 1, 2].map((item) => (
            <View
              key={item}
              className="flex-1 bg-surface-container dark:bg-d-surface-container rounded-xl p-md items-center gap-xs"
            >
              <SkeletonText className="h-7" width={36} />
              <SkeletonText className="h-3" width={64} />
            </View>
          ))}
        </View>

        <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-md gap-md">
          <SkeletonText width={96} />
          <View className="flex-row justify-between">
            {[0, 1, 2, 3, 4, 5, 6].map((item) => (
              <View key={item} className="items-center gap-xs">
                <Skeleton className="w-8 h-8 rounded-full" />
                <SkeletonText className="h-3" width={24} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
