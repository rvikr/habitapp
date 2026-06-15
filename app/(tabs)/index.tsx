import { useState, useCallback, useEffect, useRef } from "react";
import {
  Linking,
  Platform,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { showAlert } from "@/lib/platform/alert";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter, useLocalSearchParams } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getHabitsForToday, getStats } from "@/lib/data/habits";
import { logCompletion, setCompletionValue, toggleHabit } from "@/lib/data/actions";
import { flushPendingCompletions } from "@/lib/data/completion-queue";
import type { StreaksMap } from "@/lib/data/habits";
import { useCelebrate } from "@/components/celebration";
import { useTheme } from "@/components/theme-provider";
import { recordCompletionAndMaybeReview } from "@/lib/platform/store-review";
import {
  FIRST_LOGIN_WELCOME_BODY,
  FIRST_LOGIN_WELCOME_TITLE,
  shouldShowFirstLoginWelcome,
  shouldRequireFirstRunOnboarding,
} from "@/lib/auth/auth-welcome";
import { hasCompletedOnboarding, markOnboardingComplete } from "@/lib/auth/onboarding";
import { TrialEndedBanner, TrialSubscriptionBanner } from "@/components/pro-access-banner";
import NotificationPermissionCard from "@/components/notification-permission-card";
import CoachCard, { CoachHeaderButton } from "@/components/coach-card";
import { dismissCoachCard, isCoachCardDismissed } from "@/lib/coach/coach-card-dismissal";
import HabitCard from "@/components/habit-card";
import ProBadge from "@/components/pro-badge";
import ProgressRing from "@/components/progress-ring";
import LogPrompt from "@/components/log-prompt";
import Skeleton, { SkeletonText } from "@/components/skeleton";
import { useLanguage } from "@/components/language-provider";
import { useTrackingPreferences } from "@/components/tracking-preferences-provider";
import type { Habit } from "@/types/db";
import {
  isQuantityHabit,
  progressForHabit,
  type HabitProgress,
} from "@/lib/coach/habit-intelligence";
import type { CoachSignal } from "@/lib/coach/coach";
import { getCurrentProAccess } from "@/lib/subscription/revenuecat";
import {
  shouldShowTrialEndedBanner,
  shouldShowTrialSubscriptionBanner,
  type ProAccess,
} from "@/lib/subscription/access";
import { getItem, setItem } from "@/lib/platform/storage";
import { syncHomeWidgetFromDashboard } from "@/lib/widgets/home-widget";
import { isStepHabit } from "@/lib/data/steps-shared";
import { GET_APP_URL } from "@/lib/constants";
import {
  getStepPermissionStatus,
  getTodayStepSnapshot,
  isStepTrackingAvailable,
  requestStepPermission,
  watchStepCount,
  type StepSubscription,
} from "@/lib/platform/steps";

type StatsData = Awaited<ReturnType<typeof getStats>>;

type DashboardData = {
  ok: boolean;
  userId: string | null;
  habits: Habit[];
  completedToday: Set<string>;
  todayProgress: Map<string, HabitProgress>;
  streaksMap: StreaksMap;
  profile: { displayName: string; email: string | null };
  leaderboardOptedIn: boolean;
  coachSignal: CoachSignal | null;
  proAccess: ProAccess;
  stats: StatsData;
};

const STEP_SYNC_INTERVAL_MS = 30_000;
const TRIAL_ENDED_DISMISSED_KEY = "habbit:trial-ended-banner-dismissed";
let trialBannerDismissedForSession = false;
let coachUpgradeHintDismissedForSession = false;
// The wizard auto-launches at most once per session: cancelling it must land
// on the dashboard's empty state, not bounce straight back into the wizard.
let wizardAutoLaunchedForSession = false;

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

