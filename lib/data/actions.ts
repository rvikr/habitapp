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
import { reportError } from "../services/sentry";
import { authCallbackUrl, parseAuthCallbackUrl } from "../auth/auth-redirect";
import {
  GOOGLE_NATIVE_ANDROID_AUTH_ENABLED,
  getGoogleNativeIdToken,
  googleNativeDeveloperErrorMessage,
  googleNativeAuthConfig,
  googleNativeSignInButtonMode,
  isExpoGoRuntime,
  isGoogleNativeCancellationError,
  isGoogleNativeDeveloperError,
} from "../auth/google-native";
import { hasPasswordIdentity, hasRecentSignIn } from "../auth/identity";
import { enqueueCompletionOp, flushPendingCompletions, isNetworkFailure } from "./completion-queue";
import { clearDataCache } from "./cache";
import { clearHomeWidgetSnapshot } from "../widgets/home-widget";
import { localDateKey } from "../utils/date";
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
  type MetricType,
  type ReminderStrategy,
  type VisualType,
} from "../coach/habit-intelligence";
import type { Habit } from "../../types/db";
import { validateHabitLocally, type HabitValidationResult } from "../habits/validate";
import { validateHabitRemote } from "../habits/validate-remote";

type ActionResult = { ok: boolean; error?: string; queued?: boolean };
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
  await clearHomeWidgetSnapshot();
}

export async function signInWithGoogle(): Promise<{ error: Error | null; cancelled?: boolean }> {
  if (!isSupabaseConfigured()) return { error: configurationError() as unknown as Error };
  const isExpoGo = isExpoGoRuntime(Constants);
  if (
    googleNativeSignInButtonMode({
      platform: Platform.OS,
      isExpoGo,
      nativeAndroidAuthEnabled: GOOGLE_NATIVE_ANDROID_AUTH_ENABLED,
    }) === "native"
  ) {
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
    if (isGoogleNativeDeveloperError(error)) {
      return { error: new Error(googleNativeDeveloperErrorMessage()) };
    }
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

    return { error: new Error("No authentication code received.") };
  } catch (err) {
    if (__DEV__) console.error("[Google OAuth] error:", err);
    return { error: err instanceof Error ? err : networkError() };
  }
}

export async function logCompletion(
  habitId: string,
  value?: number,
  note?: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  void flushPendingCompletions();
  const { error } = await supabase.rpc("log_habit_completion", {
    p_habit_id: habitId,
    p_completed_on: localDateKey(),
    p_increment: value ?? 1,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "increment",
      habitId,
      userId: user.id,
      completedOn: localDateKey(),
      value: value ?? 1,
      note: note?.trim() || null,
    });
    return { ok: true, queued: true };
  }
  clearDataCache();
  scheduleReminderSync();
  return { ok: true };
}

// Monotonic write for auto-tracked values (step sync): only ever raises
// today's value, so it can never clobber a higher total from a manual log.
export async function raiseCompletionValue(
  habitId: string,
  value: number,
  note?: string,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  void flushPendingCompletions();

  const { error } = await supabase.rpc("raise_habit_completion_value", {
    p_habit_id: habitId,
    p_completed_on: localDateKey(),
    p_value: value,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "set_value_max",
      habitId,
      userId: user.id,
      completedOn: localDateKey(),
      value,
      note: note?.trim() || null,
    });
    track("habit_progress_set", { habit_id: habitId, queued: true });
    return { ok: true, queued: true };
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
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  void flushPendingCompletions();

  if (currentlyDone) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", localDateKey());
    if (error) {
      if (!isNetworkFailure(error)) return mutationResult(error);
      await enqueueCompletionOp({
        kind: "uncomplete",
        habitId,
        userId: user.id,
        completedOn: localDateKey(),
      });
      track("habit_uncompleted", { habit_id: habitId, queued: true });
      return { ok: true, queued: true };
    }
    clearDataCache();
    scheduleReminderSync();
    track("habit_uncompleted", { habit_id: habitId });
    return { ok: true };
  }

  let resolvedTarget: number | undefined;
  if (knownTarget != null) {
    resolvedTarget = knownTarget > 0 ? knownTarget : 1;
  } else {
    const { data: habit, error: habitError } = await supabase
      .from("habits")
      .select("target")
      .eq("id", habitId)
      .eq("user_id", user.id)
      .single();
    if (habitError) {
      if (!isNetworkFailure(habitError)) return mutationResult(habitError);
      // Offline before the target lookup: queue with no value so the replay
      // resolves the real target once we're back online.
      await enqueueCompletionOp({
        kind: "complete",
        habitId,
        userId: user.id,
        completedOn: localDateKey(),
      });
      track("habit_completed", { habit_id: habitId, queued: true });
      return { ok: true, queued: true };
    }
    resolvedTarget = Number((habit as { target: number | null } | null)?.target ?? 1);
    if (resolvedTarget <= 0) resolvedTarget = 1;
  }

  const { error } = await supabase
    .from("habit_completions")
    .upsert(
      { habit_id: habitId, user_id: user.id, completed_on: localDateKey(), value: resolvedTarget },
      { onConflict: "habit_id,completed_on" },
    );
  if (error) {
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "complete",
      habitId,
      userId: user.id,
      completedOn: localDateKey(),
      value: resolvedTarget,
    });
    track("habit_completed", { habit_id: habitId, queued: true });
    return { ok: true, queued: true };
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
  const payload = {
    coach_tone: normalizeCoachTone(tone),
    updated_at: new Date().toISOString(),
  };
  // Update-first (not upsert): the profiles row exists for every user, and
  // PostgREST's upsert would try to write user_id in the DO UPDATE SET, which
  // migration 20260614120000 revoked UPDATE on — failing with permission denied.
  const { data: updated, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("user_id", user.id)
    .select("user_id");
  if (error) return mutationResult(error);
  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ user_id: user.id, ...payload });
    if (insertError) return mutationResult(insertError);
  }
  clearDataCache();
  return mutationResult(null);
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
  else {
    // Cancel this habit's scheduled ids, then rebuild so any bundle it shared
    // with other habits is re-scheduled without it.
    await cancelHabitReminders(habitId);
    scheduleReminderSync();
  }
  return { ok: true };
}

