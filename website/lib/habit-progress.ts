import type { Habit, HabitCompletion } from "@/types/db";

export type CompletionProgress = Pick<
  HabitCompletion,
  "habit_id" | "completed_on" | "created_at" | "value"
>;

type CompletionHabit = Pick<Habit, "id" | "target">;
type CheckInHabit = Pick<Habit, "target" | "default_log_value">;
type CheckInLabelHabit = Pick<Habit, "name" | "target" | "default_log_value" | "unit">;

function normalizedAmount(value: number): number {
  return Number(value.toFixed(6));
}

export function formatCheckInAmount(value: number): string {
  return String(normalizedAmount(value));
}

export function completionIsDone(
  habit: CompletionHabit,
  completion: Pick<HabitCompletion, "value">,
): boolean {
  const target = habit.target == null ? null : Number(habit.target);
  if (!target || target <= 0) return true;
  return Number(completion.value ?? 1) >= target;
}

export function completedRowsFor<T extends CompletionProgress>(
  habits: CompletionHabit[],
  completions: T[],
): T[] {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]));
  return completions.filter((completion) => {
    const habit = habitsById.get(completion.habit_id);
    return habit ? completionIsDone(habit, completion) : false;
  });
}

export function suggestedIncrement(habit: CheckInHabit, currentValue: number): number | null {
  const target = Number(habit.target ?? 0);
  if (!Number.isFinite(target) || target <= 0) return 1;

  const remaining = Math.max(target - Math.max(Number(currentValue) || 0, 0), 0);
  if (remaining <= 0) return null;

  const defaultValue = Number(habit.default_log_value ?? 0);
  return Number.isFinite(defaultValue) && defaultValue > 0
    ? normalizedAmount(Math.min(defaultValue, remaining))
    : null;
}

/**
 * Backward-compatible fill behavior for habits created before canonical
 * positive defaults were stored. This is intentionally not a suggestion.
 */
export function legacyFillIncrement(habit: CheckInHabit, currentValue: number): number | null {
  const target = Number(habit.target ?? 0);
  if (!Number.isFinite(target) || target <= 0) return null;

  const remaining = Math.max(target - Math.max(Number(currentValue) || 0, 0), 0);
  return remaining > 0 ? normalizedAmount(remaining) : null;
}

export function defaultLogValueForTarget(target: number | null): number | null {
  const numericTarget = Number(target ?? 0);
  if (!Number.isFinite(numericTarget) || numericTarget <= 0) return null;

  const rawChunk = numericTarget / 4;
  const roundedChunk = Number(rawChunk.toPrecision(3));
  return Math.min(numericTarget, roundedChunk > 0 ? roundedChunk : numericTarget);
}

export function habitCheckInActionLabel(
  habit: CheckInLabelHabit,
  currentValue: number,
  done: boolean,
): string {
  if (done) return `Mark ${habit.name} incomplete`;

  const target = Number(habit.target ?? 0);
  const defaultValue = Number(habit.default_log_value ?? 0);
  const increment = suggestedIncrement(habit, currentValue);
  if (
    Number.isFinite(target) &&
    target > 0 &&
    Number.isFinite(defaultValue) &&
    defaultValue > 0 &&
    increment != null
  ) {
    const unit = habit.unit?.trim() ? ` ${habit.unit.trim()}` : "";
    return `Log ${formatCheckInAmount(increment)}${unit} for ${habit.name}`;
  }

  return `Mark ${habit.name} complete`;
}
