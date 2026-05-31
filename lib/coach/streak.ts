import { streakForSchedule } from "./streak-rules.ts";

export function streakFromDates(completedDates: string[], from = new Date()): number {
  return streakForSchedule(completedDates, { from });
}
