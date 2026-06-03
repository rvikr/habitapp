import { getItem, removeItem, setItem } from "../platform/storage";
import { getReminderSchedule } from "./reminders";
import {
  cancelScheduledReminder,
  getPermissionStatus,
  scheduleHabitReminder,
  scheduleHabitReminderAt,
} from "../platform/notifications";
import type { ReminderContext } from "./reminders";
import {
  formatAmount,
  type CheckInSuggestion,
  type HabitProgress,
} from "../coach/habit-intelligence";
import { createQueuedReminderSync } from "./reminder-sync-queue";

const STORAGE_KEY = "habbit:scheduled-reminder-ids";

type ReminderIdMap = Record<string, string[]>;

function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}${period}`;
}

export function buildSmartBody(
  habitName: string,
  ctx: ReminderContext,
  progress?: HabitProgress,
  suggestion?: CheckInSuggestion | null,
  unit?: string | null,
): string {
  const { streak, typicalHour, percentileAhead } = ctx;
  const u = unit ? ` ${unit}` : "";

  if (progress && progress.target && progress.target > 0 && !progress.isDone) {
    const remaining = progress.target - progress.current;
    const remainStr = `${formatAmount(remaining)}${u}`;
    const pct = Math.round(progress.ratio * 100);
    if (suggestion) {
      const remainingAfterStr = `${formatAmount(suggestion.remainingAfter)}${u}`;
      if (suggestion.completesGoal) {
        if (streak > 1)
          return `Finish with ${suggestion.label} to protect your ${streak}-day streak!`;
        return `Finish with ${suggestion.label} to hit your goal.`;
      }
      if (progress.current === 0)
        return `Start with ${suggestion.label}. ${remainingAfterStr} left after this.`;
      return `Log ${suggestion.label} now. ${remainingAfterStr} left after this.`;
    }

    if (progress.current === 0) {
      if (streak > 1) return `Haven't started yet — log now to keep your ${streak}-day streak!`;
      return `Goal: ${formatAmount(progress.target)}${u}. Ready to start?`;
    }

    if (pct >= 80) {
      if (streak > 1)
        return `Almost done! Just ${remainStr} more to protect your ${streak}-day streak!`;
      return `Almost there! Just ${remainStr} left to hit your goal.`;
    }

    if (pct >= 50) {
      if (streak > 1)
        return `${pct}% done — ${remainStr} more keeps your ${streak}-day streak going!`;
      return `Halfway there — just ${remainStr} more to hit your goal.`;
    }

    if (streak > 1)
      return `${progress.label} done — ${remainStr} more to keep your ${streak}-day streak!`;
    return `${progress.label} — ${remainStr} more to reach your goal.`;
  }

  // Boolean habit or already done
  if (streak > 1) return `One moment to keep your ${streak}-day streak alive.`;
  if (typicalHour !== null) return `You usually complete this around ${formatHour(typicalHour)}.`;
  if (percentileAhead !== null && percentileAhead >= 50)
    return `You're ahead of ${percentileAhead}% of users this week.`;
  return `Time to log ${habitName}.`;
}

async function performScheduledReminderSync(): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== "granted") return;

  await cancelStoredReminders();
  const schedule = await getReminderSchedule();
  const next: ReminderIdMap = {};

  for (const reminder of schedule) {
    const body =
      reminder.coachMessage ??
      buildSmartBody(
        reminder.habitName,
        reminder.context,
        reminder.progress,
        reminder.suggestion,
        reminder.unit,
      );

    if (reminder.fireAt) {
      const id = await scheduleHabitReminderAt(
        reminder.habitId,
        reminder.habitName,
        reminder.fireAt,
        body,
      );
      if (id) next[reminder.habitId] = [...(next[reminder.habitId] ?? []), id];
      continue;
    }

    if (!reminder.time || !reminder.days) continue;
    const ids = await scheduleHabitReminder(
      reminder.habitId,
      reminder.habitName,
      reminder.time,
      reminder.days,
      body,
    );
    if (ids.length > 0) next[reminder.habitId] = [...(next[reminder.habitId] ?? []), ...ids];
  }

  await setItem(STORAGE_KEY, JSON.stringify(next));
}

export const syncScheduledReminders = createQueuedReminderSync(performScheduledReminderSync);

const REMINDER_SYNC_DEBOUNCE_MS = 1500;
let reminderSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Fire-and-forget reminder sync that coalesces bursts of mutations (e.g. rapid
// habit logging) into a single rebuild. Screens that need the schedule applied
// immediately should await syncScheduledReminders() directly instead.
export function scheduleReminderSync(): void {
  if (reminderSyncDebounceTimer) clearTimeout(reminderSyncDebounceTimer);
  reminderSyncDebounceTimer = setTimeout(() => {
    reminderSyncDebounceTimer = null;
    void syncScheduledReminders();
  }, REMINDER_SYNC_DEBOUNCE_MS);
}

export async function cancelHabitReminders(habitId: string): Promise<void> {
  const map = await readReminderIds();
  const ids = map[habitId] ?? [];
  await Promise.all(ids.map((id) => cancelScheduledReminder(id)));
  delete map[habitId];

  if (Object.keys(map).length === 0) await removeItem(STORAGE_KEY);
  else await setItem(STORAGE_KEY, JSON.stringify(map));
}

async function cancelStoredReminders(): Promise<void> {
  const map = await readReminderIds();
  const ids = Object.values(map).flat();
  await Promise.all(ids.map((id) => cancelScheduledReminder(id)));
  await removeItem(STORAGE_KEY);
}

async function readReminderIds(): Promise<ReminderIdMap> {
  const raw = await getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as ReminderIdMap;
  } catch {
    return {};
  }
}
