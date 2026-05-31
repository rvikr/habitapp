import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
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
import {
  getGoogleNativeIdToken,
  googleNativeAuthConfig,
  googleNativeSignInButtonMode,
  isGoogleNativeCancellationError,
} from "../auth/google-native";
import { buildCompletionValuePayload } from "./completions";
import { validateCompletionPeriod, validateCompletionValue } from "./completion-rules";
import { clearDataCache } from "./cache";
import { localDateKey } from "../utils/date";
import { getItem, removeItem, setItem } from "../platform/storage";
import { createOfflineQueue, type OfflineMutation, type OfflineMutationType } from "./offline-queue";
import {
  cancelHabitReminders,
  scheduleReminderSync,
  syncScheduledReminders,
} from "./reminder-sync";
import {
  DUPLICATE_SIMILARITY_THRESHOLD,
  inferHabitIntelligence,
  mergeHabitReminders,
  mergeHabitSettings,
  scoreHabitSimilarity,
  type HabitType,
  type ReminderStrategy,
  type VisualType,
} from "../coach/habit-intelligence";
import type { Habit, MetricType } from "../../types/db";
import {
  normalizeReminderSchedule,
  validateHabitInput,
} from "../habits/input-rules";
import { validateHabitLocally, type HabitValidationResult } from "../habits/validate";
import { validateHabitRemote } from "../habits/validate-remote";

type ActionResult = { ok: boolean; error?: string };
type QueuedMutationResult = { ok: true; queued: true } | { ok: false; error: string };
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
  acknowledgeWarning?: boolean;
};

async function runHabitValidation(
  intelligence: { habitType: HabitType; metricType: MetricType },
  data: HabitMutationData,
): Promise<HabitValidationResult> {
  const input = {
    name: data.name,
    description: data.description,
    unit: data.unit,
    target: data.target,
    habitType: intelligence.habitType,
    metricType: intelligence.metricType,
  };
  const local = validateHabitLocally(input);
  if (local.status !== "uncertain") return local;
  return validateHabitRemote(input);
}

const DUPLICATE_HABIT_NAME_ERROR = "A habit with this name already exists.";

function habitInputActionError(error: string): string {
  return error === DUPLICATE_HABIT_NAME_ERROR ? DUPLICATE_HABIT_NAME_ERROR : error;
}

async function validateHabitMutationInput(
  userId: string,
  data: HabitMutationData,
  intelligence: ReturnType<typeof inferHabitIntelligence>,
  currentHabitId?: string,
): Promise<
  | { ok: true; data: HabitMutationData }
  | { ok: false; error: string }
> {
  const { data: existingHabits, error } = await supabase
    .from("habits")
    .select("id, name, archived_at")
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const habitRules = validateHabitInput({
    name: data.name,
    metricType: intelligence.metricType,
    target: intelligence.target,
    existingHabits: (existingHabits ?? []) as Pick<Habit, "id" | "name" | "archived_at">[],
    currentHabitId: currentHabitId ?? null,
  });
  if (!habitRules.ok) return { ok: false, error: habitInputActionError(habitRules.errors[0]) };

  const scheduleRules = normalizeReminderSchedule({
    remindersEnabled: data.remindersEnabled,
    reminderStrategy: intelligence.reminderStrategy,
    reminderTimes: data.reminderTimes,
    reminderDays: data.reminderDays,
    reminderIntervalMinutes: intelligence.reminderIntervalMinutes,
  });
  if (!scheduleRules.ok) return { ok: false, error: scheduleRules.errors[0] };

  return {
    ok: true,
    data: {
      ...data,
      name: habitRules.data.name,
      target: habitRules.data.target,
      remindersEnabled: scheduleRules.data.remindersEnabled,
      reminderTimes: scheduleRules.data.reminderTimes,
      reminderDays: scheduleRules.data.reminderDays,
      reminderIntervalMinutes: scheduleRules.data.reminderIntervalMinutes,
    },
  };
}

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

const offlineQueue = createOfflineQueue({ getItem, setItem, removeItem });

function isRetryableError(error: { message?: string } | null | undefined): boolean {
  return /network|fetch|timeout|offline|connection/i.test(error?.message ?? "");
}

async function queueRetryableMutation(
  type: OfflineMutationType,
  entityKey: string,
  payload: Record<string, unknown>,
  error: { message?: string } | null | undefined,
): Promise<QueuedMutationResult> {
  if (!isRetryableError(error)) {
    return { ok: false, error: error?.message ?? "Something went wrong." };
  }

  const now = new Date().toISOString();
  const mutation: OfflineMutation = {
    id: `${type}:${entityKey}:${now}`,
    type,
    entityKey,
    payload,
    createdAt: now,
    clientUpdatedAt: now,
  };

  try {
    await offlineQueue.enqueue(mutation);
    return { ok: true, queued: true };
  } catch (queueError) {
    return {
      ok: false,
      error: queueError instanceof Error ? queueError.message : "Could not queue offline change.",
    };
  }
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
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  if (googleNativeSignInButtonMode({ platform: Platform.OS, isExpoGo }) === "native") {
    return signInWithNativeGoogle();
  }

  return signInWithGoogleOAuth();
}

