import type { Habit, HabitCompletion } from "../../types/db";
import { progressForHabit, suggestedCheckInForHabit } from "../coach/habit-intelligence.ts";

type ValidatedWidgetState = {
  ok: boolean;
  habit: Habit | null;
  completions: Pick<HabitCompletion, "completed_on" | "value">[];
};

export function widgetCheckInForValidatedState(
  validated: ValidatedWidgetState,
  todayKey: string,
): { habitId: string; amount: number } | null {
  if (!validated.ok || !validated.habit || validated.habit.archived_at) return null;

  const habit = validated.habit;
  const todayCompletion =
    validated.completions.find((completion) => completion.completed_on === todayKey) ?? null;
  const progress = progressForHabit(habit, todayCompletion);
  const target = Number(habit.target ?? 0);
  const suggestion = suggestedCheckInForHabit(habit, progress);
  const amount = target > 0 ? suggestion?.value : progress.isDone ? null : 1;
  return amount && Number.isFinite(amount) && amount > 0 ? { habitId: habit.id, amount } : null;
}
