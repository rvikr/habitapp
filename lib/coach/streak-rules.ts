import { addDateKeyDays, dayIndexForDateKey, localDateKey } from "../utils/date.ts";

type StreakScheduleOptions = {
  from?: Date;
  scheduledDays?: number[];
  graceCutoffHour?: number;
};

const EVERY_DAY = new Set([0, 1, 2, 3, 4, 5, 6]);

function scheduledDaySet(scheduledDays?: number[]): Set<number> {
  if (!scheduledDays) return EVERY_DAY;
  const validDays = scheduledDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  return validDays.length > 0 ? new Set(validDays) : EVERY_DAY;
}

function previousScheduledDateKey(dateKey: string, scheduledDays: Set<number>): string {
  let cursor = addDateKeyDays(dateKey, -1);
  for (let checked = 0; checked < 7; checked++) {
    if (scheduledDays.has(dayIndexForDateKey(cursor))) return cursor;
    cursor = addDateKeyDays(cursor, -1);
  }
  return cursor;
}

function isBeforeGraceCutoff(from: Date, graceCutoffHour?: number): boolean {
  return (
    graceCutoffHour !== undefined &&
    Number.isFinite(graceCutoffHour) &&
    from.getHours() < graceCutoffHour
  );
}

export function streakForSchedule(
  completedDates: string[],
  { from = new Date(), scheduledDays, graceCutoffHour }: StreakScheduleOptions = {},
): number {
  const completed = new Set(completedDates);
  const schedule = scheduledDaySet(scheduledDays);
  const todayKey = localDateKey(from);
  const todayIsScheduled = schedule.has(dayIndexForDateKey(todayKey));

  let anchorKey = todayKey;
  if (!todayIsScheduled) {
    anchorKey = previousScheduledDateKey(todayKey, schedule);
  } else if (!completed.has(todayKey)) {
    if (!isBeforeGraceCutoff(from, graceCutoffHour)) return 0;
    anchorKey = previousScheduledDateKey(todayKey, schedule);
  }

  let streak = 0;
  let cursor = anchorKey;
  for (let checked = 0; checked < completed.size + 7; checked++) {
    if (!schedule.has(dayIndexForDateKey(cursor))) {
      cursor = addDateKeyDays(cursor, -1);
      continue;
    }
    if (!completed.has(cursor)) return streak;
    streak++;
    cursor = previousScheduledDateKey(cursor, schedule);
  }
  return streak;
}
