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
import { getAiAccessProfile } from "../services/ai-access";
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
import {
  createHabitFailure,
  queuedMergedHabitResult,
  runRoutineCreateSequence,
  type HabitCreateResult,
} from "../habits/routine-create";
import { recordPositiveCompletion } from "../services/activation-completion";
import { normalizeReminderSchedule, validateHabitInput } from "../habits/input-rules";
import { validateCompletionPeriod, validateCompletionValue } from "./completion-rules";
import {
  enqueueHabitMutation,
  flushPendingHabitMutations,
  isRetryableHabitMutationError,
  listPendingHabitMutations,
  rejectQueuedHabitMutation,
  replaceQueuedHabitMutationPayload,
  settleQueuedHabitMutation,
} from "./habit-mutation-queue";
import { runHabitMutationWriteExclusive } from "./habit-mutation-write-coordinator";

type ActionResult = { ok: boolean; error?: string; queued?: boolean };
type CompletionHabit = Pick<Habit, "name" | "unit" | "target"> & {
  habit_type?: Habit["habit_type"];
  metric_type?: Habit["metric_type"];
  habitType?: HabitType | null;
  metricType?: MetricType | null;
};
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
  const aiAccess = await getAiAccessProfile();
  return validateHabitRemote(input, { enabled: aiAccess.state === "eligible" });
}

async function validateHabitMutationInput(
  userId: string,
  data: HabitMutationData,
  intelligence: ReturnType<typeof inferHabitIntelligence>,
  currentHabitId?: string,
): Promise<
  { ok: true; data: HabitMutationData; existingHabits: Habit[] } | { ok: false; error: string }
> {
  const { data: existingHabits, error } = await supabase
    .from("habits")
    .select("*")
    .eq("user_id", userId)
    .is("archived_at", null);
  let activeHabits: Habit[] = [];
  if (error) {
    // Existing-habit updates are absolute and safe to queue. When the duplicate
    // name lookup itself is offline, continue with local validation and let the
    // replayed server update enforce the account boundary.
    if (!(currentHabitId && isNetworkFailure(error))) {
      return { ok: false, error: error.message };
    }
  } else {
    activeHabits = (existingHabits ?? []) as Habit[];
  }
  const habitRules = validateHabitInput({
    name: data.name,
    metricType: intelligence.metricType,
    target: intelligence.target,
    existingHabits: !currentHabitId && data.mergeSimilar !== false ? [] : activeHabits,
    currentHabitId: currentHabitId ?? null,
  });
  if (!habitRules.ok) return { ok: false, error: habitRules.errors[0] };

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
    existingHabits: activeHabits,
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

function validateCompletionIncrement(value: number, habit?: CompletionHabit) {
  if (!habit) {
    return Number.isFinite(value) && value > 0
      ? ({ ok: true, value } as const)
      : ({ ok: false, error: "Value must be a positive number." } as const);
  }
  const metricType =
    habit.metric_type ??
    habit.metricType ??
    inferHabitIntelligence({
      name: habit.name,
      unit: habit.unit,
      target: habit.target,
      habitType: habit.habit_type ?? habit.habitType,
    }).metricType;
  return validateCompletionValue(value, { metricType, target: habit.target });
}

async function settleConfirmedQueuedMutation(
  operationId: string,
  options?: { resolveLegacyFailures?: boolean },
): Promise<void> {
  try {
    await settleQueuedHabitMutation(operationId, options);
  } catch (error) {
    // The journal already contains the exact payload accepted by the server.
    // Leaving it replayable is idempotent and safer than reporting a false
    // failed save after the remote write committed.
    reportError(error instanceof Error ? error : new Error(String(error)), {
      context: "habit-mutation-success-settlement",
    });
  }
}

async function rejectStagedHabitMutation(
  operationId: string,
  error: { message?: string; code?: string } | null | undefined,
): Promise<ActionResult> {
  try {
    await rejectQueuedHabitMutation(operationId, {
      reason: error?.code === "PGRST116" ? "not_found" : "rejected",
      code: error?.code,
    });
  } catch (storageError) {
    reportError(storageError instanceof Error ? storageError : new Error(String(storageError)), {
      context: "habit-mutation-rejection-settlement",
    });
  }
  return mutationResult(error);
}

function habitJournalFailure(error: unknown): ActionResult {
  reportError(error instanceof Error ? error : new Error(String(error)), {
    context: "habit-mutation-journal",
  });
  return { ok: false, error: "Could not safely save this change. Try again." };
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

const LEGACY_HABIT_PATCH_FIELDS = [
  "name",
  "description",
  "icon",
  "color",
  "unit",
  "target",
  "reminders_enabled",
  "reminder_times",
  "reminder_days",
  "archived_at",
] as const;

function legacyCompatibleHabitPatch(payload: Record<string, unknown>): Record<string, unknown> {
  const legacy: Record<string, unknown> = {};
  for (const field of LEGACY_HABIT_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) legacy[field] = payload[field];
  }
  return legacy;
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
      // Mark the redirect as recovery ourselves so the callback always routes to
      // the set-new-password screen — we don't rely on Supabase appending `type`.
      redirectTo: authCallbackUrl({ type: "recovery" }),
    });
    return { error };
  } catch {
    return { error: networkError() };
  }
}

