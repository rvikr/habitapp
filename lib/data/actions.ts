import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import {
  supabase,
  isSupabaseConfigured,
  configurationError,
  clearLocalAuthSession,
  getCurrentUser,
  markUserInitiatedSignOut,
} from "../supabase/client";
import type { AvatarStyle } from "../utils/avatar";
import { normalizeCoachTone, type CoachTone } from "../coach/coach";
import { track, resetAnalytics } from "../services/analytics";
import { authCallbackUrl, parseAuthCallbackUrl } from "../auth/auth-redirect";
import { buildCompletionValuePayload } from "./completions";
import { clearDataCache } from "./cache";
import { localDateKey } from "../utils/date";
import { cancelHabitReminders, syncScheduledReminders } from "./reminder-sync";
import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  inferHabitIntelligence,
  mergeHabitReminders,
  mergeHabitSettings,
  scoreHabitSimilarity,
  type HabitType,
  type MetricType,
  type ReminderStrategy,
  type VisualType,
} from "../coach/habit-intelligence";
import type { Habit } from "../../types/db";

type ActionResult = { ok: boolean; error?: string };
type HabitMutationData = {
  name: string;
  description: string | null;
  icon: string;
  color: "primary" | "secondary" | "tertiary" | "neutral";
  unit: string;
  target: number | null;
  remindersEnabled: boolean;
  reminderTimes: string[];
  reminderDays: number[];
  habitType?: HabitType | null;
  metricType?: MetricType | null;
  visualType?: VisualType | null;
  reminderStrategy?: ReminderStrategy | null;
  reminderIntervalMinutes?: number | null;
  defaultLogValue?: number | null;
  mergeSimilar?: boolean;
};

async function getUser() {
  return getCurrentUser();
}

function notSignedIn(): ActionResult {
  return { ok: false, error: "You need to sign in again." };
}

function mutationResult(error: { message?: string } | null | undefined): ActionResult {
  return error ? { ok: false, error: error.message ?? "Something went wrong." } : { ok: true };
}

function networkError(): Error {
  return new Error("Network error. Check your connection and try again.");
}

function isMissingSmartHabitColumn(
  error: { message?: string; code?: string } | null | undefined,
): boolean {
  const message = (error?.message ?? "").toLowerCase();
  return (
    error?.code === "PGRST204" ||
    message.includes("default_log_value") ||
    message.includes("habit_type") ||
    message.includes("metric_type") ||
    message.includes("visual_type") ||
    message.includes("reminder_strategy") ||
    message.includes("reminder_interval_minutes")
  );
}

function legacyHabitPayload(
  data: HabitMutationData,
  intelligence: ReturnType<typeof inferHabitIntelligence>,
  userId?: string,
) {
  return {
    ...(userId ? { user_id: userId } : {}),
    name: data.name,
    description: data.description,
    icon: data.icon,
    color: data.color,
    unit: intelligence.unit || null,
    target: intelligence.target ?? null,
    reminders_enabled: data.remindersEnabled,
    reminder_times: data.reminderTimes,
    reminder_days: data.reminderDays,
  };
}

function smartHabitPayload(
  data: HabitMutationData,
  intelligence: ReturnType<typeof inferHabitIntelligence>,
  userId?: string,
) {
  return {
    ...legacyHabitPayload(data, intelligence, userId),
    habit_type: intelligence.habitType,
    metric_type: intelligence.metricType,
    visual_type: intelligence.visualType,
    reminder_strategy: intelligence.reminderStrategy,
    reminder_interval_minutes: intelligence.reminderIntervalMinutes,
    default_log_value: intelligence.defaultLogValue,
  };
}

export async function signIn(email: string, password: string) {
  if (!isSupabaseConfigured()) return { error: configurationError() };
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) clearDataCache();
    return { error };
  } catch {
    return { error: networkError() };
  }
}

export async function signUp(email: string, password: string) {
  if (!isSupabaseConfigured()) return { data: null, error: configurationError() };
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authCallbackUrl() },
    });
    if (!error) clearDataCache();
    return { data, error };
  } catch {
    return { data: null, error: networkError() };
  }
}

