import type { Habit, HabitCompletion } from "../../types/db.ts";
import { progressForHabit } from "../coach/habit-intelligence.ts";
import { addLocalDays, localDateKey } from "../utils/date.ts";

export type HabitTrendRange = 7 | 30;

export type HabitTrendPoint = {
  date: string;
  scheduled: boolean;
  logged: boolean;
  targetHit: boolean;
  progressRatio: number;
};

export type HabitTimingSummary = {
  hour: number;
  sampleCount: number;
  confidence: number;
};

export type HabitTrendSummary = {
  rangeDays: HabitTrendRange;
  points: HabitTrendPoint[];
  scheduledDays: number;
  loggedDays: number;
  targetHitDays: number;
  targetHitRate: number;
  consistencyRate: number;
  averageProgressPct: number;
  strongestWeekday: { weekday: number; hitRate: number } | null;
  priorPeriodTargetHitRate: number | null;
  changePctPoints: number | null;
  direction: "up" | "down" | "steady" | null;
  timing: HabitTimingSummary | null;
};

export type CoachTrendSummary = Omit<HabitTrendSummary, "points">;

export type SmartReminderTimingSource =
  | "habit_weekday"
  | "habit_overall"
  | "user_overall"
  | "default";

export type SmartReminderTimingSummary = {
  source: SmartReminderTimingSource;
  hour: number | null;
  sampleCount: number;
  confidence: number;
};

type CompletionLike = Pick<HabitCompletion, "habit_id" | "completed_on" | "created_at" | "value">;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export function summarizeHabitTrend(
  habit: Habit,
  completions: CompletionLike[],
  rangeDays: HabitTrendRange,
  now = new Date(),
): HabitTrendSummary {
  const byDate = completionByDate(completions.filter((item) => item.habit_id === habit.id));
  const currentDates = dateKeys(rangeDays, now, 0);
  const previousDates = dateKeys(rangeDays, now, rangeDays);
  const points = currentDates.map((date) => trendPoint(habit, byDate.get(date), date));
  const previousPoints = previousDates.map((date) => trendPoint(habit, byDate.get(date), date));
  const scheduledPoints = points.filter((point) => point.scheduled);
  const previousScheduled = previousPoints.filter((point) => point.scheduled);
  const scheduledDays = scheduledPoints.length;
  const loggedDays = scheduledPoints.filter((point) => point.logged).length;
  const targetHitDays = scheduledPoints.filter((point) => point.targetHit).length;
  const targetHitRate = ratio(targetHitDays, scheduledDays);
  const priorPeriodTargetHitRate =
    scheduledDays >= 3 && previousScheduled.length >= 3
      ? ratio(previousScheduled.filter((point) => point.targetHit).length, previousScheduled.length)
      : null;
  const changePctPoints =
    priorPeriodTargetHitRate == null
      ? null
      : Math.round((targetHitRate - priorPeriodTargetHitRate) * 100);
  const direction =
    changePctPoints == null
      ? null
      : changePctPoints > 0
        ? "up"
        : changePctPoints < 0
          ? "down"
          : "steady";

  return {
    rangeDays,
    points,
    scheduledDays,
    loggedDays,
    targetHitDays,
    targetHitRate,
    consistencyRate: ratio(loggedDays, scheduledDays),
    averageProgressPct:
      scheduledDays > 0
        ? Math.round(
            (scheduledPoints.reduce((sum, point) => sum + point.progressRatio, 0) / scheduledDays) *
              100,
          )
        : 0,
    strongestWeekday: strongestWeekday(points),
    priorPeriodTargetHitRate,
    changePctPoints,
    direction,
    timing: dominantTiming(
      completions.filter(
        (completion) =>
          completion.habit_id === habit.id &&
          currentDates.includes(completion.completed_on) &&
          progressForHabit(habit, completion).isDone,
      ),
      now,
    ),
  };
}

export function coachTrendSummary(summary: HabitTrendSummary): CoachTrendSummary {
  const { points: _points, ...aggregate } = summary;
  return aggregate;
}