export async function resendConfirmationEmail(email: string) {
  if (!isSupabaseConfigured()) return { error: configurationError() };
  try {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: authCallbackUrl() },
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
  completedOn = localDateKey(),
  habit?: CompletionHabit,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const period = validateCompletionPeriod(completedOn, { operation: "log" });
  if (!period.ok) return { ok: false, error: period.error };
  void flushPendingCompletions();
  const incrementValue = validateCompletionIncrement(value ?? 1, habit);
  if (!incrementValue.ok) return { ok: false, error: incrementValue.error };
  const increment = incrementValue.value;
  const { error } = await supabase.rpc("log_habit_completion", {
    p_habit_id: habitId,
    p_completed_on: completedOn,
    p_increment: increment,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "increment",
      habitId,
      userId: user.id,
      completedOn,
      value: increment,
      note: note?.trim() || null,
    });
    if (increment > 0) await recordPositiveCompletion(user.id, true);
    return { ok: true, queued: true };
  }
  clearDataCache();
  scheduleReminderSync();
  if (increment > 0) await recordPositiveCompletion(user.id, false);
  return { ok: true };
}

export async function logCompletionOnce(
  habitId: string,
  operationId: string,
  value?: number,
  note?: string,
  completedOn = localDateKey(),
  habit?: CompletionHabit,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return notSignedIn();
  const period = validateCompletionPeriod(completedOn, { operation: "log" });
  if (!period.ok) return { ok: false, error: period.error };
  void flushPendingCompletions();
  const incrementValue = validateCompletionIncrement(value ?? 1, habit);
  if (!incrementValue.ok) return { ok: false, error: incrementValue.error };
  const increment = incrementValue.value;
  const { error } = await supabase.rpc("log_habit_completion_once", {
    p_operation_id: operationId,
    p_habit_id: habitId,
    p_completed_on: completedOn,
    p_increment: increment,
    p_note: note?.trim() || null,
  });
  if (error) {
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "increment_once",
      operationId,
      habitId,
      userId: user.id,
      completedOn,
      value: increment,
      note: note?.trim() || null,
    });
    if (increment > 0) await recordPositiveCompletion(user.id, true);
    return { ok: true, queued: true };
  }
  clearDataCache();
  scheduleReminderSync();
  if (increment > 0) await recordPositiveCompletion(user.id, false);
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
    track("habit_progress_set", { queued: true });
    if (value > 0) await recordPositiveCompletion(user.id, true);
    return { ok: true, queued: true };
  }
  clearDataCache();
  scheduleReminderSync();
  track("habit_progress_set");
  if (value > 0) await recordPositiveCompletion(user.id, false);
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
  void flushPendingCompletions();

  if (currentlyDone) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", completedOn);
    if (error) {
      if (!isNetworkFailure(error)) return mutationResult(error);
      await enqueueCompletionOp({
        kind: "uncomplete",
        habitId,
        userId: user.id,
        completedOn,
      });
      track("habit_uncompleted", { queued: true });
      return { ok: true, queued: true };
    }
    clearDataCache();
    scheduleReminderSync();
    track("habit_uncompleted");
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
        completedOn,
      });
      track("habit_completed", { queued: true });
      await recordPositiveCompletion(user.id, true);
      return { ok: true, queued: true };
    }
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
    if (!isNetworkFailure(error)) return mutationResult(error);
    await enqueueCompletionOp({
      kind: "complete",
      habitId,
      userId: user.id,
      completedOn,
      value: resolvedTarget,
    });
    track("habit_completed", { queued: true });
    await recordPositiveCompletion(user.id, true);
    return { ok: true, queued: true };
  }
  clearDataCache();
  scheduleReminderSync();
  track("habit_completed");
  await recordPositiveCompletion(user.id, false);
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
  await flushPendingHabitMutations();
  const payload = {
    reminders_enabled: data.enabled,
    reminder_times: data.times,
    reminder_days: data.days,
  };
  const writeResult = await runHabitMutationWriteExclusive(async (): Promise<ActionResult> => {
    const staged = await enqueueHabitMutation({
      kind: "update",
      habitId,
      userId: user.id,
      payload,
    });
    const { error } = await supabase
      .from("habits")
      .update(staged.payload)
      .eq("id", habitId)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (error) {
      if (isRetryableHabitMutationError(error)) return { ok: true, queued: true };
      return rejectStagedHabitMutation(staged.id, error);
    }

    await settleConfirmedQueuedMutation(staged.id);
    return { ok: true };
  }).catch(habitJournalFailure);
  if (!writeResult.ok || writeResult.queued) {
    if (writeResult.queued && !data.enabled) {
      await cancelHabitReminders(habitId).catch(() => undefined);
    }
    return writeResult;
  }

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