export async function resetPassword(email: string) {
  if (!isSupabaseConfigured()) return { error: configurationError() };
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authCallbackUrl(),
    });
    return { error };
  } catch {
    return { error: networkError() };
  }
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    markUserInitiatedSignOut();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) await clearLocalAuthSession();
    } catch {
      await clearLocalAuthSession();
    }
  }
  clearDataCache();
  resetAnalytics();
}

export async function signInWithGoogle(): Promise<{ error: Error | null; cancelled?: boolean }> {
  if (!isSupabaseConfigured()) return { error: configurationError() as unknown as Error };
  try {
    const redirectTo = authCallbackUrl();
    if (__DEV__) console.log("[Google OAuth] redirectTo =", redirectTo);

    if (Platform.OS === "web") {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      return { error: error as Error | null };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error as unknown as Error };
    if (!data.url) return { error: new Error("No authentication URL returned.") };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
      showInRecents: true,
      preferEphemeralSession: false,
    });
    if (result.type === "cancel" || result.type === "dismiss")
      return { error: null, cancelled: true };
    if (result.type !== "success") return { error: new Error("Authentication was not completed.") };

    const parsed = parseAuthCallbackUrl(result.url);
    if (parsed.error) return { error: new Error(parsed.errorDescription ?? parsed.error) };

    if (parsed.code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (!exchangeError) clearDataCache();
      return { error: exchangeError as Error | null };
    }
    if (parsed.accessToken && parsed.refreshToken) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (!sessionError) clearDataCache();
      return { error: sessionError as Error | null };
    }

    return { error: new Error("No authentication tokens received.") };
  } catch {
    return { error: networkError() };
  }
}

export async function logCompletion(
  habitId: string,
  value?: number,
  note?: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const completedOn = localDateKey();
  const { data: existing, error: readError } = await supabase
    .from("habit_completions")
    .select("value")
    .eq("habit_id", habitId)
    .eq("user_id", user.id)
    .eq("completed_on", completedOn)
    .maybeSingle();
  if (readError) return mutationResult(readError);

  const increment = value ?? 1;
  const nextValue = Number(existing?.value ?? 0) + increment;
  const { error } = await supabase.from("habit_completions").upsert(
    {
      habit_id: habitId,
      user_id: user.id,
      completed_on: completedOn,
      value: nextValue,
      note: note?.trim() || null,
    },
    { onConflict: "habit_id,completed_on" },
  );
  if (error) return mutationResult(error);
  clearDataCache();
  void syncScheduledReminders();
  return { ok: true };
}

export async function setCompletionValue(
  habitId: string,
  value: number,
  note?: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();

  const { error } = await supabase
    .from("habit_completions")
    .upsert(buildCompletionValuePayload(habitId, user.id, localDateKey(), value, note), {
      onConflict: "habit_id,completed_on",
    });
  if (error) return mutationResult(error);
  clearDataCache();
  void syncScheduledReminders();
  track("habit_progress_set", { habit_id: habitId });
  return { ok: true };
}

export async function toggleHabit(
  habitId: string,
  currentlyDone: boolean,
  knownTarget?: number | null,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();

  if (currentlyDone) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", localDateKey());
    if (error) return mutationResult(error);
    clearDataCache();
    void syncScheduledReminders();
    track("habit_uncompleted", { habit_id: habitId });
    return { ok: true };
  }

  let resolvedTarget: number;
  if (knownTarget != null) {
    resolvedTarget = knownTarget > 0 ? knownTarget : 1;
  } else {
    const { data: habit, error: habitError } = await supabase
      .from("habits")
      .select("target")
      .eq("id", habitId)
      .eq("user_id", user.id)
      .single();
    if (habitError) return mutationResult(habitError);
    resolvedTarget = Number((habit as { target: number | null } | null)?.target ?? 1);
    if (resolvedTarget <= 0) resolvedTarget = 1;
  }

  const { error } = await supabase
    .from("habit_completions")
    .upsert(
      { habit_id: habitId, user_id: user.id, completed_on: localDateKey(), value: resolvedTarget },
      { onConflict: "habit_id,completed_on" },
    );
  if (error) return mutationResult(error);
  clearDataCache();
  void syncScheduledReminders();
  track("habit_completed", { habit_id: habitId });
  return { ok: true };
}

