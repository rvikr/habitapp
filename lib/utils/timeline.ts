import type { Habit } from "../../types/db";
import { REMINDER_TIME_PATTERN } from "../auth/validation.ts";

export type TimelineEntry<T> = { habit: T; time: string | null };

type ReminderFields = Pick<Habit, "reminder_time" | "reminder_times">;

// First reminder of the day anchors the habit on the timeline. Values are
// stored as zero-padded "HH:MM"; a legacy "HH:MM:SS" from a time column is
// normalized by the slice. Anything else means "no time".
export function reminderTimeFor(habit: ReminderFields): string | null {
  const raw = habit.reminder_times?.[0] ?? habit.reminder_time ?? null;
  if (!raw) return null;
  const time = raw.trim().slice(0, 5);
  return REMINDER_TIME_PATTERN.test(time) ? time : null;
}

// Timed habits first (zero-padded "HH:MM" sorts correctly as a string, and the
// sort is kept stable for equal times), then untimed habits in their original
// order.
export function orderHabitsForTimeline<T extends ReminderFields>(habits: T[]): TimelineEntry<T>[] {
  const timed: TimelineEntry<T>[] = [];
  const untimed: TimelineEntry<T>[] = [];
  for (const habit of habits) {
    const time = reminderTimeFor(habit);
    (time ? timed : untimed).push({ habit, time });
  }
  timed.sort((a, b) => ((a.time as string) < (b.time as string) ? -1 : a.time === b.time ? 0 : 1));
  return [...timed, ...untimed];
}

// Row index the "now" marker renders above: after the last timed entry whose
// reminder has already passed. null hides the marker entirely (no timed habits).
export function nowMarkerIndex(entries: { time: string | null }[], nowHHMM: string): number | null {
  if (!entries.some((entry) => entry.time !== null)) return null;
  let index = 0;
  for (let i = 0; i < entries.length; i++) {
    const time = entries[i].time;
    if (time !== null && time <= nowHHMM) index = i + 1;
  }
  return index;
}