async function signInWithNativeGoogle(): Promise<{ error: Error | null; cancelled?: boolean }> {
  try {
    const { GoogleSignin } = await import("@react-native-google-signin/google-signin");

    GoogleSignin.configure(googleNativeAuthConfig());
    const hasPlayServices = await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
    if (!hasPlayServices) return { error: new Error("Google Play Services are not available.") };

    const response = await GoogleSignin.signIn();
    if (response.type === "cancelled") return { error: null, cancelled: true };

    const idToken = getGoogleNativeIdToken(response);
    if (!idToken) return { error: new Error("No Google ID token received.") };

    const { error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: idToken,
    });
    if (!error) clearDataCache();
    return { error: error as Error | null };
  } catch (error) {
    if (isGoogleNativeCancellationError(error)) return { error: null, cancelled: true };
    return { error: error instanceof Error ? error : new Error("Google Sign-In failed.") };
  }
}

async function signInWithGoogleOAuth(): Promise<{ error: Error | null; cancelled?: boolean }> {
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
  } catch (err) {
    if (__DEV__) console.error("[Google OAuth] error:", err);
    return { error: err instanceof Error ? err : networkError() };
  }
}

export async function logCompletion(
  habitId: string,
  value?: number,
  note?: string,
  completedOn = localDateKey(),
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const period = validateCompletionPeriod(completedOn, { operation: "log" });
  if (!period.ok) return { ok: false, error: period.error };
  const { error } = await supabase.rpc("log_habit_completion", {
    p_habit_id: habitId,
    p_completed_on: completedOn,
    p_increment: value ?? 1,
    p_note: note?.trim() || null,
  });
  if (error) {
    return queueRetryableMutation(
      "completion.increment",
      `completion:${habitId}:${completedOn}`,
      { habitId, completedOn, value: value ?? 1, note: note?.trim() || null },
      error,
    );
  }
  clearDataCache();
  scheduleReminderSync();
  return { ok: true };
}

export async function setCompletionValue(
  habitId: string,
  value: number,
  note?: string,
  completedOn = localDateKey(),
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();

  const period = validateCompletionPeriod(completedOn, { operation: "set" });
  if (!period.ok) return { ok: false, error: period.error };

  const { data: habit, error: habitError } = await supabase
    .from("habits")
    .select("target, metric_type")
    .eq("id", habitId)
    .eq("user_id", user.id)
    .single();
  if (habitError) return mutationResult(habitError);
  const completionHabit = {
    metricType: ((habit as { metric_type: MetricType | null }).metric_type ?? "boolean"),
    target: (habit as { target: number | null }).target,
  };
  const normalizedValue = validateCompletionValue(value, completionHabit);
  if (!normalizedValue.ok) return { ok: false, error: normalizedValue.error };

  const { error } = await supabase
    .from("habit_completions")
    .upsert(
      buildCompletionValuePayload(
        habitId,
        user.id,
        completedOn,
        normalizedValue.value,
        note,
        completionHabit,
      ),
      {
        onConflict: "habit_id,completed_on",
      },
    );
  if (error) {
    return queueRetryableMutation(
      "completion.set",
      `completion:${habitId}:${completedOn}`,
      { habitId, completedOn, value: normalizedValue.value, note: note?.trim() || null },
      error,
    );
  }
  clearDataCache();
  scheduleReminderSync();
  track("habit_progress_set", { habit_id: habitId });
  return { ok: true };
}

