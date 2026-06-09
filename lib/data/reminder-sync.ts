import { getItem, removeItem, setItem } from "../platform/storage";
import { getReminderSchedule } from "./reminders";
import {
  cancelScheduledReminder,
  getPermissionStatus,
  scheduleWeeklyReminder,
  scheduleDateReminder,
} from "../platform/notifications";
import type { ReminderContext } from "./reminders";
import { formatAmount } from "../coach/habit-intelligence";
import type { HabitProgress } from "../coach/habit-intelligence";
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
  unit?: string | null,
): string {
  const { streak, typicalHour, percentileAhead } = ctx;
  const u = unit ? ` ${unit}` : "";

  if (progress && progress.target && progress.target > 0 && !progress.isDone) {
    const remaining = progress.target - progress.current;
    const remainStr = `${formatAmount(remaining)}${u}`;
    const pct = Math.round(progress.ratio * 100);

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

type ReminderMember = { habitId: string; habitName: string; body: string };

// Builds the notification title/body for a trigger group: a single habit keeps
// its rich smart body, while several habits sharing the same time collapse into
// one "N habits to check in" notification instead of spamming one per habit.
function bundleContent(members: ReminderMember[]): { title: string; body: string } {
  if (members.length === 1) return { title: members[0].habitName, body: members[0].body };
  const names = members.map((m) => m.habitName);
  return {
    title: `${names.length} habits to check in`,
    body: names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : ""),
  };
}

// A single-habit reminder deep-links to that habit; a bundle opens the app to
// the dashboard since there is no single habit to route to.
function bundleData(members: ReminderMember[]): Record<string, unknown> {
  return members.length === 1 ? { habitId: members[0].habitId } : { habitId: null };
}

async function performScheduledReminderSync(): Promise<void> {
  const status = await getPermissionStatus();
  if (status !== "granted") return;

  await cancelStoredReminders();
  const schedule = await getReminderSchedule();

  // Group reminders by their fire trigger so habits sharing a time bundle into
  // a single notification. Weekly keys are weekday+time; one-off keys are the
  // fire time rounded to the minute.
  const weeklyGroups = new Map<
    string,
    { weekday: number; time: string; members: ReminderMember[] }
  >();
  const dateGroups = new Map<string, { fireAt: Date; members: ReminderMember[] }>();

  for (const reminder of schedule) {
    const body =
      reminder.coachMessage ??
      buildSmartBody(reminder.habitName, reminder.context, reminder.progress, reminder.unit);
    const member: ReminderMember = {
      habitId: reminder.habitId,
      habitName: reminder.habitName,
      body,
    };

    if (reminder.fireAt) {
      const minuteMs = Math.floor(reminder.fireAt.getTime() / 60000) * 60000;
      const key = `date|${minuteMs}`;
      const group = dateGroups.get(key);
      if (group) group.members.push(member);
      else dateGroups.set(key, { fireAt: reminder.fireAt, members: [member] });
      continue;
    }

    if (!reminder.time || !reminder.days) continue;
    for (const weekday of reminder.days) {
      const key = `${weekday}|${reminder.time}`;
      const group = weeklyGroups.get(key);
      if (group) group.members.push(member);
      else weeklyGroups.set(key, { weekday, time: reminder.time, members: [member] });
    }
  }

  const next: ReminderIdMap = {};
  // Store the (possibly shared) notification id under every member habit so
  // cancelHabitReminders can find it for any habit in the bundle.
  const record = (members: ReminderMember[], id: string) => {
    if (!id) return;
    for (const m of members) next[m.habitId] = [...(next[m.habitId] ?? []), id];
  };

  for (const group of weeklyGroups.values()) {
    const { title, body } = bundleContent(group.members);
    const id = await scheduleWeeklyReminder(
      group.weekday,
      group.time,
      title,
      body,
      bundleData(group.members),
    );
    record(group.members, id);
  }

  for (const group of dateGroups.values()) {
    const { title, body } = bundleContent(group.members);
    const id = await scheduleDateReminder(group.fireAt, title, body, bundleData(group.members));
    record(group.members, id);
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
