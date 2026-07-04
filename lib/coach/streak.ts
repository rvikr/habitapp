import { addLocalDays, localDateKey } from "../utils/date.ts";

export function streakFromDates(completedDates: string[], from = new Date()): number {
  if (completedDates.length === 0) return 0;
  const set = new Set(completedDates);
  let streak = 0;
  const cursor = new Date(from);
  while (set.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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
