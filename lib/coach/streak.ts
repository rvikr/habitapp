import { addLocalDays, localDateKey } from "../utils/date.ts";
import { streakForSchedule } from "./streak-rules.ts";

export function streakFromDates(completedDates: string[], from = new Date()): number {
  return streakForSchedule(completedDates, { from });
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
