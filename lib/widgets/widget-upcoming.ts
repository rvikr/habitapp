import type { Habit } from "../../types/db";
import {
  progressForHabit,
  suggestedCheckInForHabit,
  type HabitProgress,
} from "../coach/habit-intelligence.ts";
import type { TimelineEntry } from "../utils/timeline.ts";

type UpcomingHabitLike = Pick<Habit, "id" | "name" | "description" | "icon" | "target" | "unit"> &
  Partial<Pick<Habit, "habit_type" | "metric_type" | "default_log_value">>;

export type WidgetUpcomingHabit = {
  id: string;
  name: string;
  time: string | null;
  checkInValue: number | null;
  preferred: boolean;
};

// Uncompleted habits in timeline order, each with the same clamped check-in
// amount the dashboard would use, so the widget provider can advance the
// "Next:" line (and its deep link) as reminder times pass without the app.
export function buildWidgetUpcomingInput<T extends UpcomingHabitLike>(input: {
  timelineEntries: TimelineEntry<T>[];
  completedToday: Set<string>;
  todayProgress: Map<string, HabitProgress>;
  preferredHabitId?: string | null;
}): WidgetUpcomingHabit[] {
  const upcoming: WidgetUpcomingHabit[] = [];
  for (const entry of input.timelineEntries) {
    const habit = entry.habit;
    if (input.completedToday.has(habit.id)) continue;
    const progress = input.todayProgress.get(habit.id) ?? progressForHabit(habit, null);
    const target = Number(habit.target ?? 0);
    const checkInValue =
      target > 0
        ? (suggestedCheckInForHabit(habit, progress)?.value ?? null)
        : progress.isDone
          ? null
          : 1;
    upcoming.push({
      id: habit.id,
      name: habit.name,
      time: entry.time,
      checkInValue,
      preferred: input.preferredHabitId != null && habit.id === input.preferredHabitId,
    });
  }
  return upcoming;
}

// TS twin of the Kotlin provider's selectNext(): pins the semantics with unit
// tests. The coach-preferred habit wins until its reminder time passes; then
// the first future-timed habit, then the first untimed one, and when
// everything is past-due the first item (app parity: past-due stays "next").
export function selectNextUpcoming<T extends { time: string | null; preferred?: boolean }>(
  upcoming: T[],
  nowHHMM: string,
): T | null {
  if (upcoming.length === 0) return null;
  const preferred = upcoming.find(
    (item) => item.preferred && (item.time === null || item.time >= nowHHMM),
  );
  if (preferred) return preferred;
  return (
    upcoming.find((item) => item.time !== null && item.time >= nowHHMM) ??
    upcoming.find((item) => item.time === null) ??
    upcoming[0]
  );
}