type CreateHabitResult = Awaited<ReturnType<typeof createHabitForUser>>;

export async function createHabit(data: HabitMutationData) {
  const user = await getUser();
  if (!user) return { ok: false, id: null, error: "You need to sign in again." };
  return createHabitForUser(user.id, data);
}

// Resolve the user once, then create habits sequentially. Firing createHabit in
// a Promise.all previously ran N concurrent getUser()/refresh/storage-write
// operations that could interleave and corrupt the chunked session, surfacing
// as "You need to sign in again." on every item. A single auth check plus serial
// creates removes that race and avoids redundant per-habit network round-trips.
export async function createRoutineHabits(list: HabitMutationData[]) {
  const user = await getUser();
  if (!user) return { signedOut: true as const, results: [] as CreateHabitResult[] };
  const results: CreateHabitResult[] = [];
  for (const data of list) {
    results.push(await createHabitForUser(user.id, data));
  }
  return { signedOut: false as const, results };
}

async function createHabitForUser(userId: string, data: HabitMutationData) {
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
      .eq("user_id", userId)
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
      .eq("user_id", userId);
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
        .eq("user_id", userId);
      if (legacyError) return { ok: false, id: null, error: legacyError.message };
    }
    clearDataCache();
    scheduleReminderSync();
    track("habit_merged", { habit_type: merged.habit_type, score: match.score });
    return { ok: true, id: match.habit.id, merged: true };
  }

  const { data: row, error } = await supabase
    .from("habits")
    .insert(smartHabitPayload(data, intelligence, userId))
    .select("id")
    .single();
  if (error) {
    if (!isMissingSmartHabitColumn(error)) return { ok: false, id: null, error: error.message };
    const { data: legacyRow, error: legacyError } = await supabase
      .from("habits")
      .insert(legacyHabitPayload(data, intelligence, userId))
      .select("id")
      .single();
    if (legacyError) return { ok: false, id: null, error: legacyError.message };
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
    if (!isMissingSmartHabitColumn(error)) return mutationResult(error);
    const { error: legacyError } = await supabase
      .from("habits")
      .update(legacyHabitPayload(data, intelligence))
      .eq("id", habitId)
      .eq("user_id", user.id);
    if (legacyError) return mutationResult(legacyError);
  }

  clearDataCache();
  if (data.remindersEnabled) scheduleReminderSync();
  else {
    // Drop this habit's reminders, then rebuild so a shared bundle is re-issued
    // without it.
    cancelHabitReminders(habitId)
      .then(() => scheduleReminderSync())
      .catch((error) => {
        reportError(error instanceof Error ? error : new Error(String(error)), {
          context: "cancel-habit-reminders",
        });
      });
  }
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
  // Cancel the deleted habit's scheduled ids, then rebuild so any bundle it
  // shared with remaining habits is re-scheduled without it.
  await cancelHabitReminders(habitId);
  scheduleReminderSync();
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
): Promise<ActionResult & { needsReauth?: boolean }> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const email = user.email?.trim();
  try {
    if (hasPasswordIdentity(user)) {
      const confirmationPassword = password?.trim() ?? "";
      if (!email || !confirmationPassword) {
        return { ok: false, error: "Confirm your password before deleting your account." };
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: confirmationPassword,
      });
      if (signInError) return { ok: false, error: "Password confirmation failed." };
    } else if (!hasRecentSignIn(user.last_sign_in_at)) {
      // OAuth-only account: no password exists, and the delete-account edge
      // function requires a recent sign-in. Tell the UI to run the provider
      // sign-in flow, then call this again.
      return {
        ok: false,
        needsReauth: true,
        error: "Confirm it's you by signing in with Google again.",
      };
    }

    const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
      "delete-account",
      { body: { reason: reason?.trim() || null } },
    );
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error ?? "Could not delete account." };
    await clearLocalAuthSession();
    clearDataCache();
    resetAnalytics();
    await clearHomeWidgetSnapshot();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
