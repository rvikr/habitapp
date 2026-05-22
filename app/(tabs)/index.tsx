import { useState, useCallback, useEffect, useRef } from "react";
import { Alert, View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabitsForToday, getInsights } from "@/lib/data/habits";
import { logCompletion, setCompletionValue, toggleHabit } from "@/lib/data/actions";
import InsightsStrip from "@/components/insights-strip";
import type { Insights, StreaksMap } from "@/lib/data/habits";
import { useCelebrate } from "@/components/celebration";
import { useTheme } from "@/components/theme-provider";
import { recordCompletionAndMaybeReview } from "@/lib/platform/store-review";
import {
  FIRST_LOGIN_WELCOME_BODY,
  FIRST_LOGIN_WELCOME_TITLE,
  shouldShowFirstLoginWelcome,
  shouldRequireFirstRunOnboarding,
} from "@/lib/auth/auth-welcome";
import HabitCard from "@/components/habit-card";
import CoachCard from "@/components/coach-card";
import LogPrompt from "@/components/log-prompt";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import { useLanguage } from "@/components/language-provider";
import type { Habit } from "@/types/db";
import { progressForHabit, type HabitProgress } from "@/lib/coach/habit-intelligence";
import type { CoachSignal } from "@/lib/coach/coach";
import {
  getStepPermissionStatus,
  getTodayStepSnapshot,
  isStepTrackingAvailable,
  requestStepPermission,
  watchStepCount,
  type StepSubscription,
} from "@/lib/platform/steps";
import Svg, { Circle } from "react-native-svg";

type DashboardData = {
  habits: Habit[];
  completedToday: Set<string>;
  todayProgress: Map<string, HabitProgress>;
  streaksMap: StreaksMap;
  profile: { displayName: string; email: string | null };
  insights: Insights;
  leaderboardOptedIn: boolean;
  coachSignal: CoachSignal | null;
};

const STEP_SYNC_INTERVAL_MS = 30_000;

type StepTrackingStatus =
  | "idle"
  | "checking"
  | "needsPermission"
  | "denied"
  | "unsupported"
  | "providerUpdateRequired"
  | "tracking"
  | "syncing"
  | "synced"
  | "error";
type StepTrackingState = {
  status: StepTrackingStatus;
  lastSyncedAt: number | null;
  error?: string;
};

function isStepHabit(habit: Habit): boolean {
  return habit.metric_type === "steps" || habit.habit_type === "walk" || habit.unit === "steps";
}