export default function DashboardScreen() {
  const router = useRouter();
  const celebrate = useCelebrate();
  const { colorScheme } = useTheme();
  const { language, t } = useLanguage();
  const { stepsEnabled: stepTrackingEnabled, hydrated: trackingHydrated } =
    useTrackingPreferences();
  const primary = "#F26B1F";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Assume complete until storage says otherwise so a slow read can't flash
  // the wizard at an onboarded user.
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { newUser } = useLocalSearchParams<{ newUser?: string }>();
  const [showWelcome, setShowWelcome] = useState(newUser === "1");
  const [sleepLogHabit, setSleepLogHabit] = useState<Habit | null>(null);
  const [logHabit, setLogHabit] = useState<Habit | null>(null);
  const [trialBannerDismissed, setTrialBannerDismissed] = useState(trialBannerDismissedForSession);
  const [trialEndedDismissedAt, setTrialEndedDismissedAt] = useState<string | null>(null);
  const [coachHintDismissed, setCoachHintDismissed] = useState(coachUpgradeHintDismissedForSession);
  // null = automatic (auto-show unless dismissed today); the bot button toggles
  // an explicit override so it survives as a manual entry point.
  const [coachCardOverride, setCoachCardOverride] = useState<"shown" | "hidden" | null>(null);
  // Pessimistic default avoids a flash of the card before storage answers.
  const [coachCardDismissed, setCoachCardDismissed] = useState(true);
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

  useEffect(() => {
    let cancelled = false;
    getItem(TRIAL_ENDED_DISMISSED_KEY).then((value) => {
      if (!cancelled && value) setTrialEndedDismissedAt(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (options?: { force?: boolean }) => {
    try {
      // Replay any completions queued while offline before reading, so the
      // dashboard reflects them as soon as connectivity returns.
      await flushPendingCompletions().catch(() => undefined);
      const [result, proAccess, stats] = await Promise.all([
        getHabitsForToday(options),
        getCurrentProAccess(),
        getStats(options),
      ]);

      if (!result.ok) {
        // A failed load must never clobber a rendered dashboard, and must
        // never masquerade as "no habits" (which would trigger onboarding).
        if (!dataRef.current) setLoadFailed(true);
        return;
      }

      setLoadFailed(false);
      if (result.userId) {
        if (result.habits.length > 0) {
          // Anyone with habits has, by definition, finished onboarding —
          // existing users are grandfathered in without a wizard pass.
          setOnboardingComplete(true);
          void markOnboardingComplete(result.userId);
        } else {
          setOnboardingComplete(await hasCompletedOnboarding(result.userId));
        }
        setOnboardingChecked(true);
      }

      setData({
        ...result,
        completedToday: result.completedToday,
        todayProgress: result.todayProgress,
        streaksMap: result.streaksMap,
        proAccess,
        stats,
      });
    } catch {
      if (!dataRef.current) setLoadFailed(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const coachSignal = data?.coachSignal ?? null;
  const coachSignalKind = coachSignal?.kind ?? null;
  const coachSignalHabitId = coachSignal?.habitId ?? null;

  // Re-check persisted dismissal (and drop any manual override) only when the
  // signal identity changes — the 30s dashboard reload recreates the signal
  // object, and resetting on every load would undo the user's choice.
  useEffect(() => {
    setCoachCardOverride(null);
    if (!coachSignalKind || !coachSignalHabitId) return;
    let cancelled = false;
    void isCoachCardDismissed({ kind: coachSignalKind, habitId: coachSignalHabitId }).then(
      (dismissed) => {
        if (!cancelled) setCoachCardDismissed(dismissed);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [coachSignalKind, coachSignalHabitId]);

  const coachSignalActive = !!coachSignal && !data?.completedToday.has(coachSignal.habitId);
  // Encouragement is the daily fallback signal — auto-surfacing it would train
  // users to ignore the card, so it only appears via the bot button.
  const coachCardVisible =
    coachSignalActive &&
    !!coachSignal &&
    (coachCardOverride === "shown" ||
      (coachCardOverride !== "hidden" &&
        !coachCardDismissed &&
        coachSignal.kind !== "encouragement"));

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
  const requiresFirstRunOnboarding =
    data && onboardingChecked
      ? shouldRequireFirstRunOnboarding({
          habitCount: data.habits.length,
          dataOk: data.ok,
          onboardingComplete,
        })
      : false;
  const showWelcomeBanner =
    showWelcome && data
      ? shouldShowFirstLoginWelcome({ newUser, habitCount: data.habits.length })
      : false;
  const showTrialBanner = data
    ? shouldShowTrialSubscriptionBanner(data.proAccess, trialBannerDismissed)
    : false;
  const showTrialEndedBanner = data
    ? shouldShowTrialEndedBanner(data.proAccess, trialEndedDismissedAt)
    : false;

  useEffect(() => {
    if (requiresFirstRunOnboarding && !wizardAutoLaunchedForSession) {
      wizardAutoLaunchedForSession = true;
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
    if (!trackingHydrated) return;
    if (!stepHabit || !stepTrackingEnabled) {
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
  }, [
    stepHabit,
    stepHabitSyncKey,
    stepTrackingEnabled,
    stopStepWatcher,
    syncStepHabit,
    trackingHydrated,
  ]);

  useEffect(() => {
    return () => {
      stepSubscriptionRef.current?.remove();
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    if (
      stepHabit &&
      stepTrackingEnabled &&
      (stepTracking.status === "tracking" || stepTracking.status === "synced")
    ) {
      await syncStepHabit(stepHabit, false, true);
    }
    setRefreshing(false);
  }, [load, stepHabit, stepTrackingEnabled, stepTracking.status, syncStepHabit]);

  async function handleToggle(habit: Habit) {
    if (!data) return;
    if (isStepHabit(habit) && stepTrackingEnabled) {
      const ok = await syncStepHabit(habit, true, true);
      if (!ok) {
        showAlert(
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

    // Quantity habits (water, reading, steps…) can't be finished in one tap.
    // Tapping when not done opens the log sheet instead of writing the full target.
    if (isQuantityHabit(habit) && !wasDone) {
      setLogHabit(habit);
      return;
    }

    const previous = data.completedToday;
    const next = new Set(previous);
    if (wasDone) next.delete(habitId);
    else next.add(habitId);
    setData({ ...data, completedToday: next });
    const result = await toggleHabit(habitId, wasDone, habit.target as number | null);
    if (!result.ok) {
      setData((current) => (current ? { ...current, completedToday: previous } : current));
      showAlert(t("Could not update habit"), result.error ?? t("Try again."));
      return;
    }
    if (!wasDone) {
      celebrate();
      recordCompletionAndMaybeReview();
    }
    // A queued (offline) write isn't on the server yet — refetching now would
    // revert the optimistic state. The queue flushes on the next focus/load.
    if (!result.queued) load({ force: true });
  }

  async function handleLogSheetSubmit(value: number, note: string) {
    if (!logHabit) return { ok: false, error: t("Habit not loaded.") };
    const wasDone = data?.completedToday.has(logHabit.id) ?? false;
    const prevValue = data?.todayProgress.get(logHabit.id)?.current ?? 0;
    const target = logHabit.target != null ? Number(logHabit.target) : null;
    const result = await logCompletion(logHabit.id, value, note);
    if (!result.ok) return result;
    setLogHabit(null);
    // logCompletion adds incrementally, so today's new total is prev + value.
    const nowDone = target != null && target > 0 ? prevValue + value >= target : true;
    if (!wasDone && nowDone) {
      celebrate();
      recordCompletionAndMaybeReview();
    }
    if (!result.queued) load({ force: true });
    return { ok: true as const };
  }

  async function handleMarkAllDone() {
    if (!logHabit) return { ok: false, error: t("Habit not loaded.") };
    const result = await toggleHabit(logHabit.id, false, logHabit.target as number | null);
    if (!result.ok) return result;
    setLogHabit(null);
    celebrate();
    recordCompletionAndMaybeReview();
    if (!result.queued) load({ force: true });
    return { ok: true as const };
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
        showAlert(t("Could not log progress"), result.error ?? t("Try again."));
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
  const isInitialLoading = data === null;

  useEffect(() => {
    if (!data) return;
    void syncHomeWidgetFromDashboard({
      completedCount,
      totalHabits: total,
      currentStreak: data.stats?.currentStreak ?? 0,
      level: data.stats?.level ?? 1,
      locale: language === "hi" ? "hi-IN" : "en-US",
    });
  }, [completedCount, data, language, total]);

  // First load failed and there is nothing cached to show — offer a retry
  // instead of a permanent skeleton (or, worse, a spurious onboarding bounce).
  if (loadFailed && !data) {
    return (
      <SafeAreaView
        className="flex-1 bg-background dark:bg-d-background items-center justify-center px-margin-mobile"
        edges={["top"]}
      >
        <View className="w-16 h-16 rounded-full bg-surface-container dark:bg-d-surface-container items-center justify-center mb-lg">
          <MaterialCommunityIcons name="wifi-off" size={28} color={primary} />
        </View>
        <Text className="text-headline-md text-on-background dark:text-d-on-background font-bold mb-sm text-center">
          {t("Couldn't load your habits")}
        </Text>
        <Text className="text-body-md text-on-surface-variant dark:text-d-on-surface-variant text-center mb-lg">
          {t("Check your connection and try again. Your data is safe.")}
        </Text>
        <TouchableOpacity
          className="bg-primary rounded-full py-md px-xl items-center"
          onPress={() => {
            setLoadFailed(false);
            load({ force: true });
          }}
        >
          <Text className="text-on-primary text-label-lg font-semibold">{t("Retry")}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background dark:bg-d-background" edges={["top"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome banner */}
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

        {showTrialBanner && data?.proAccess.trialDaysLeft ? (
          <View className="mx-margin-mobile mt-md mb-xs">
            <TrialSubscriptionBanner
              daysLeft={data.proAccess.trialDaysLeft}
              onAction={() => router.push("/pro" as never)}
              onDismiss={() => {
                trialBannerDismissedForSession = true;
                setTrialBannerDismissed(true);
              }}
            />
          </View>
        ) : null}

        {showTrialEndedBanner && data?.proAccess.trialEndedAt ? (
          <View className="mx-margin-mobile mt-md mb-xs">
            <TrialEndedBanner
              onAction={() => router.push("/pro" as never)}
              onDismiss={() => {
                const endedAt = data.proAccess.trialEndedAt as string;
                setTrialEndedDismissedAt(endedAt);
                void setItem(TRIAL_ENDED_DISMISSED_KEY, endedAt);
              }}
            />
          </View>
        ) : null}

        {/* Reminder permission prompt — self-hides once notifications are granted */}
        <View className="mt-md">
          <NotificationPermissionCard />
        </View>

        {/* Header */}
        <View className="flex-row items-center justify-between px-margin-mobile pt-md pb-sm">
          <View className="flex-1 pr-sm">
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
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {isInitialLoading ? "" : t("Hey, {name}", { name: data.profile.displayName })}
            </Text>
            {!isInitialLoading && (data?.stats?.level || data?.proAccess) ? (
              <View className="flex-row items-center gap-sm mt-xs flex-wrap">
                {data?.stats?.level ? (
                  <View
                    className="bg-primary-fixed flex-row items-center gap-1 px-sm rounded-full"
                    style={{ paddingVertical: 3 }}
                  >
                    <MaterialCommunityIcons name="star" size={10} color={primary} />
                    <Text style={{ color: primary, fontSize: 11, fontWeight: "700" }}>
                      L{data.stats.level}
                    </Text>
                  </View>
                ) : null}
                {data?.proAccess ? <ProBadge access={data.proAccess} /> : null}
              </View>
            ) : null}
            {isInitialLoading && <SkeletonText className="mt-xs h-8" width={152} />}
          </View>
          <View className="flex-row items-center gap-sm shrink-0">
            <CoachHeaderButton
              signal={coachSignal}
              active={coachSignalActive}
              cardVisible={coachCardVisible}
              onPress={() => setCoachCardOverride(coachCardVisible ? "hidden" : "shown")}
            />
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-primary-fixed items-center justify-center"
              onPress={() => router.push("/habits/new")}
            >
              <MaterialCommunityIcons name="plus" size={22} color={primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Coach card — auto-shown when a signal needs attention */}
        {coachCardVisible && coachSignal && (
          <CoachCard
            signal={coachSignal}
            hasPro={data?.proAccess.hasPro ?? false}
            onAction={(signal) => {
              setCoachCardOverride("hidden");
              void handleCoachAction(signal);
            }}
            onOpenHabit={(habitId) => {
              setCoachCardOverride("hidden");
              router.push(`/habits/${habitId}`);
            }}
            onDismiss={() => {
              setCoachCardOverride("hidden");
              setCoachCardDismissed(true);
              void dismissCoachCard(coachSignal);
            }}
            onUpsell={() => {
              setCoachCardOverride("hidden");
              router.push("/pro" as never);
            }}
            upsellDismissed={coachHintDismissed}
            onUpsellDismiss={() => {
              coachUpgradeHintDismissedForSession = true;
              setCoachHintDismissed(true);
            }}
          />
        )}

        {/* Today's progress card */}
        {!isInitialLoading && total > 0 && (
          <View className="mx-margin-mobile mb-md bg-surface-container dark:bg-d-surface-container rounded-2xl p-lg flex-row items-center justify-between">
            <View className="flex-1 pr-md">
              <Text
                className="text-headline-md text-on-background dark:text-d-on-background"
                style={{ fontFamily: "SpaceGrotesk_600SemiBold", letterSpacing: -0.3 }}
              >
                {t("Today's Focus")}
              </Text>
              <Text className="text-body-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
                {completedCount === total
                  ? t("All done! Great work 🎉")
                  : t("{done} of {total} done", { done: completedCount, total })}
              </Text>
            </View>
            <View style={{ width: 88, height: 88, alignItems: "center", justifyContent: "center" }}>
              <ProgressRing
                progress={progress}
                size={88}
                strokeWidth={8}
                color={primary}
                trackColor={colorScheme === "dark" ? "#353540" : "#E6E0D5"}
              >
                <Text
                  className="text-primary"
                  style={{
                    fontSize: 22,
                    fontFamily: "SpaceGrotesk_700Bold",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {Math.round(progress * 100)}%
                </Text>
              </ProgressRing>
              {/* Glowing indicator at the top of the ring (matches design) */}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -1,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: primary,
                  shadowColor: primary,
                  shadowOpacity: 0.9,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                  elevation: 6,
                }}
              />
            </View>
          </View>
        )}

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

        {/* Web has no pedometer, so auto step tracking is messaged once in Settings.
            Suppress the dashboard prompt here to avoid a redundant "Get the app" card. */}
        {Platform.OS !== "web" &&
          stepHabit &&
          stepTrackingEnabled &&
          !["idle", "tracking", "synced", "checking", "syncing"].includes(stepTracking.status) && (
            <StepTrackingCard
              state={stepTracking}
              primary={primary}
              onEnable={() => syncStepHabit(stepHabit, true, true)}
            />
          )}

        <LogPrompt
          visible={sleepLogHabit !== null}
          habit={sleepLogHabit}
          onSubmit={handleSleepCoachLog}
          onDismiss={() => setSleepLogHabit(null)}
        />

        <LogPrompt
          visible={logHabit !== null}
          habit={logHabit}
          currentValue={logHabit ? (data?.todayProgress.get(logHabit.id)?.current ?? 0) : 0}
          onSubmit={handleLogSheetSubmit}
          onMarkAllDone={handleMarkAllDone}
          onDismiss={() => setLogHabit(null)}
        />

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
            Array.from({ length: Math.ceil(habits.length / 2) }, (_, rowIdx) => {
              const pair = habits.slice(rowIdx * 2, rowIdx * 2 + 2);
              return (
                <View key={rowIdx} className="flex-row gap-sm">
                  {pair.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      variant="grid"
                      style={{ flex: 1 }}
                      habit={habit}
                      done={data?.completedToday.has(habit.id) ?? false}
                      progress={data?.todayProgress.get(habit.id)}
                      streak={data?.streaksMap.get(habit.id) ?? 0}
                      onToggle={() => handleToggle(habit)}
                      onPress={() => router.push(`/habits/${habit.id}`)}
                    />
                  ))}
                  {pair.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              );
            })
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

function DashboardHabitSkeleton() {
  return (
    <View className="gap-sm">
      <View className="flex-row gap-sm">
        <Skeleton className="flex-1 rounded-2xl" style={{ height: 130 }} />
        <Skeleton className="flex-1 rounded-2xl" style={{ height: 130 }} />
      </View>
      <View className="flex-row gap-sm">
        <Skeleton className="flex-1 rounded-2xl" style={{ height: 130 }} />
        <Skeleton className="flex-1 rounded-2xl" style={{ height: 130 }} />
      </View>
    </View>
  );
}

function StepTrackingCard({ state, primary, onEnable }: StepTrackingCardProps) {
  const { t } = useLanguage();
  const busy = state.status === "checking" || state.status === "syncing";
  const webUnsupported = Platform.OS === "web" && state.status === "unsupported";
  const disabled = busy || (state.status === "unsupported" && !webUnsupported);
  const titleKey = webUnsupported
    ? "Track steps automatically with the app"
    : state.status === "unsupported"
      ? "Step tracking is unavailable"
      : state.status === "providerUpdateRequired"
        ? "Health Connect needs an update"
        : state.status === "denied"
          ? "Step tracking permission is off"
          : state.status === "error"
            ? "Step tracking needs attention"
            : "Enable step tracking";
  const bodyKey = webUnsupported
    ? "Automatic step tracking works in the Lagan iOS and Android app. Steps synced there appear here too — or log steps manually."
    : state.status === "unsupported"
      ? "This device does not expose a pedometer here. Manual step logging still works."
      : state.status === "providerUpdateRequired"
        ? "Update or install Health Connect, then retry. Manual step logging still works."
        : state.status === "denied"
          ? "Enable Health Connect steps access or motion access, or log steps manually from the habit screen."
          : "Use Health Connect to update your Walk habit from today's Android step total.";
  const body =
    state.status === "error" ? (state.error ?? t("Could not sync steps. Try again.")) : t(bodyKey);
  const action = busy
    ? t("Checking...")
    : webUnsupported
      ? t("Get the app")
      : state.status === "denied"
        ? t("Retry")
        : t("Enable");

  return (
    <TouchableOpacity
      onPress={webUnsupported ? () => Linking.openURL(GET_APP_URL) : onEnable}
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