export async function updateAvatar(style: AvatarStyle, seed: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const { error } = await supabase.auth.updateUser({
    data: { avatar_style: style, avatar_seed: seed },
  });
  if (error) return mutationResult(error);
  clearDataCache();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_style: style, avatar_seed: seed, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (!profileError) clearDataCache();
  return mutationResult(profileError);
}

export async function updateCoachTone(tone: CoachTone): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    coach_tone: normalizeCoachTone(tone),
    updated_at: new Date().toISOString(),
  });
  if (!error) clearDataCache();
  return mutationResult(error);
}

export async function updateHabitReminders(
  habitId: string,
  data: { enabled: boolean; times: string[]; days: number[] },
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const { error } = await supabase
    .from("habits")
    .update({
      reminders_enabled: data.enabled,
      reminder_times: data.times,
      reminder_days: data.days,
    })
    .eq("id", habitId)
    .eq("user_id", user.id);
  if (error) return mutationResult(error);

  clearDataCache();
  if (data.enabled) await syncScheduledReminders();
  else await cancelHabitReminders(habitId);
  return { ok: true };
}

export async function createHabit(data: HabitMutationData) {
  const user = await getUser();
  if (!user) return { ok: false, id: null, error: "You need to sign in again." };
  const intelligence = inferHabitIntelligence({
    name: data.name,
    icon: data.icon,
    unit: data.unit,
    target: data.target,
    habitType: data.habitType,
    metricType: data.metricType,
    visualType: data.visualType,
    reminderStrategy: data.reminderStrategy,
    reminderIntervalMinutes: data.reminderIntervalMinutes,
    defaultLogValue: data.defaultLogValue,
  });

  const candidate = {
    ...data,
    habitType: intelligence.habitType,
    metricType: intelligence.metricType,
    visualType: intelligence.visualType,
    reminderStrategy: intelligence.reminderStrategy,
    reminderIntervalMinutes: intelligence.reminderIntervalMinutes,
    defaultLogValue: intelligence.defaultLogValue,
    unit: intelligence.unit,
    target: intelligence.target,
  };
  let match: { habit: Habit; score: number } | undefined;
  if (data.mergeSimilar !== false) {
    const { data: existingHabits, error: readError } = await supabase
      .from("habits")
      .select("*")
      .eq("user_id", user.id)
      .is("archived_at", null);
    if (readError) return { ok: false, id: null, error: readError.message };
    match = ((existingHabits ?? []) as Habit[])
      .map((habit) => ({ habit, score: scoreHabitSimilarity(candidate, habit) }))
      .sort((a, b) => b.score - a.score)[0];
  }

  if (match && match.score >= DUPLICATE_SIMILARITY_THRESHOLD) {
    const merged = mergeHabitSettings(candidate, match.habit);
    const reminders = mergeHabitReminders(
      {
        enabled: match.habit.reminders_enabled,
        times: match.habit.reminder_times,
        days: match.habit.reminder_days,
      },
      {
        enabled: data.remindersEnabled,
        times: data.reminderTimes,
        days: data.reminderDays,
      },
    );
    const mergePayload = {
      reminders_enabled: reminders.enabled,
      reminder_times: reminders.times,
      reminder_days: reminders.days,
      ...merged,
    };
    const { error } = await supabase
      .from("habits")
      .update(mergePayload)
      .eq("id", match.habit.id)
      .eq("user_id", user.id);
    if (error) {
      if (!isMissingSmartHabitColumn(error)) return { ok: false, id: null, error: error.message };
      const { error: legacyError } = await supabase
        .from("habits")
        .update({
          name: merged.name,
          description: merged.description,
          unit: merged.unit,
          target: merged.target,
          reminders_enabled: reminders.enabled,
          reminder_times: reminders.times,
          reminder_days: reminders.days,
        })
        .eq("id", match.habit.id)
        .eq("user_id", user.id);
      if (legacyError) return { ok: false, id: null, error: legacyError.message };
    }
    clearDataCache();
    void syncScheduledReminders();
    track("habit_merged", { habit_type: merged.habit_type, score: match.score });
    return { ok: true, id: match.habit.id, merged: true };
  }

  const { data: row, error } = await supabase
    .from("habits")
    .insert(smartHabitPayload(data, intelligence, user.id))
    .select("id")
    .single();
  if (error) {
    if (!isMissingSmartHabitColumn(error)) return { ok: false, id: null, error: error.message };
    const { data: legacyRow, error: legacyError } = await supabase
      .from("habits")
      .insert(legacyHabitPayload(data, intelligence, user.id))
      .select("id")
      .single();
    if (legacyError) return { ok: false, id: null, error: legacyError.message };
    clearDataCache();
    if (data.remindersEnabled) void syncScheduledReminders();
    track("habit_created", {
      color: data.color,
      has_target: intelligence.target != null,
      habit_type: intelligence.habitType,
      schema: "legacy",
    });
    return { ok: true, id: legacyRow?.id as string, migrated: false };
  }

  clearDataCache();
  if (data.remindersEnabled) void syncScheduledReminders();
  track("habit_created", {
    color: data.color,
    has_target: intelligence.target != null,
    habit_type: intelligence.habitType,
  });
  return { ok: true, id: row?.id as string };
}