export default function DashboardScreen() {
  const router = useRouter();
  const celebrate = useCelebrate();
  const { colorScheme } = useTheme();
  const { language, t } = useLanguage();
  const primary = "#F26B1F";
  const primaryTrack = colorScheme === "dark" ? "#2C2C36" : "#E6E0D5";
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { newUser } = useLocalSearchParams<{ newUser?: string }>();
  const [showWelcome, setShowWelcome] = useState(newUser === "1");
  const [sleepLogHabit, setSleepLogHabit] = useState<Habit | null>(null);
  const [stepTracking, setStepTracking] = useState<StepTrackingState>({
    status: "idle",
    lastSyncedAt: null,
  });
  const dataRef = useRef<DashboardData | null>(null);
  const stepSubscriptionRef = useRef<StepSubscription | null>(null);
  const stepTrackingHabitIdRef = useRef<string | null>(null);
  const stepTrackingHabitSyncKeyRef = useRef<string | null>(null);
  const stepBaseRef = useRef(0);
  const lastStepValueRef = useRef(0);
  const lastStepSaveAtRef = useRef(0);
  const stepSavingRef = useRef(false);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (newUser === "1") setShowWelcome(true);
  }, [newUser]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const [result, insights] = await Promise.all([
      getHabitsForToday(options),
      getInsights(options),
    ]);
    setData({
      ...result,
      completedToday: result.completedToday,
      todayProgress: result.todayProgress,
      streaksMap: result.streaksMap,
      insights,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const habits = data?.habits ?? [];
  const stepHabit = habits.find(isStepHabit) ?? null;
  const stepHabitSyncKey = stepHabit
    ? [
        stepHabit.id,
        stepHabit.habit_type,
        stepHabit.metric_type,
        stepHabit.target,
        stepHabit.unit,
      ].join(":")
    : null;
  const requiresFirstRunOnboarding = data
    ? shouldRequireFirstRunOnboarding({ newUser, habitCount: data.habits.length })
    : false;
  const showWelcomeBanner =
    showWelcome && data
      ? shouldShowFirstLoginWelcome({ newUser, habitCount: data.habits.length })
      : false;

  useEffect(() => {
    if (requiresFirstRunOnboarding) {
      router.replace("/habits/wizard" as never);
    }
  }, [requiresFirstRunOnboarding, router]);

  useEffect(() => {
    if (data && !showWelcomeBanner) setShowWelcome(false);
  }, [data, showWelcomeBanner]);

  const stopStepWatcher = useCallback(() => {
    stepSubscriptionRef.current?.remove();
    stepSubscriptionRef.current = null;
    stepTrackingHabitIdRef.current = null;
    stepTrackingHabitSyncKeyRef.current = null;
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        const habit = dataRef.current?.habits.find(
          (item) => item.id === stepTrackingHabitIdRef.current,
        );
        const steps = lastStepValueRef.current;
        if (habit && steps > 0) {
          void setCompletionValue(habit.id, steps, "Synced from step counter");
        }
        stepSubscriptionRef.current?.remove();
        stepSubscriptionRef.current = null;
        stepTrackingHabitIdRef.current = null;
        stepTrackingHabitSyncKeyRef.current = null;
      };
    }, []),
  );

  const updateLocalStepProgress = useCallback((habit: Habit, value: number) => {
    setData((current) => {
      if (!current || !current.habits.some((item) => item.id === habit.id)) return current;
      const progress = progressForHabit(habit, { value });
      const nextProgress = new Map(current.todayProgress);
      const nextCompleted = new Set(current.completedToday);
      nextProgress.set(habit.id, progress);
      if (progress.isDone) nextCompleted.add(habit.id);
      else nextCompleted.delete(habit.id);
      return { ...current, completedToday: nextCompleted, todayProgress: nextProgress };
    });
  }, []);

  const persistStepCount = useCallback(async (habit: Habit, value: number, force = false) => {
    const steps = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    if (steps <= 0) return;

    const now = Date.now();
    if (!force && now - lastStepSaveAtRef.current < STEP_SYNC_INTERVAL_MS) return;
    if (stepSavingRef.current) return;

    stepSavingRef.current = true;
    const result = await setCompletionValue(habit.id, steps, "Synced from step counter");
    stepSavingRef.current = false;

    if (!result.ok) {
      setStepTracking({
        status: "error",
        lastSyncedAt: lastStepSaveAtRef.current || null,
        error: result.error,
      });
      return;
    }

    lastStepSaveAtRef.current = now;
    setStepTracking({ status: "tracking", lastSyncedAt: now });
  }, []);

  const syncStepHabit = useCallback(
    async (habit: Habit, shouldRequestPermission: boolean, forcePersist = true) => {
      setStepTracking((current) => ({
        ...current,
        status: current.status === "tracking" ? "syncing" : "checking",
      }));

      const available = await isStepTrackingAvailable();
      if (!available) {
        stopStepWatcher();
        setStepTracking({ status: "unsupported", lastSyncedAt: null });
        return false;
      }

      let permission = await getStepPermissionStatus();
      if (permission !== "granted" && shouldRequestPermission) {
        permission = await requestStepPermission();
      }

      if (permission !== "granted") {
        stopStepWatcher();
        setStepTracking({
          status:
            permission === "providerUpdateRequired"
              ? "providerUpdateRequired"
              : permission === "unavailable"
                ? "unsupported"
                : permission === "denied"
                  ? "denied"
                  : "needsPermission",
          lastSyncedAt: null,
        });
        return false;
      }

      const savedValue = dataRef.current?.todayProgress.get(habit.id)?.current ?? 0;
      const snapshot = await getTodayStepSnapshot();
      if (snapshot.status === "providerUpdateRequired") {
        stopStepWatcher();
        setStepTracking({ status: "providerUpdateRequired", lastSyncedAt: null });
        return false;
      }
      if (snapshot.status === "unavailable" && snapshot.source !== "pedometer") {
        stopStepWatcher();
        setStepTracking({ status: "unsupported", lastSyncedAt: null });
        return false;
      }
      if (snapshot.status !== "granted") {
        stopStepWatcher();
        setStepTracking({
          status: snapshot.status === "denied" ? "denied" : "needsPermission",
          lastSyncedAt: null,
        });
        return false;
      }

      const baseline = Math.max(savedValue, snapshot.steps ?? 0);
      stepBaseRef.current = baseline;
      lastStepValueRef.current = baseline;
      stepTrackingHabitIdRef.current = habit.id;
      stepTrackingHabitSyncKeyRef.current = stepHabitSyncKey;

      if (baseline > 0) {
        updateLocalStepProgress(habit, baseline);
        await persistStepCount(habit, baseline, forcePersist);
      }

      if (!snapshot.canWatch) {
        stopStepWatcher();
        setStepTracking({ status: "synced", lastSyncedAt: Date.now() });
        return true;
      }

      stepSubscriptionRef.current?.remove();
      const subscription = watchStepCount((sessionSteps) => {
        const totalSteps = Math.max(lastStepValueRef.current, stepBaseRef.current + sessionSteps);
        if (totalSteps <= lastStepValueRef.current) return;
        lastStepValueRef.current = totalSteps;
        updateLocalStepProgress(habit, totalSteps);
        void persistStepCount(habit, totalSteps);
      });

      if (!subscription) {
        setStepTracking({
          status: "error",
          lastSyncedAt: lastStepSaveAtRef.current || null,
          error: "Could not start step tracking.",
        });
        return false;
      }

      stepSubscriptionRef.current = subscription;
      setStepTracking((current) => ({ status: "tracking", lastSyncedAt: current.lastSyncedAt }));
      return true;
    },
    [persistStepCount, stepHabitSyncKey, stopStepWatcher, updateLocalStepProgress],
  );

  useEffect(() => {
    if (!stepHabit) {
      stopStepWatcher();
      setStepTracking({ status: "idle", lastSyncedAt: null });
      return;
    }

    if (
      stepTrackingHabitIdRef.current === stepHabit.id &&
      stepTrackingHabitSyncKeyRef.current === stepHabitSyncKey &&
      stepSubscriptionRef.current
    ) {
      return;
    }
    void syncStepHabit(stepHabit, false, true);
  }, [stepHabit, stepHabitSyncKey, stopStepWatcher, syncStepHabit]);

  useEffect(() => {
    return () => {
      stepSubscriptionRef.current?.remove();
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    if (stepHabit && (stepTracking.status === "tracking" || stepTracking.status === "synced")) {
      await syncStepHabit(stepHabit, false, true);
    }
    setRefreshing(false);
  }, [load, stepHabit, stepTracking.status, syncStepHabit]);

  async function handleToggle(habit: Habit) {
    if (!data) return;
    if (isStepHabit(habit)) {
      const ok = await syncStepHabit(habit, true, true);
      if (!ok) {
        Alert.alert(
          t("Step tracking unavailable"),
          t(
            "Open the habit to log steps manually, or enable motion access in your device settings.",
          ),
        );
      }
      return;
    }

    const habitId = habit.id;
    const wasDone = data.completedToday.has(habitId);
    const previous = data.completedToday;
    const next = new Set(previous);
    if (wasDone) next.delete(habitId);
    else next.add(habitId);
    setData({ ...data, completedToday: next });
    const result = await toggleHabit(habitId, wasDone, habit.target as number | null);
    if (!result.ok) {
      setData((current) => (current ? { ...current, completedToday: previous } : current));
      Alert.alert(t("Could not update habit"), result.error ?? t("Try again."));
      return;
    }
    if (!wasDone) {
      celebrate();
      recordCompletionAndMaybeReview();
    }
    load({ force: true });
  }

  function isSleepHabit(habit: Habit): boolean {
    return habit.habit_type === "sleep" || habit.metric_type === "hours";
  }

  async function handleCoachAction(signal: CoachSignal) {
    const habit = data?.habits.find((h) => h.id === signal.habitId) ?? null;
    if (signal.suggestedAction === "log_value" && habit && isSleepHabit(habit)) {
      setSleepLogHabit(habit);
      return;
    }
    if (signal.suggestedAction === "log_value" && signal.suggestedValue) {
      const result = await logCompletion(
        signal.habitId,
        signal.suggestedValue,
        "Logged from AI coach",
      );
      if (!result.ok) {
        Alert.alert(t("Could not log progress"), result.error ?? t("Try again."));
        return;
      }
      celebrate();
      recordCompletionAndMaybeReview();
      load({ force: true });
      return;
    }
    router.push(`/habits/${signal.habitId}`);
  }

  async function handleSleepCoachLog(value: number, note: string) {
    if (!sleepLogHabit) return { ok: false, error: t("Habit not loaded.") };
    const result = await logCompletion(sleepLogHabit.id, value, note || "Logged from AI coach");
    if (!result.ok) return { ok: false, error: result.error ?? t("Try again.") };
    setSleepLogHabit(null);
    celebrate();
    recordCompletionAndMaybeReview();
    load({ force: true });
    return { ok: true };
  }

  const completedCount = data
    ? [...data.completedToday].filter((id) => habits.some((h) => h.id === id)).length
    : 0;
  const total = habits.length;
  const progress = total > 0 ? completedCount / total : 0;
  const progressItems = data ? [...data.todayProgress.values()] : [];
  const metricProgress =
    total > 0 ? progressItems.reduce((sum, item) => sum + item.ratio, 0) / total : 0;
  const activeProgress =
    total > 0 ? progressItems.filter((item) => item.current > 0 || item.isDone).length / total : 0;
  const isInitialLoading = data === null;

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome banner - shown once after new account creation */}
        {showWelcomeBanner && (
          <TouchableOpacity
            onPress={() => setShowWelcome(false)}
            className="mx-margin-mobile mt-md mb-xs bg-primary-fixed dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
          >
            <MaterialCommunityIcons name="party-popper" size={22} color={primary} />
            <View className="flex-1">
              <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">
                {t(FIRST_LOGIN_WELCOME_TITLE)}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t(FIRST_LOGIN_WELCOME_BODY)}
              </Text>
            </View>
            <MaterialCommunityIcons name="close" size={18} color={primary} />
          </TouchableOpacity>
        )}

        {/* Header */}
        <View className="flex-row items-center justify-between px-margin-mobile pt-md pb-sm">
          <View>
            <Text
              className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant"
              style={{ letterSpacing: 0.3, textTransform: "uppercase" }}
            >
              {new Date().toLocaleDateString(language === "hi" ? "hi-IN" : "en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </Text>
            <Text
              className="text-headline-lg text-on-background dark:text-d-on-background"
              style={{ fontFamily: "SpaceGrotesk_600SemiBold", letterSpacing: -0.5 }}
            >
              {isInitialLoading ? "" : t("Hey, {name}", { name: data.profile.displayName })}
            </Text>
            {isInitialLoading && <SkeletonText className="mt-xs h-8" width={152} />}
          </View>
          <View className="flex-row items-center gap-sm">
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-primary-fixed items-center justify-center"
              onPress={() => router.push("/habits/new")}
            >
              <MaterialCommunityIcons name="plus" size={22} color={primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Habit status */}
        <View className="items-center py-lg">
          {isInitialLoading && <DashboardProgressSkeleton />}
          {!isInitialLoading && (
            <>
              <HabitStatusRings
                completedProgress={progress}
                metricProgress={metricProgress}
                activeProgress={activeProgress}
                completedCount={completedCount}
                total={total}
                trackColor={primaryTrack}
              />
              <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant mt-sm">
                {completedCount === total && total > 0
                  ? t("All done! Great work 🎉")
                  : t(
                      total - completedCount === 1
                        ? "{count} habit remaining"
                        : "{count} habits remaining",
                      { count: total - completedCount },
                    )}
              </Text>
            </>
          )}
        </View>

        {/* Leaderboard opt-in banner */}
        {data && !data.leaderboardOptedIn && (
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/leaderboard")}
            className="mx-margin-mobile mb-sm bg-primary-fixed dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
          >
            <MaterialCommunityIcons name="trophy-outline" size={22} color={primary} />
            <View className="flex-1">
              <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">
                {t("Join the global leaderboard")}
              </Text>
              <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
                {t("Set a display name to rank with others")}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={primary} />
          </TouchableOpacity>
        )}

        {stepHabit && !["idle", "tracking", "synced"].includes(stepTracking.status) && (
          <StepTrackingCard
            state={stepTracking}
            primary={primary}
            onEnable={() => syncStepHabit(stepHabit, true, true)}
          />
        )}

        {data?.coachSignal && !data.completedToday.has(data.coachSignal.habitId) && (
          <CoachCard
            signal={data.coachSignal}
            onPress={() => router.push(`/habits/${data.coachSignal!.habitId}`)}
            onAction={() => handleCoachAction(data.coachSignal!)}
          />
        )}

        <LogPrompt
          visible={sleepLogHabit !== null}
          habit={sleepLogHabit}
          onSubmit={handleSleepCoachLog}
          onDismiss={() => setSleepLogHabit(null)}
        />

        {/* Weekly insights */}
        {isInitialLoading ? (
          <View className="mt-sm mb-lg px-margin-mobile">
            <Skeleton className="h-20 rounded-xl" />
          </View>
        ) : data?.insights ? (
          <View className="mt-sm mb-lg">
            <InsightsStrip insights={data.insights} />
          </View>
        ) : null}

        {/* Habits list */}
        <View className="px-margin-mobile gap-sm">
          <Text
            className="text-label-lg text-on-surface-variant dark:text-d-on-surface-variant mb-xs"
            style={{ letterSpacing: 0.6 }}
          >
            {t("TODAY'S HABITS")}
          </Text>
          {isInitialLoading ? (
            <DashboardHabitSkeleton />
          ) : habits.length === 0 ? (
            <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-lg gap-md">
              <View className="items-center gap-sm">
                <View className="w-14 h-14 rounded-full bg-primary-fixed items-center justify-center">
                  <MaterialCommunityIcons name="auto-fix" size={28} color={primary} />
                </View>
                <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
                  {t("Build your first routine")}
                </Text>
                <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant text-center">
                  {t("Answer a few questions and get a small habit routine matched to your day.")}
                </Text>
              </View>
              <TouchableOpacity
                className="bg-primary rounded-full py-sm items-center"
                onPress={() => router.push("/habits/wizard")}
              >
                <Text className="text-on-primary text-label-lg font-semibold">
                  {t("Build my routine")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-surface-lowest dark:bg-d-surface-lowest rounded-full py-sm items-center"
                onPress={() => router.push("/habits/new")}
              >
                <Text className="text-primary text-label-lg font-semibold">
                  {t("Choose manually")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            habits.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                done={data?.completedToday.has(habit.id) ?? false}
                progress={data?.todayProgress.get(habit.id)}
                streak={data?.streaksMap.get(habit.id) ?? 0}
                onToggle={() => handleToggle(habit)}
                onPress={() => router.push(`/habits/${habit.id}`)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type StepTrackingCardProps = {
  state: StepTrackingState;
  primary: string;
  onEnable: () => void;
};

function DashboardProgressSkeleton() {
  return (
    <View className="items-center gap-sm">
      <Skeleton className="rounded-full" style={{ width: 184, height: 184 }} />
      <SkeletonText width={180} />
    </View>
  );
}

function DashboardHabitSkeleton() {
  return (
    <>
      {[0, 1, 2].map((item) => (
        <View
          key={item}
          className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
        >
          <Skeleton className="w-12 h-12 rounded-full" />
          <View className="flex-1 gap-xs">
            <SkeletonText width="68%" />
            <SkeletonText className="h-3" width="48%" />
          </View>
          <Skeleton className="w-9 h-9 rounded-full" />
        </View>
      ))}
    </>
  );
}

function StepTrackingCard({ state, primary, onEnable }: StepTrackingCardProps) {
  const { t } = useLanguage();
  const busy = state.status === "checking" || state.status === "syncing";
  const disabled = busy || state.status === "unsupported";
  const titleKey =
    state.status === "unsupported"
      ? "Step tracking is unavailable"
      : state.status === "providerUpdateRequired"
        ? "Health Connect needs an update"
        : state.status === "denied"
          ? "Step tracking permission is off"
          : state.status === "error"
            ? "Step tracking needs attention"
            : "Enable step tracking";
  const bodyKey =
    state.status === "unsupported"
      ? "This device does not expose a pedometer here. Manual step logging still works."
      : state.status === "providerUpdateRequired"
        ? "Update or install Health Connect, then retry. Manual step logging still works."
        : state.status === "denied"
          ? "Enable Health Connect steps access or motion access, or log steps manually from the habit screen."
          : "Use Health Connect to update your Walk habit from today's Android step total.";
  const body =
    state.status === "error" ? (state.error ?? t("Could not sync steps. Try again.")) : t(bodyKey);
  const action = busy ? t("Checking...") : state.status === "denied" ? t("Retry") : t("Enable");

  return (
    <TouchableOpacity
      onPress={onEnable}
      disabled={disabled}
      className="mx-margin-mobile mb-sm bg-primary-fixed dark:bg-d-surface-container rounded-xl p-md flex-row items-center gap-md"
      style={{ opacity: disabled ? 0.72 : 1 }}
    >
      <MaterialCommunityIcons name="walk" size={24} color={primary} />
      <View className="flex-1">
        <Text className="text-body-sm text-on-background dark:text-d-on-background font-semibold">
          {t(titleKey)}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {body}
        </Text>
      </View>
      {!disabled && <Text className="text-primary text-label-lg font-semibold">{action}</Text>}
    </TouchableOpacity>
  );
}

type StatusArcProps = {
  progress: number;
  size: number;
  strokeWidth: number;
  color: string;
  trackColor: string;
};

function StatusArc({ progress, size, strokeWidth, color, trackColor }: StatusArcProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(progress, 0), 1);

  return (
    <Svg width={size} height={size} style={{ position: "absolute" }}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
        opacity={0.45}
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

type HabitStatusRingsProps = {
  completedProgress: number;
  metricProgress: number;
  activeProgress: number;
  completedCount: number;
  total: number;
  trackColor: string;
};

function HabitStatusRings({
  completedProgress,
  metricProgress,
  activeProgress,
  completedCount,
  total,
  trackColor,
}: HabitStatusRingsProps) {
  return (
    <View style={{ width: 184, height: 184, alignItems: "center", justifyContent: "center" }}>
      <StatusArc
        progress={completedProgress}
        size={176}
        strokeWidth={11}
        color="#F26B1F"
        trackColor={trackColor}
      />
      <StatusArc
        progress={metricProgress}
        size={148}
        strokeWidth={10}
        color="#FFC56B"
        trackColor={trackColor}
      />
      <StatusArc
        progress={activeProgress}
        size={120}
        strokeWidth={9}
        color="#3EBB7F"
        trackColor={trackColor}
      />
      <View className="w-20 h-20 rounded-full bg-surface-lowest dark:bg-d-surface-lowest items-center justify-center">
        <Text className="text-headline-md">
          {completedCount === total && total > 0 ? "😊" : "🙂"}
        </Text>
        <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
          {completedCount}/{total}
        </Text>
      </View>
    </View>
  );
}
