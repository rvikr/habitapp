import type { Habit, HabitCompletion } from "../../types/db";
import { addLocalDays as addDays, localDateKey as dateKey } from "../utils/date.ts";

export type CoachTone = "friendly" | "motivational" | "calm" | "strict" | "military";

export type CoachSignalKind =
  | "behind_progress"
  | "usual_skip_window"
  | "streak_risk"
  | "burnout"
  | "easy_alternative"
  | "encouragement";

export type CoachSuggestedAction = "open_habit" | "log_value";

export type CoachSignal = {
  kind: CoachSignalKind;
  priority: number;
  habitId: string;
  habitName: string;
  message: string;
  suggestedAction: CoachSuggestedAction;
  suggestedValue?: number;
  tone: CoachTone;
  progressPct?: number;
  unit?: string | null;
  skipWindowLabel?: string;
};

type CoachCompletion = Pick<HabitCompletion, "habit_id" | "completed_on" | "created_at" | "value">;

type BuildCoachSignalsInput = {
  habits: Habit[];
  completions: CoachCompletion[];
  now?: Date;
  tone?: CoachTone | null;
};

const COACH_ACTIVE_START_HOUR = 8;
const COACH_ACTIVE_END_HOUR = 22;
const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export function normalizeCoachTone(tone: string | null | undefined): CoachTone {
  if (
    tone === "motivational" ||
    tone === "calm" ||
    tone === "strict" ||
    tone === "military" ||
    tone === "friendly"
  )
    return tone;
  return "friendly";
}

export function buildCoachSignals({
  habits,
  completions,
  now = new Date(),
  tone,
}: BuildCoachSignalsInput): CoachSignal[] {
  const normalizedTone = normalizeCoachTone(tone);
  const signals: CoachSignal[] = [];
  const todayKey = dateKey(now);
  const completionsByHabit = groupByHabit(completions);
  const burnout = detectBurnout(completions, now);

  if (
    burnout &&
    habits.some((habit) => !progressFor(habit, completionsByHabit.get(habit.id), todayKey).isDone)
  ) {
    const firstOpenHabit = habits.find(
      (habit) => !progressFor(habit, completionsByHabit.get(habit.id), todayKey).isDone,
    );
    if (firstOpenHabit) {
      signals.push(
        withMessage({
          kind: "burnout",
          priority: 95,
          habitId: firstOpenHabit.id,
          habitName: firstOpenHabit.name,
          suggestedAction: "open_habit",
          tone: "calm",
        }),
      );
    }
  }

  for (const habit of habits) {
    const history = completionsByHabit.get(habit.id) ?? [];
    const progress = progressFor(habit, history, todayKey);
    if (progress.isDone) continue;

    const suggestedValue = suggestedLogValue(habit, progress.current);
    const progressPct = Math.round(progress.ratio * 100);

    if (habit.target && habit.target > 0 && isBehindExpectedProgress(progress.ratio, now)) {
      signals.push(
        withMessage({
          kind: "behind_progress",
          priority:
            70 + Math.max(0, Math.round((expectedProgressForDay(now) - progress.ratio) * 20)),
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          progressPct,
          unit: habit.unit,
        }),
      );
    }

    if (detectLateSkipWindow(history, now)) {
      signals.push(
        withMessage({
          kind: "usual_skip_window",
          priority: 82,
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          unit: habit.unit,
          skipWindowLabel: `${DAY_NAMES[now.getDay()]} after 8 PM`,
        }),
      );
    }

    const streak = currentStreak(history, now);
    if (streak > 1) {
      signals.push(
        withMessage({
          kind: "streak_risk",
          priority: 60 + Math.min(streak, 10),
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          unit: habit.unit,
        }),
      );
    }

    if (suggestedValue && now.getHours() >= 18) {
      signals.push(
        withMessage({
          kind: "easy_alternative",
          priority: 50,
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: "log_value",
          suggestedValue,
          tone: normalizedTone,
          unit: habit.unit,
        }),
      );
    }
  }

  if (signals.length === 0 && habits.length > 0) {
    signals.push(
      withMessage({
        kind: "encouragement",
        priority: 10,
        habitId: habits[0].id,
        habitName: habits[0].name,
        suggestedAction: "open_habit",
        tone: normalizedTone,
      }),
    );
  }

  return signals.sort((a, b) => b.priority - a.priority);
}

