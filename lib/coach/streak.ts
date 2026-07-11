import { addLocalDays, localDateKey } from "../utils/date.ts";
import { streakForSchedule } from "./streak-rules.ts";

// The documented display grace keeps yesterday's completed streak visible
// until 10:00 local time. It does not create completion credit.
export const HABIT_STREAK_GRACE_CUTOFF_HOUR = 10;

export function streakFromDates(completedDates: string[], from = new Date()): number {
  return streakForSchedule(completedDates, { from });
}

export function habitStreakFromDates(
  completedDates: string[],
  reminderDays: number[] | null | undefined,
  from = new Date(),
): number {
  return streakForSchedule(completedDates, {
    from,
    scheduledDays: reminderDays ?? undefined,
    graceCutoffHour: HABIT_STREAK_GRACE_CUTOFF_HOUR,
  });
}

// Longest run of consecutive calendar days anywhere in the given dates,
// regardless of whether it reaches today.
export function longestStreakFromDates(completedDates: string[]): number {
  const uniqueDates = [...new Set(completedDates)].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of uniqueDates) {
    run =
      previous !== null && localDateKey(addLocalDays(new Date(`${previous}T12:00:00`), 1)) === day
        ? run + 1
        : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}
