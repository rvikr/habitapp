import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { localDateDaysAgo, localDateKey } from "../utils/date";
import { habitStreakFromDates } from "../coach/streak";
import {
  completedDatesForHabit,
  progressForHabit,
  suggestedCheckInForHabit,
  type CheckInSuggestion,
  type HabitType,
  type MetricType,
  type ReminderStrategy,
  type HabitProgress,
} from "../coach/habit-intelligence";
import type { Habit } from "../../types/db";
import {
  buildCoachSignals,
  chooseTopCoachSignal,
  normalizeCoachTone,
  type CoachSignal,
} from "../coach/coach";
import { resolveCoachMessage } from "../coach/coach-ai";
import { getAiSuggestionsEnabled } from "../services/feature-flags";
import { AI_DISCLOSURE_VERSION } from "../services/ai-access";
import {
  learnedSmartReminderTimesForDay,
  type SmartReminderDecisionContext,
} from "../coach/smart-reminders";
import { resolveAiSmartReminderPlans } from "../coach/smart-reminder-ai";
import { resolveProAccess, type ProAccessProfile } from "../subscription/access";
import { getMyLeaderboardPosition } from "./leaderboard";
import {
  coachTrendSummary,
  reminderTimeForTiming,
  resolveSmartReminderTiming,
  summarizeHabitTrend,
  type SmartReminderTimingSource,
} from "./habit-trends";

export type ReminderContext = {
  streak: number;
  typicalHour: number | null;
  percentileAhead: number | null;
};

export type ScheduledReminder = {
  habitId: string;
  habitName: string;
  time?: string;
  days?: number[];
  fireAt?: Date;
  icon: string;
  strategy: ReminderStrategy;
  context: ReminderContext;
  progress?: HabitProgress;
  suggestion?: CheckInSuggestion | null;
  unit?: string | null;
  coachMessage?: string;
  timingSource?: SmartReminderTimingSource;
  timingConfidence?: number;
};

type ReminderScheduleOptions = {
  aiSmartReminders?: boolean;
};

// Cap how many habits warm a fresh AI coach message per reminder sync. Messages
// are cached (6h) and optional, so refreshing only the highest-priority signals
// keeps the most relevant nudges fresh without bursting the Gemini rate limit.
const MAX_COACH_MESSAGE_REFRESH = 3;

function isMissingSmartHabitColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "PGRST204" ||
    message.includes("default_log_value") ||
    message.includes("habit_type") ||
    message.includes("metric_type") ||
    message.includes("visual_type") ||
    message.includes("reminder_strategy") ||
    message.includes("reminder_interval_minutes")
  );
}