export async function createHabit(data: HabitMutationData) {
  const user = await getUser();
  if (!user) return createHabitFailure("You need to sign in again.", "auth");
  return createHabitForUser(user.id, data);
}

// Resolve the user once, then create habits sequentially. Firing createHabit in
// a Promise.all previously ran N concurrent getUser()/refresh/storage-write
// operations that could interleave and corrupt the chunked session, surfacing
// as "You need to sign in again." on every item. A single auth check plus serial
// creates removes that race and avoids redundant per-habit network round-trips.
export async function createRoutineHabits(list: HabitMutationData[]) {
  const user = await getUser();
  if (!user) return { signedOut: true as const, results: [] as HabitCreateResult[] };
  const { authLost, results } = await runRoutineCreateSequence(list, (data) =>
    createHabitForUser(user.id, data),
  );
  return { signedOut: authLost, results };
}

async function createHabitForUser(
  userId: string,
  data: HabitMutationData,
): Promise<HabitCreateResult> {
  try {
    return await createHabitForUserUnsafe(userId, data);
  } catch (error) {
    return createHabitFailure(error);
  }
}

async function createHabitForUserUnsafe(
  userId: string,
  data: HabitMutationData,
): Promise<HabitCreateResult> {
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

  const inputRules = await validateHabitMutationInput(userId, data, intelligence);
  if (!inputRules.ok) return createHabitFailure(inputRules.error, "validation");
  data = inputRules.data;

  let validation: HabitValidationResult;
  try {
    validation = await runHabitValidation(intelligence, data);
  } catch (error) {
    return createHabitFailure(error, "validation");
  }
  if (validation.status === "block") {
    return { ok: false, id: null, validation, failureKind: "validation" };
  }
  if (validation.status === "warn" && !data.acknowledgeWarning) {
    return { ok: false, id: null, validation, failureKind: "validation" };
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

  const insertNewHabit = async (): Promise<HabitCreateResult> => {
    const { data: row, error } = await supabase
      .from("habits")
      .insert(smartHabitPayload(data, intelligence, userId))
      .select("*")
      .single();
    if (error) {
      if (!isMissingSmartHabitColumn(error)) return createHabitFailure(error);
      const { data: legacyRow, error: legacyError } = await supabase
        .from("habits")
        .insert(legacyHabitPayload(data, intelligence, userId))
        .select("*")
        .single();
      if (legacyError) return createHabitFailure(legacyError);
      if (!legacyRow?.id) return createHabitFailure("The saved habit could not be loaded.");
      clearDataCache();
      if (data.remindersEnabled) scheduleReminderSync();
      track("habit_created", {
        color: data.color,
        has_target: intelligence.target != null,
        habit_type: intelligence.habitType,
        schema: "legacy",
      });
      return {
        ok: true,
        id: legacyRow.id as string,
        habit: legacyRow as Habit,
        migrated: false,
      };
    }

    if (!row?.id) return createHabitFailure("The saved habit could not be loaded.");
    clearDataCache();
    if (data.remindersEnabled) scheduleReminderSync();
    track("habit_created", {
      color: data.color,
      has_target: intelligence.target != null,
      habit_type: intelligence.habitType,
    });
    return { ok: true, id: row.id as string, habit: row as Habit };
  };

  return runHabitMutationWriteExclusive(async (): Promise<HabitCreateResult> => {
    const [{ data: activeRows, error: activeRowsError }, pending] = await Promise.all([
      supabase.from("habits").select("*").eq("user_id", userId).is("archived_at", null),
      listPendingHabitMutations(userId),
    ]);
    if (activeRowsError) return createHabitFailure(activeRowsError);

    const pendingByHabit = new Map(pending.map((operation) => [operation.habitId, operation]));
    const effectiveHabits = ((activeRows ?? []) as Habit[])
      .map((habit) => {
        const queued = pendingByHabit.get(habit.id);
        return {
          ...habit,
          ...(queued?.payload ?? {}),
          id: habit.id,
          user_id: habit.user_id,
        } as Habit;
      })
      .filter((habit) => !habit.archived_at);

    if (data.mergeSimilar === false) {
      const authoritativeRules = validateHabitInput({
        name: data.name,
        metricType: intelligence.metricType,
        target: intelligence.target,
        existingHabits: effectiveHabits,
        currentHabitId: null,
      });
      if (!authoritativeRules.ok) {
        return createHabitFailure(authoritativeRules.errors[0], "validation");
      }
      return insertNewHabit();
    }

    const match = effectiveHabits
      .map((habit) => ({ habit, score: scoreHabitSimilarity(candidate, habit) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!match || match.score < DUPLICATE_SIMILARITY_THRESHOLD) return insertNewHabit();

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
    const staged = await enqueueHabitMutation({
      kind: "update",
      habitId: match.habit.id,
      userId,
      payload: {
        reminders_enabled: reminders.enabled,
        reminder_times: reminders.times,
        reminder_days: reminders.days,
        ...merged,
      },
    });
    if (staged.kind === "archive") return insertNewHabit();
    const queuedMergeSuccess = (operation: typeof staged): HabitCreateResult =>
      queuedMergedHabitResult({
        ...match.habit,
        ...operation.payload,
        id: match.habit.id,
        user_id: match.habit.user_id,
      } as Habit);

    const { data: updatedRow, error } = await supabase
      .from("habits")
      .update(staged.payload)
      .eq("id", staged.habitId)
      .eq("user_id", userId)
      .select("*")
      .single();
    let accepted = staged;
    let savedRow = updatedRow as Habit | null;
    if (error) {
      if (isRetryableHabitMutationError(error)) return queuedMergeSuccess(staged);
      if (!isMissingSmartHabitColumn(error)) {
        await rejectQueuedHabitMutation(staged.id, { code: error.code });
        return createHabitFailure(error);
      }
      const legacyStaged = await replaceQueuedHabitMutationPayload(
        staged.id,
        legacyCompatibleHabitPatch(staged.payload),
      );
      if (!legacyStaged) {
        return queuedMergeSuccess(staged);
      }
      accepted = legacyStaged;
      const { data: legacyRow, error: legacyError } = await supabase
        .from("habits")
        .update(legacyStaged.payload)
        .eq("id", legacyStaged.habitId)
        .eq("user_id", userId)
        .select("*")
        .single();
      if (legacyError) {
        if (isRetryableHabitMutationError(legacyError)) {
          return queuedMergeSuccess(legacyStaged);
        }
        await rejectQueuedHabitMutation(legacyStaged.id, { code: legacyError.code });
        return createHabitFailure(legacyError);
      }
      savedRow = legacyRow as Habit | null;
    }
    if (!savedRow?.id) return createHabitFailure("The saved habit could not be loaded.");
    await settleConfirmedQueuedMutation(accepted.id);
    clearDataCache();
    scheduleReminderSync();
    track("habit_merged", { habit_type: merged.habit_type, score: match.score });
    return { ok: true, id: savedRow.id, habit: savedRow, merged: true };
  }).catch((error) => createHabitFailure(error));
}

export async function updateHabitFull(
  habitId: string,
  data: HabitMutationData,
): Promise<ActionResult & { validation?: HabitValidationResult }> {
  const user = await getUser();
  if (!user) return notSignedIn();
  await flushPendingHabitMutations();
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

  const smartPayload = smartHabitPayload(data, intelligence);
  const writeResult = await runHabitMutationWriteExclusive(async (): Promise<ActionResult> => {
    const staged = await enqueueHabitMutation({
      kind: "update",
      habitId,
      userId: user.id,
      payload: smartPayload,
    });
    const { error } = await supabase
      .from("habits")
      .update(staged.payload)
      .eq("id", habitId)
      .eq("user_id", user.id)
      .select("id")
      .single();
    let accepted = staged;
    if (error) {
      if (isRetryableHabitMutationError(error)) return { ok: true, queued: true };
      if (!isMissingSmartHabitColumn(error)) {
        return rejectStagedHabitMutation(staged.id, error);
      }
      const legacyStaged = await replaceQueuedHabitMutationPayload(
        staged.id,
        legacyCompatibleHabitPatch(staged.payload),
      );
      if (!legacyStaged) return { ok: true, queued: true };
      accepted = legacyStaged;
      const { error: legacyError } = await supabase
        .from("habits")
        .update(legacyStaged.payload)
        .eq("id", habitId)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (legacyError) {
        if (isRetryableHabitMutationError(legacyError)) return { ok: true, queued: true };
        return rejectStagedHabitMutation(legacyStaged.id, legacyError);
      }
    }

    await settleConfirmedQueuedMutation(accepted.id, { resolveLegacyFailures: true });
    return { ok: true };
  }).catch(habitJournalFailure);
  if (!writeResult.ok || writeResult.queued) {
    if (writeResult.queued && !data.remindersEnabled) {
      await cancelHabitReminders(habitId).catch(() => undefined);
    }
    return writeResult;
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
  await flushPendingHabitMutations();
  const payload = { archived_at: new Date().toISOString(), reminders_enabled: false };
  const writeResult = await runHabitMutationWriteExclusive(async (): Promise<ActionResult> => {
    const staged = await enqueueHabitMutation({
      kind: "archive",
      habitId,
      userId: user.id,
      payload,
    });
    const { error } = await supabase
      .from("habits")
      .update(staged.payload)
      .eq("id", habitId)
      .eq("user_id", user.id)
      .select("id")
      .single();
    if (error) {
      if (isRetryableHabitMutationError(error)) return { ok: true, queued: true };
      return rejectStagedHabitMutation(staged.id, error);
    }

    await settleConfirmedQueuedMutation(staged.id);
    return { ok: true };
  }).catch(habitJournalFailure);
  if (!writeResult.ok || writeResult.queued) {
    if (writeResult.queued) await cancelHabitReminders(habitId).catch(() => undefined);
    return writeResult;
  }

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
