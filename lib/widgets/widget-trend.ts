import type { Habit, HabitCompletion } from "../../types/db";
import { isHabitCompletionDone } from "../coach/habit-intelligence.ts";
import { addLocalDays, localDateKey } from "../utils/date.ts";

export type WidgetTrendDayState = "full" | "partial" | "empty";
export type WidgetTrendDay = { date: string; state: WidgetTrendDayState };

export const WIDGET_TREND_DAYS = 7;

type TrendHabit = Pick<Habit, "id" | "name" | "description" | "icon" | "target" | "unit"> &
  Partial<Pick<Habit, "habit_type" | "metric_type" | "default_log_value">>;
type TrendCompletion = Pick<HabitCompletion, "habit_id" | "completed_on" | "value">;

// Last 7 local days ending today, colored like the progress tab: a habit
// credits a day only when its completion actually reaches the target
// (isHabitCompletionDone), and the denominator is today's active habit set.
export function buildWidgetWeekTrend(input: {
  habits: TrendHabit[];
  completions: TrendCompletion[];
  now?: Date;
}): WidgetTrendDay[] {
  const { habits, completions } = input;
  if (habits.length === 0) return [];
  const now = input.now ?? new Date();

  const habitById = new Map(habits.map((habit) => [habit.id, habit]));
  const creditedByDate = new Map<string, Set<string>>();
  for (const completion of completions) {
    const habit = habitById.get(completion.habit_id as string);
    if (!habit || !isHabitCompletionDone(habit, completion)) continue;
    const date = completion.completed_on;
    const credited = creditedByDate.get(date) ?? new Set<string>();
    credited.add(habit.id);
    creditedByDate.set(date, credited);
  }

  const days: WidgetTrendDay[] = [];
  for (let offset = WIDGET_TREND_DAYS - 1; offset >= 0; offset--) {
    const date = localDateKey(addLocalDays(now, -offset));
    const credited = creditedByDate.get(date)?.size ?? 0;
    days.push({
      date,
      state: credited === 0 ? "empty" : credited >= habits.length ? "full" : "partial",
    });
  }
  return days;
}
