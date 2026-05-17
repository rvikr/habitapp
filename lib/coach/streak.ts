import { localDateKey } from "../utils/date.ts";

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