export async function toggleHabit(
  habitId: string,
  currentlyDone: boolean,
  knownTarget?: number | null,
  completedOn = localDateKey(),
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();

  const period = validateCompletionPeriod(completedOn, {
    operation: currentlyDone ? "undo" : "done",
    existingCompletion: currentlyDone,
  });
  if (!period.ok) return { ok: false, error: period.error };

  if (currentlyDone) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", completedOn);
    if (error) {
      return queueRetryableMutation(
        "completion.delete",
        `completion:${habitId}:${completedOn}`,
        { habitId, completedOn },
        error,
      );
    }
    clearDataCache();
    scheduleReminderSync();
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
      { habit_id: habitId, user_id: user.id, completed_on: completedOn, value: resolvedTarget },
      { onConflict: "habit_id,completed_on" },
    );
  if (error) {
    return queueRetryableMutation(
      "completion.set",
      `completion:${habitId}:${completedOn}`,
      { habitId, completedOn, value: resolvedTarget },
      error,
    );
  }
  clearDataCache();
  scheduleReminderSync();
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

  const inputRules = await validateHabitMutationInput(user.id, data, intelligence);
  if (!inputRules.ok) return { ok: false, id: null, error: inputRules.error };
  data = inputRules.data;

  const validation = await runHabitValidation(intelligence, data);
  if (validation.status === "block") {
    return { ok: false, id: null, validation };
  }
  if (validation.status === "warn" && !data.acknowledgeWarning) {
    return { ok: false, id: null, validation };
  }

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
      if (!isMissingSmartHabitColumn(error)) {
        const result = await queueRetryableMutation(
          "habit.upsert",
          `habit:${match.habit.id}`,
          mergePayload,
          error,
        );
        return { ...result, id: null };
      }
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
      if (legacyError) {
        const result = await queueRetryableMutation(
          "habit.upsert",
          `habit:${match.habit.id}`,
          {
            name: merged.name,
            description: merged.description,
            unit: merged.unit,
            target: merged.target,
            reminders_enabled: reminders.enabled,
            reminder_times: reminders.times,
            reminder_days: reminders.days,
          },
          legacyError,
        );
        return { ...result, id: null };
      }
    }
    clearDataCache();
    scheduleReminderSync();
    track("habit_merged", { habit_type: merged.habit_type, score: match.score });
    return { ok: true, id: match.habit.id, merged: true };
  }

  const { data: row, error } = await supabase
    .from("habits")
    .insert(smartHabitPayload(data, intelligence, user.id))
    .select("id")
    .single();
  if (error) {
    if (!isMissingSmartHabitColumn(error)) {
      const result = await queueRetryableMutation(
        "habit.upsert",
        `habit:new:${user.id}:${data.name}`,
        smartHabitPayload(data, intelligence, user.id),
        error,
      );
      return { ...result, id: null };
    }
    const { data: legacyRow, error: legacyError } = await supabase
      .from("habits")
      .insert(legacyHabitPayload(data, intelligence, user.id))
      .select("id")
      .single();
    if (legacyError) {
      const result = await queueRetryableMutation(
        "habit.upsert",
        `habit:new:${user.id}:${data.name}`,
        legacyHabitPayload(data, intelligence, user.id),
        legacyError,
      );
      return { ...result, id: null };
    }
    clearDataCache();
    if (data.remindersEnabled) scheduleReminderSync();
    track("habit_created", {
      color: data.color,
      has_target: intelligence.target != null,
      habit_type: intelligence.habitType,
      schema: "legacy",
    });
    return { ok: true, id: legacyRow?.id as string, migrated: false };
  }

  clearDataCache();
  if (data.remindersEnabled) scheduleReminderSync();
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
): Promise<ActionResult & { validation?: HabitValidationResult }> {
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

  const inputRules = await validateHabitMutationInput(user.id, data, intelligence, habitId);
  if (!inputRules.ok) return { ok: false, error: inputRules.error };
  data = inputRules.data;

  const validation = await runHabitValidation(intelligence, data);
  if (validation.status === "block") {
    return { ok: false, validation };
  }
  if (validation.status === "warn" && !data.acknowledgeWarning) {
    return { ok: false, validation };
  }

  const { error } = await supabase
    .from("habits")
    .update(smartHabitPayload(data, intelligence))
    .eq("id", habitId)
    .eq("user_id", user.id);
  if (error) {
    if (!isMissingSmartHabitColumn(error)) {
      return queueRetryableMutation(
        "habit.upsert",
        `habit:${habitId}`,
        smartHabitPayload(data, intelligence),
        error,
      );
    }
    const { error: legacyError } = await supabase
      .from("habits")
      .update(legacyHabitPayload(data, intelligence))
      .eq("id", habitId)
      .eq("user_id", user.id);
    if (legacyError) {
      return queueRetryableMutation(
        "habit.upsert",
        `habit:${habitId}`,
        legacyHabitPayload(data, intelligence),
        legacyError,
      );
    }
  }

  clearDataCache();
  if (data.remindersEnabled) scheduleReminderSync();
  else void cancelHabitReminders(habitId);
  return { ok: true };
}

export async function deleteHabit(habitId: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("habits")
    .update({ archived_at: archivedAt, reminders_enabled: false })
    .eq("id", habitId)
    .eq("user_id", user.id);
  if (error) {
    return queueRetryableMutation(
      "habit.archive",
      `habit:${habitId}`,
      { habitId, archived_at: archivedAt },
      error,
    );
  }

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
