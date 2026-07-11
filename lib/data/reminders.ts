import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { localDateDaysAgo, localDateKey } from "../utils/date";
import { streakFromDates } from "../coach/streak";
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
import { buildCoachSignals, chooseTopCoachSignal, normalizeCoachTone } from "../coach/coach";
import { resolveCoachMessage } from "../coach/coach-ai";
import { getAiSuggestionsEnabled } from "../services/feature-flags";
import {
  learnedSmartReminderTimesForDay,
  type SmartReminderDecisionContext,
} from "../coach/smart-reminders";
import { resolveAiSmartReminderPlans } from "../coach/smart-reminder-ai";
import { resolveProAccess, type ProAccessProfile } from "../subscription/access";
import { getMyLeaderboardPosition } from "./leaderboard";

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
};

type ReminderScheduleOptions = {
  aiSmartReminders?: boolean;
};

// Returns the hour (0-23) the user most often logs this habit, or null if too few data points.
function typicalHourFromTimestamps(timestamps: string[]): number | null {
  if (timestamps.length < 3) return null;
  const counts: Record<number, number> = {};
  for (const ts of timestamps) {
    const h = new Date(ts).getHours();
    counts[h] = (counts[h] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  return top ? parseInt(top[0], 10) : null;
}

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
        "coach_tone, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at",
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
  const aiCoachEnabled = proAccess.hasPro && (await getAiSuggestionsEnabled());
  for (const h of habits ?? []) {
    const habit = h as Habit;
    const times = (h.reminder_times ?? []) as string[];
    const days = (h.reminder_days ?? [0, 1, 2, 3, 4, 5, 6]) as number[];
    const hc = byHabit.get(h.id as string) ?? [];
    const streak = streakFromDates(completedDatesForHabit(habit, hc));
    const typicalHour = typicalHourFromTimestamps(hc.map((c) => c.created_at));
    const reminderContext = { streak, typicalHour, percentileAhead };
    const localCoachSignal = chooseTopCoachSignal(
      buildCoachSignals({
        habits: [habit],
        completions: hc,
        now,
        tone: coachTone,
      }),
    );
    const coachMessage = localCoachSignal
      ? await resolveCoachMessage(localCoachSignal, { enabled: aiCoachEnabled, nonBlocking: true })
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
    smartReminderCandidates.push({
      decisionContext: {
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
        now,
      },
      reminderContext,
      habit,
      coachMessage,
    });
  }

  const aiSmartPlans =
    options.aiSmartReminders === false
      ? new Map<string, Date[]>()
      : await resolveAiSmartReminderPlans(
          smartReminderCandidates.map((candidate) => candidate.decisionContext),
          { enabled: aiCoachEnabled, now },
        );

  for (const candidate of smartReminderCandidates) {
    const fireTimes =
      aiSmartPlans.get(candidate.habit.id) ??
      learnedSmartReminderTimesForDay(candidate.decisionContext);
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
        coachMessage: candidate.coachMessage,
      });
    }
  }
  return schedule;
}