export async function updateHabitFull(
  habitId: string,
  data: HabitMutationData,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const intelligence = inferHabitIntelligence({
    name: data.name,
    icon: data.icon,
    unit: data.unit,
    target: data.target,
    habitType: data.habitType,
    metricType: data.metricType,
    visualType: data.visualType,
    reminderStrategy: data.reminderStrategy,
    reminderIntervalMinutes: data.reminderIntervalMinutes,
    defaultLogValue: data.defaultLogValue,
  });
  const { error } = await supabase
    .from("habits")
    .update(smartHabitPayload(data, intelligence))
    .eq("id", habitId)
    .eq("user_id", user.id);
  if (error) {
    if (!isMissingSmartHabitColumn(error)) return mutationResult(error);
    const { error: legacyError } = await supabase
      .from("habits")
      .update(legacyHabitPayload(data, intelligence))
      .eq("id", habitId)
      .eq("user_id", user.id);
    if (legacyError) return mutationResult(legacyError);
  }

  clearDataCache();
  if (data.remindersEnabled) void syncScheduledReminders();
  else void cancelHabitReminders(habitId);
  return { ok: true };
}

export async function deleteHabit(habitId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const { error } = await supabase
    .from("habits")
    .update({ archived_at: new Date().toISOString(), reminders_enabled: false })
    .eq("id", habitId)
    .eq("user_id", user.id);
  if (error) return mutationResult(error);

  clearDataCache();
  await cancelHabitReminders(habitId);
  return { ok: true };
}

export async function updatePassword(newPassword: string) {
  if (!isSupabaseConfigured()) return { error: configurationError() };
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error };
  } catch {
    return { error: networkError() };
  }
}

export async function requestAccountDeletion(
  reason?: string,
  password?: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const email = user.email?.trim();
  const confirmationPassword = password?.trim() ?? "";
  if (!email || !confirmationPassword) {
    return { ok: false, error: "Confirm your password before deleting your account." };
  }
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: confirmationPassword,
    });
    if (signInError) return { ok: false, error: "Password confirmation failed." };

    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "delete-account",
      { body: { reason: reason?.trim() || null } },
    );
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "Could not delete account." };
    await clearLocalAuthSession();
    clearDataCache();
    resetAnalytics();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