export async function getReminderSchedule(
  options: ReminderScheduleOptions = {},
): Promise<ScheduledReminder[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  const cutoff = localDateDaysAgo(60);

  const [
    { data: smartHabits, error: smartHabitError },
    { data: completions },
    leaderboardPosition,
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("habits")
      .select(
        "id, name, icon, target, unit, reminder_times, reminder_days, reminders_enabled, habit_type, metric_type, visual_type, reminder_strategy, reminder_interval_minutes, default_log_value",
      )
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("reminders_enabled", true),
    supabase
      .from("habit_completions")
      .select("habit_id, completed_on, created_at, value")
      .eq("user_id", user.id)
      .gte("completed_on", cutoff),
    getMyLeaderboardPosition(),
    supabase
      .from("profiles")
      .select(
        "coach_tone, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at, ai_adult_attested_at, ai_disclosure_version",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  let habits = smartHabits as Record<string, unknown>[] | null;
  if (smartHabitError && isMissingSmartHabitColumn(smartHabitError)) {
    const { data: legacyHabits } = await supabase
      .from("habits")
      .select("id, name, icon, target, unit, reminder_times, reminder_days, reminders_enabled")
      .eq("user_id", user.id)
      .is("archived_at", null)
      .eq("reminders_enabled", true);
    habits = legacyHabits as Record<string, unknown>[] | null;
  }

  const percentileAhead = leaderboardPosition?.percentileAhead ?? null;

  // Group completions by habit for fast per-habit access.
  type Completion = {
    habit_id: string;
    completed_on: string;
    created_at: string;
    value: number | null;
  };
  const byHabit = new Map<string, Completion[]>();
  for (const c of completions ?? []) {
    const key = c.habit_id as string;
    if (!byHabit.has(key)) byHabit.set(key, []);
    byHabit.get(key)!.push({
      habit_id: key,
      completed_on: c.completed_on as string,
      created_at: c.created_at as string,
      value: c.value as number | null,
    });
  }

  const schedule: ScheduledReminder[] = [];
  const smartReminderCandidates: {
    decisionContext: SmartReminderDecisionContext;
    reminderContext: ReminderContext;
    habit: Habit;
    coachMessage?: string;
  }[] = [];
  const todayKey = localDateKey();
  const now = new Date();
  const coachTone = normalizeCoachTone(profile?.coach_tone as string | null | undefined);
  const proAccess = resolveProAccess(profile as ProAccessProfile | null, now);
  const aiCoachEnabled = Boolean(
    proAccess.hasPro &&
    profile?.ai_adult_attested_at &&
    profile?.ai_disclosure_version === AI_DISCLOSURE_VERSION &&
    (await getAiSuggestionsEnabled()),
  );

  // Compute each habit's top local coach signal once, then allow a background AI
  // refresh for only the highest-priority few (see MAX_COACH_MESSAGE_REFRESH) so
  // a multi-habit sync doesn't fire one Gemini call per habit at the same instant.
  const coachSignalByHabit = new Map<string, CoachSignal>();
  for (const h of habits ?? []) {
    const habitId = h.id as string;
    const hc = byHabit.get(habitId) ?? [];
    const signal = chooseTopCoachSignal(
      buildCoachSignals({
        habits: [h as Habit],
        completions: hc,
        now,
        tone: coachTone,
      }),
    );
    if (signal) coachSignalByHabit.set(habitId, signal);
  }
  const refreshHabitIds = new Set(
    [...coachSignalByHabit.entries()]
      .sort((a, b) => b[1].priority - a[1].priority)
      .slice(0, MAX_COACH_MESSAGE_REFRESH)
      .map(([habitId]) => habitId),
  );

  for (const h of habits ?? []) {
    const habit = h as Habit;
    const times = (h.reminder_times ?? []) as string[];
    const days = (h.reminder_days ?? [0, 1, 2, 3, 4, 5, 6]) as number[];
    const hc = byHabit.get(h.id as string) ?? [];
    const completedDates = new Set(completedDatesForHabit(habit, hc));
    const streak = habitStreakFromDates([...completedDates], habit.reminder_days, now);
    const trend = coachTrendSummary(summarizeHabitTrend(habit, hc, 30, now));
    const typicalHour = trend.timing?.hour ?? null;
    const reminderContext = { streak, typicalHour, percentileAhead };
    const rawCoachSignal = coachSignalByHabit.get(habit.id as string) ?? null;
    const localCoachSignal = rawCoachSignal ? { ...rawCoachSignal, trend } : null;
    const coachMessage = localCoachSignal
      ? await resolveCoachMessage(localCoachSignal, {
          enabled: aiCoachEnabled,
          nonBlocking: true,
          refresh: refreshHabitIds.has(habit.id as string),
        })
      : undefined;
    const todayCompletion = hc.find((c) => c.completed_on === todayKey);
    const todayProgress = progressForHabit(habit, todayCompletion);
    const suggestion = suggestedCheckInForHabit(habit, todayProgress);

    for (const time of times) {
      if (!/^\d{2}:\d{2}$/.test(time)) continue;
      schedule.push({
        habitId: h.id as string,
        habitName: h.name as string,
        icon: (h.icon as string) ?? "spa",
        strategy: "manual",
        time,
        days,
        context: reminderContext,
        progress: todayProgress,
        suggestion,
        unit: habit.unit,
        coachMessage,
      });
    }

    const strategy = (habit.reminder_strategy ?? "manual") as ReminderStrategy;
    if (strategy !== "interval" && strategy !== "conditional_interval") continue;

    // Respect reminder_days for smart reminders (e.g. workout only on Mon/Wed/Fri/Sat)
    const smartDays = (h.reminder_days ?? [0, 1, 2, 3, 4, 5, 6]) as number[];
    if (!smartDays.includes(now.getDay())) continue;

    if (todayProgress.isDone) continue;

    const interval = habit.reminder_interval_minutes ?? (strategy === "interval" ? 120 : 60);
    let timing = aiCoachEnabled
      ? resolveSmartReminderTiming(habit, hc, habits as Habit[], completions ?? [], now)
      : { source: "default" as const, hour: null, sampleCount: 0, confidence: 0 };
    let recommendedTime = aiCoachEnabled ? reminderTimeForTiming(timing, now) : null;
    if (!recommendedTime) {
      timing = { source: "default" as const, hour: null, sampleCount: 0, confidence: 0 };
    }
    const decisionContext: SmartReminderDecisionContext = {
      habitId: habit.id,
      habitName: habit.name,
      habitType: (habit.habit_type ?? "custom") as HabitType,
      metricType: (habit.metric_type ?? "boolean") as MetricType,
      strategy,
      intervalMinutes: interval,
      target: habit.target,
      unit: habit.unit,
      progress: todayProgress,
      completions: hc.map((c) => ({
        completedOn: c.completed_on,
        createdAt: c.created_at,
        value: c.value,
      })),
      manualTimes: times,
      reminderDays: smartDays,
      streak,
      typicalHour,
      recommendedTime,
      timing,
      trend,
      now,
    };
    if (!decisionContext.recommendedTime) {
      const fallback = learnedSmartReminderTimesForDay(decisionContext)[0];
      if (!fallback) continue;
      recommendedTime = `${String(fallback.getHours()).padStart(2, "0")}:${String(
        fallback.getMinutes(),
      ).padStart(2, "0")}`;
      decisionContext.recommendedTime = recommendedTime;
    }
    smartReminderCandidates.push({
      decisionContext,
      reminderContext,
      habit,
      coachMessage,
    });
  }

  const aiSmartPlans =
    options.aiSmartReminders === false
      ? new Map<string, import("../coach/smart-reminder-ai").AiSmartReminderPlan>()
      : await resolveAiSmartReminderPlans(
          smartReminderCandidates.map((candidate) => candidate.decisionContext),
          { enabled: aiCoachEnabled, now },
        );

  for (const candidate of smartReminderCandidates) {
    const aiPlan = aiSmartPlans.get(candidate.habit.id);
    const fireTimes = aiPlan?.times ?? learnedSmartReminderTimesForDay(candidate.decisionContext);
    for (const fireAt of fireTimes) {
      schedule.push({
        habitId: candidate.habit.id,
        habitName: candidate.habit.name,
        icon: candidate.habit.icon ?? "spa",
        strategy: candidate.decisionContext.strategy,
        fireAt,
        context: candidate.reminderContext,
        progress: candidate.decisionContext.progress,
        suggestion: suggestedCheckInForHabit(candidate.habit, candidate.decisionContext.progress),
        unit: candidate.habit.unit,
        coachMessage: aiPlan?.message ?? candidate.coachMessage,
        timingSource: candidate.decisionContext.timing.source,
        timingConfidence: candidate.decisionContext.timing.confidence,
      });
    }
  }
  return schedule;
}