export function resolveSmartReminderTiming(
  habit: Habit,
  habitCompletions: CompletionLike[],
  allHabits: Habit[],
  allCompletions: CompletionLike[],
  now = new Date(),
): SmartReminderTimingSummary {
  const cutoff = localDateKey(addLocalDays(now, -29));
  const successfulHabitLogs = habitCompletions.filter(
    (completion) => completion.completed_on >= cutoff && progressForHabit(habit, completion).isDone,
  );
  const weekday = now.getDay();
  const matchingWeekday = successfulHabitLogs.filter(
    (completion) => weekdayForDateKey(completion.completed_on) === weekday,
  );
  const weekdayTiming = dominantTiming(matchingWeekday, now);
  if (weekdayTiming && weekdayTiming.sampleCount >= 3) {
    return { source: "habit_weekday", ...weekdayTiming };
  }

  const habitTiming = dominantTiming(successfulHabitLogs, now);
  if (habitTiming && habitTiming.sampleCount >= 5) {
    return { source: "habit_overall", ...habitTiming };
  }

  const habitsById = new Map(allHabits.map((item) => [item.id, item]));
  const successfulGlobalLogs = allCompletions.filter((completion) => {
    if (completion.completed_on < cutoff) return false;
    const completionHabit = habitsById.get(completion.habit_id);
    return completionHabit ? progressForHabit(completionHabit, completion).isDone : false;
  });
  const globalTiming = dominantTiming(successfulGlobalLogs, now);
  if (globalTiming && globalTiming.sampleCount >= 5) {
    return { source: "user_overall", ...globalTiming };
  }

  return { source: "default", hour: null, sampleCount: 0, confidence: 0 };
}

export function reminderTimeForTiming(
  timing: SmartReminderTimingSummary,
  now = new Date(),
): string | null {
  if (timing.hour == null) return null;
  const candidate = new Date(now);
  candidate.setHours(timing.hour, 0, 0, 0);
  candidate.setMinutes(candidate.getMinutes() - 30);
  if (candidate.getHours() < 8) candidate.setHours(8, 0, 0, 0);
  if (candidate.getHours() > 22 || candidate <= now) return null;
  return `${String(candidate.getHours()).padStart(2, "0")}:${String(
    candidate.getMinutes(),
  ).padStart(2, "0")}`;
}

function trendPoint(
  habit: Habit,
  completion: CompletionLike | undefined,
  date: string,
): HabitTrendPoint {
  const createdDate = localDateKey(new Date(habit.created_at));
  const scheduled =
    date >= createdDate && scheduledWeekdays(habit).includes(weekdayForDateKey(date));
  const progress = progressForHabit(habit, completion);
  return {
    date,
    scheduled,
    logged: completion != null && Number(completion.value ?? 1) > 0,
    targetHit: progress.isDone,
    progressRatio: Math.max(0, Math.min(1, progress.ratio)),
  };
}

function completionByDate(completions: CompletionLike[]): Map<string, CompletionLike> {
  const byDate = new Map<string, CompletionLike>();
  for (const completion of completions) {
    const current = byDate.get(completion.completed_on);
    if (!current || Number(completion.value ?? 1) > Number(current.value ?? 1)) {
      byDate.set(completion.completed_on, completion);
    }
  }
  return byDate;
}

function dateKeys(count: number, now: Date, offsetDays: number): string[] {
  const dates: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    dates.push(localDateKey(addLocalDays(now, -(offsetDays + index))));
  }
  return dates;
}

function scheduledWeekdays(habit: Habit): number[] {
  return Array.isArray(habit.reminder_days) && habit.reminder_days.length > 0
    ? habit.reminder_days
    : ALL_DAYS;
}

function weekdayForDateKey(date: string): number {
  return new Date(`${date}T12:00:00`).getDay();
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function strongestWeekday(points: HabitTrendPoint[]): { weekday: number; hitRate: number } | null {
  const stats = new Map<number, { scheduled: number; hits: number }>();
  for (const point of points) {
    if (!point.scheduled) continue;
    const weekday = weekdayForDateKey(point.date);
    const entry = stats.get(weekday) ?? { scheduled: 0, hits: 0 };
    entry.scheduled += 1;
    if (point.targetHit) entry.hits += 1;
    stats.set(weekday, entry);
  }
  const ranked = [...stats.entries()]
    .map(([weekday, entry]) => ({ weekday, hitRate: ratio(entry.hits, entry.scheduled) }))
    .sort((a, b) => b.hitRate - a.hitRate || a.weekday - b.weekday);
  return ranked[0] && ranked[0].hitRate > 0 ? ranked[0] : null;
}

function dominantTiming(completions: CompletionLike[], now: Date): HabitTimingSummary | null {
  const counts = new Map<number, number>();
  let totalWeight = 0;
  let sampleCount = 0;
  const recentCutoff = localDateKey(addLocalDays(now, -13));
  for (const completion of completions) {
    const timestamp = new Date(completion.created_at);
    if (!Number.isFinite(timestamp.getTime())) continue;
    const weight = completion.completed_on >= recentCutoff ? 2 : 1;
    const hour = timestamp.getHours();
    counts.set(hour, (counts.get(hour) ?? 0) + weight);
    totalWeight += weight;
    sampleCount += 1;
  }
  if (sampleCount === 0 || totalWeight === 0) return null;
  const [hour, winningWeight] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return {
    hour,
    sampleCount,
    confidence: Math.round((winningWeight / totalWeight) * 100) / 100,
  };
}
