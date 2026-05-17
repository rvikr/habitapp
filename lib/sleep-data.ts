import type { Habit, SleepEntry } from "@/types/db";
import { supabase, isSupabaseConfigured, getCurrentUser } from "./supabase/client";
import { syncScheduledReminders } from "./reminder-sync";
import {
  buildSleepCompletionValue,
  computeSleepScore,
  isSleepEntriesSetupError,
  minutesOfDay,
  sleepDateForWakeTime,
  SLEEP_ENTRIES_SETUP_MESSAGE,
  type NormalizedSleepEntry,
  type SleepSource,
} from "./sleep-shared";

type Result<T = undefined> = T extends undefined ? { ok: boolean; error?: string } : { ok: boolean; data?: T; error?: string };

export type SleepSyncResult = {
  entry: SleepEntry;
  habit: Habit;
};

export type SleepDashboardData = {
  habit: Habit | null;
  latestEntry: SleepEntry | null;
  entries: SleepEntry[];
  targetMinutes: number;
};

const DEFAULT_SLEEP_TARGET_HOURS = 8;

function notConfigured(): Result {
  return { ok: false, error: "Supabase is not configured." };
}

function notSignedIn(): Result {
  return { ok: false, error: "You need to sign in again." };
}

function databaseErrorMessage(message: string): string {
  return isSleepEntriesSetupError(message) ? SLEEP_ENTRIES_SETUP_MESSAGE : message;
}

function sleepHabitPayload(userId: string) {
  return {
    user_id: userId,
    name: "Sleep 8 hours",
    description: "Track your nightly sleep duration and score.",
    icon: "bedtime",
    color: "primary",
    unit: "hr",
    target: DEFAULT_SLEEP_TARGET_HOURS,
    reminders_enabled: true,
    reminder_times: ["22:30"],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    habit_type: "sleep",
    metric_type: "hours",
    visual_type: "sleep_moon",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: 1,
  };
}

async function ensureSleepHabit(userId: string): Promise<Result<Habit>> {
  const { data: existing, error: readError } = await supabase
    .from("habits")
    .select("*")
    .eq("user_id", userId)
    .eq("habit_type", "sleep")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError) return { ok: false, error: readError.message };
  if (existing) return { ok: true, data: existing as Habit };

  const { data, error } = await supabase
    .from("habits")
    .insert(sleepHabitPayload(userId))
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  await syncScheduledReminders();
  return { ok: true, data: data as Habit };
}

function targetMinutesForHabit(habit: Habit | null): number {
  const target = Number(habit?.target ?? DEFAULT_SLEEP_TARGET_HOURS);
  return Math.max(1, target) * 60;
}

function recentScoreEntries(entries: SleepEntry[]) {
  return entries.map((entry) => ({
    startMinutes: minutesOfDay(entry.start_time),
    endMinutes: minutesOfDay(entry.end_time),
  }));
}

export async function syncNormalizedSleepEntry(source: SleepSource, normalized: NormalizedSleepEntry): Promise<Result<SleepSyncResult>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const user = await getCurrentUser();
  if (!user) return notSignedIn();

  const habitResult = await ensureSleepHabit(user.id);
  if (!habitResult.ok || !habitResult.data) return { ok: false, error: habitResult.error ?? "Could not create sleep habit." };
  const habit = habitResult.data;

  const { data: recentRows, error: recentError } = await supabase
    .from("sleep_entries")
    .select("*")
    .eq("user_id", user.id)
    .lt("sleep_date", normalized.sleepDate)
    .order("sleep_date", { ascending: false })
    .limit(7);
  if (recentError) return { ok: false, error: databaseErrorMessage(recentError.message) };

  const recentEntries = (recentRows ?? []) as SleepEntry[];
  const score = computeSleepScore({
    durationMinutes: normalized.durationMinutes,
    targetMinutes: targetMinutesForHabit(habit),
    startMinutes: minutesOfDay(normalized.startTime),
    endMinutes: minutesOfDay(normalized.endTime),
    recentEntries: recentScoreEntries(recentEntries),
    stageMinutes: normalized.stageMinutes,
  });

  const sleepEntryPayload = {
    user_id: user.id,
    sleep_date: normalized.sleepDate,
    source,
    duration_minutes: normalized.durationMinutes,
    score,
    start_time: normalized.startTime,
    end_time: normalized.endTime,
    stage_minutes: normalized.stageMinutes,
    source_metadata: normalized.sourceMetadata,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: entryRow, error: entryError } = await supabase
    .from("sleep_entries")
    .upsert(sleepEntryPayload, { onConflict: "user_id,sleep_date" })
    .select("*")
    .single();
  if (entryError) return { ok: false, error: databaseErrorMessage(entryError.message) };

  const { error: completionError } = await supabase
    .from("habit_completions")
    .upsert(
      {
        habit_id: habit.id,
        user_id: user.id,
        completed_on: normalized.sleepDate,
        value: buildSleepCompletionValue(normalized.durationMinutes),
        note: `Synced from ${source === "healthKit" ? "Apple Health" : source === "healthConnect" ? "Health Connect" : "sleep tracker"}`,
      },
      { onConflict: "habit_id,completed_on" },
    );
  if (completionError) return { ok: false, error: completionError.message };

  await syncScheduledReminders();
  return { ok: true, data: { entry: entryRow as SleepEntry, habit } };
}

export async function manualLogSleep(durationHours: number, sleepDate?: string): Promise<Result<SleepSyncResult>> {
  const minutes = Math.max(0, Math.round(durationHours * 60));
  if (minutes <= 0) return { ok: false, error: "Enter a sleep duration greater than 0." };
  const now = new Date();
  const date = sleepDate ?? sleepDateForWakeTime(now);
  return syncNormalizedSleepEntry("manual", {
    sleepDate: date,
    durationMinutes: minutes,
    startTime: null,
    endTime: null,
    stageMinutes: null,
    sourceMetadata: { enteredManually: true },
  });
}

export async function getSleepDashboardData(): Promise<SleepDashboardData> {
  if (!isSupabaseConfigured()) {
    return { habit: null, latestEntry: null, entries: [], targetMinutes: DEFAULT_SLEEP_TARGET_HOURS * 60 };
  }
  const user = await getCurrentUser();
  if (!user) return { habit: null, latestEntry: null, entries: [], targetMinutes: DEFAULT_SLEEP_TARGET_HOURS * 60 };

  const [{ data: habits }, { data: entries }] = await Promise.all([
    supabase
      .from("habits")
      .select("*")
      .eq("user_id", user.id)
      .eq("habit_type", "sleep")
      .is("archived_at", null)
      .order("created_at", { ascending: true })
      .limit(1),
    supabase
      .from("sleep_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("sleep_date", { ascending: false })
      .limit(14),
  ]);

  const habit = ((habits ?? []) as Habit[])[0] ?? null;
  const sleepEntries = (entries ?? []) as SleepEntry[];
  return {
    habit,
    latestEntry: sleepEntries[0] ?? null,
    entries: sleepEntries,
    targetMinutes: targetMinutesForHabit(habit),
  };
}