export function chooseTopCoachSignal(signals: CoachSignal[]): CoachSignal | null {
  return [...signals].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export function formatCoachMessage(
  signal: Omit<CoachSignal, "message"> & { message?: string },
): string {
  if (signal.message?.trim()) return signal.message.trim();
  if (signal.kind === "burnout") {
    return "You have been pushing unevenly lately. Choose one smaller step today and rebuild without forcing it.";
  }

  const action = actionText(signal);
  if (signal.kind === "behind_progress") {
    const progress = signal.progressPct ?? 0;
    if (signal.tone === "military")
      return `Mission update: ${signal.habitName} is only ${progress}% complete. ${action}.`;
    if (signal.tone === "strict")
      return `You're only ${progress}% through ${signal.habitName}. ${action} before the day gets away.`;
    if (signal.tone === "calm")
      return `You're at ${progress}% for ${signal.habitName}. A small reset now is enough: ${action.toLowerCase()}.`;
    if (signal.tone === "motivational")
      return `Momentum check: ${signal.habitName} is ${progress}% done. ${action} and keep the day moving.`;
    return `You've only completed ${progress}% of ${signal.habitName} today. ${action} so you don't fall behind.`;
  }

  if (signal.kind === "usual_skip_window") {
    const window = signal.skipWindowLabel ?? "this time";
    if (signal.tone === "military")
      return `Mission risk: you usually miss ${signal.habitName} on ${window}. Do the shorter ${versionText(signal)} now.`;
    if (signal.tone === "strict")
      return `This is your usual skip window for ${signal.habitName}. Do the shorter ${versionText(signal)} now.`;
    if (signal.tone === "calm")
      return `${signal.habitName} is harder for you around ${window}. Want to do the gentler version today?`;
    if (signal.tone === "motivational")
      return `You can beat the ${window} pattern for ${signal.habitName}. Want to do a shorter ${versionText(signal)} today?`;
    return `You usually skip ${signal.habitName} on ${window}. Want to do a shorter ${versionText(signal)} today?`;
  }

  if (signal.kind === "streak_risk") {
    if (signal.tone === "military") return `Protect the streak: ${action}.`;
    if (signal.tone === "strict") return `Do not let the streak drop today. ${action}.`;
    if (signal.tone === "calm") return `Your streak only needs one small step. ${action}.`;
    if (signal.tone === "motivational") return `Keep your momentum alive. ${action}.`;
    return `Only a moment to keep your ${signal.habitName} streak alive. ${action}.`;
  }

  if (signal.kind === "easy_alternative") {
    if (signal.tone === "military")
      return `Fallback mission: complete ${valueText(signal)} of ${signal.habitName}.`;
    if (signal.tone === "strict")
      return `Lower the target, not the standard. Complete ${valueText(signal)} now.`;
    if (signal.tone === "calm")
      return `A smaller version counts. Try ${valueText(signal)} of ${signal.habitName}.`;
    if (signal.tone === "motivational")
      return `Keep the chain alive with ${valueText(signal)} of ${signal.habitName}.`;
    return `Want to make this easier? Do ${valueText(signal)} of ${signal.habitName} today.`;
  }

  if (signal.tone === "military") return `Mission: complete ${signal.habitName}. Begin now.`;
  if (signal.tone === "strict") return `Commit to ${signal.habitName} now.`;
  if (signal.tone === "calm") return `Take one small step toward ${signal.habitName}.`;
  if (signal.tone === "motivational") return `Build momentum with ${signal.habitName} today.`;
  return `You can still make progress on ${signal.habitName} today.`;
}

function withMessage(signal: Omit<CoachSignal, "message">): CoachSignal {
  return { ...signal, message: formatCoachMessage(signal) };
}

function groupByHabit(completions: CoachCompletion[]): Map<string, CoachCompletion[]> {
  const byHabit = new Map<string, CoachCompletion[]>();
  for (const completion of completions) {
    if (!byHabit.has(completion.habit_id)) byHabit.set(completion.habit_id, []);
    byHabit.get(completion.habit_id)!.push(completion);
  }
  return byHabit;
}

function progressFor(habit: Habit, history: CoachCompletion[] | undefined, todayKey: string) {
  const completion = history?.find((item) => item.completed_on === todayKey);
  const current = Number(completion?.value ?? (completion ? 1 : 0));
  const target = habit.target == null ? null : Number(habit.target);
  const ratio =
    target && target > 0 ? Math.min(Math.max(current / target, 0), 1) : completion ? 1 : 0;
  return { current, ratio, isDone: target && target > 0 ? current >= target : !!completion };
}

function expectedProgressForDay(now: Date): number {
  const hour = now.getHours() + now.getMinutes() / 60;
  return Math.min(
    Math.max(
      (hour - COACH_ACTIVE_START_HOUR) / (COACH_ACTIVE_END_HOUR - COACH_ACTIVE_START_HOUR),
      0,
    ),
    1,
  );
}

function isBehindExpectedProgress(ratio: number, now: Date): boolean {
  const expected = expectedProgressForDay(now);
  return expected >= 0.3 && ratio + 0.15 < expected;
}

function suggestedLogValue(habit: Habit, current: number): number | null {
  const remaining = habit.target == null ? null : Math.max(Number(habit.target) - current, 0);
  const defaultValue = Number(habit.default_log_value ?? 0);
  if (!Number.isFinite(defaultValue) || defaultValue <= 0) return null;
  const multiplier =
    habit.habit_type === "water_intake" || habit.metric_type === "volume_ml" ? 2 : 1;
  const value = Math.max(1, Math.floor(defaultValue * multiplier));
  return remaining == null || remaining <= 0 ? value : Math.min(value, Math.floor(remaining));
}

function detectLateSkipWindow(history: CoachCompletion[], now: Date): boolean {
  if (now.getHours() < 20) return false;
  const sameWeekday = history.filter((completion) => {
    const completedAt = new Date(`${completion.completed_on}T12:00:00`);
    return completedAt.getDay() === now.getDay() && completion.completed_on !== dateKey(now);
  });
  if (sameWeekday.length < 2) return false;
  return sameWeekday.every((completion) => new Date(completion.created_at).getHours() < 20);
}

function detectBurnout(completions: CoachCompletion[], now: Date): boolean {
  const uniqueDates = new Set(completions.map((completion) => completion.completed_on));
  const recentMisses = [0, 1, 2].every(
    (daysAgo) => !uniqueDates.has(dateKey(addDays(now, -daysAgo))),
  );
  if (!recentMisses) return false;
  let priorWeekCount = 0;
  for (let daysAgo = 3; daysAgo <= 10; daysAgo++) {
    if (uniqueDates.has(dateKey(addDays(now, -daysAgo)))) priorWeekCount++;
  }
  return priorWeekCount >= 4;
}

function currentStreak(history: CoachCompletion[], now: Date): number {
  const dates = new Set(history.map((completion) => completion.completed_on));
  let streak = 0;
  for (let daysAgo = 1; daysAgo <= 60; daysAgo++) {
    if (!dates.has(dateKey(addDays(now, -daysAgo)))) break;
    streak++;
  }
  return streak;
}

function actionText(signal: Pick<CoachSignal, "suggestedValue" | "unit" | "habitName">): string {
  if (!signal.suggestedValue) return `Open ${signal.habitName}`;
  return `Do ${valueText(signal)} now`;
}

function valueText(signal: Pick<CoachSignal, "suggestedValue" | "unit">): string {
  if (!signal.suggestedValue) return "a small version";
  const unit = signal.unit ? ` ${signal.unit}` : "";
  return `${formatAmount(signal.suggestedValue)}${unit}`;
}

function versionText(signal: Pick<CoachSignal, "suggestedValue" | "unit">): string {
  if (
    signal.suggestedValue &&
    (signal.unit === "min" || signal.unit === "minute" || signal.unit === "minutes")
  ) {
    return `${formatAmount(signal.suggestedValue)}-minute version`;
  }
  return `${valueText(signal)} version`;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
