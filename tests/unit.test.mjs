import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  addDateKeyDays,
  addLocalDays,
  dayIndexForDateKey,
  isValidDateKey as isValidAppDateKey,
  localDateDaysAgo,
  localDateKey,
} from "../lib/utils/date.ts";
import {
  XP_PER_COMPLETION,
  XP_PER_LEVEL,
  levelForXp,
  xpForCompletions,
  xpInLevel,
} from "../lib/coach/xp.ts";
import { validatePassword } from "../lib/auth/password.ts";
import {
  AUTH_CALLBACK_CONFIRMED_BODY,
  AUTH_CALLBACK_CONFIRMED_TITLE,
  FIRST_LOGIN_WELCOME_BODY,
  FIRST_LOGIN_WELCOME_TITLE,
  SIGNUP_CONFIRMATION_MESSAGE,
  isPendingSignupForEmail,
  shouldShowFirstLoginWelcome,
  shouldRequireFirstRunOnboarding,
} from "../lib/auth/auth-welcome.ts";
import { getHabitImageForHabit } from "../lib/data/habit-images.ts";
import { authCallbackUrlFromParams } from "../lib/auth/auth-callback-params.ts";
import {
  googleNativeAuthConfig,
  googleNativeAuthReady,
  googleNativeAuthUnavailableReason,
  googleNativeSignInButtonMode,
  getGoogleNativeIdToken,
  isGoogleNativeCancellationError,
} from "../lib/auth/google-native.ts";
import { isSupportedLanguage, languageLabel, translate } from "../lib/i18n/translations.ts";
import { isMissingRefreshTokenError } from "../lib/supabase/auth-error.ts";
import {
  isValidReminderTime,
  parseOptionalPositiveNumber,
  validateFeedback,
} from "../lib/auth/validation.ts";
import {
  HABIT_NAME_MAX_LENGTH,
  normalizeHabitName,
  normalizeReminderSchedule,
  validateHabitInput,
  validateLogValueForHabit,
} from "../lib/habits/input-rules.ts";
import { streakFromDates } from "../lib/coach/streak.ts";
import {
  COMPLETION_LOOKBACK_DAYS,
  validateCompletionPeriod,
  validateCompletionValue,
} from "../lib/data/completion-rules.ts";
import { buildCompletionValuePayload } from "../lib/data/completions.ts";
import {
  healthConnectTodayRange,
  normalizeHealthConnectStepAggregate,
  normalizeStepCount,
} from "../lib/data/steps-shared.ts";
import {
  buildSleepCompletionValue,
  computeSleepScore,
  isSleepEntriesSetupError,
  normalizeHealthConnectSleepSessions,
  normalizeHealthKitSleepSamples,
  sleepNoDataMessage,
  sleepDateForWakeTime,
  sleepLookbackWindows,
  sleepWindowForDate,
} from "../lib/data/sleep-shared.ts";
import {
  inferHabitIntelligence,
  mergeHabitReminders,
  mergeHabitSettings,
  progressForHabit,
  scoreHabitSimilarity,
  smartReminderTimesForDay,
} from "../lib/coach/habit-intelligence.ts";
import {
  learnedSmartReminderTimesForDay,
  sanitizeSmartReminderPlanTimes,
} from "../lib/coach/smart-reminders.ts";
import { resolveAiSmartReminderPlans } from "../lib/coach/smart-reminder-ai.ts";
import { buildRoutineRecommendations } from "../lib/coach/routine-builder.ts";
import { sanitizeHabitRecommendations } from "../lib/coach/routine-ai.ts";
import { buildCoachSignals, formatCoachMessage, chooseTopCoachSignal } from "../lib/coach/coach.ts";
import { resolveCoachMessage } from "../lib/coach/coach-ai.ts";
import { generateContent } from "../supabase/functions/_shared/gemini.ts";
import * as subscriptionAccess from "../lib/subscription/access.ts";
import { clearCache, getCachedValue, readThroughCache } from "../lib/data/cache.ts";
import { createQueuedReminderSync } from "../lib/data/reminder-sync-queue.ts";
import {
  dateKeyInTimeZone,
  isValidDateKey,
  localDateKey as websiteLocalDateKey,
} from "../website/lib/date.ts";
import {
  XP_PER_COMPLETION as WEBSITE_XP_PER_COMPLETION,
  XP_PER_LEVEL as WEBSITE_XP_PER_LEVEL,
} from "../website/lib/xp.ts";
import { isMissingRefreshTokenError as websiteIsMissingRefreshTokenError } from "../website/lib/supabase/auth-error.ts";

const { resolveProAccess, subscriptionStatusLabel } = subscriptionAccess;

let testChain = Promise.resolve();
let actionImportTestLoaderRegistered = false;

function test(name, fn) {
  testChain = testChain.then(async () => {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      console.error(`not ok - ${name}`);
      throw error;
    }
  });
}

async function registerActionImportTestLoader() {
  if (actionImportTestLoaderRegistered) return;

  const { register } = await import("node:module");
  const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;
  const externalStubs = [
    [
      "react-native",
      dataModule('export const Platform = { OS: "web" }; export default { Platform };'),
    ],
    [
      "expo-web-browser",
      dataModule('export async function openAuthSessionAsync() { return { type: "cancel" }; }'),
    ],
    ["expo-constants", dataModule('export default { executionEnvironment: "bare" };')],
    [
      "expo-linking",
      dataModule(
        'export function createURL(path = "") { return "habbit:///" + path; } export function parse(url) { const parsed = new URL(url, "habbit:///"); return { queryParams: Object.fromEntries(parsed.searchParams.entries()) }; }',
      ),
    ],
  ];
  const platformStubs = [
    ["/platform/webcrypto-polyfill", dataModule("")],
    [
      "/platform/secure-storage",
      dataModule(
        "const store = new Map(); export const secureStorage = { async getItem(key) { return store.get(key) ?? null; }, async setItem(key, value) { store.set(key, value); }, async removeItem(key) { store.delete(key); } };",
      ),
    ],
    [
      "/platform/storage",
      dataModule(
        "const store = new Map(); export async function getItem(key) { return store.get(key) ?? null; } export async function setItem(key, value) { store.set(key, value); } export async function removeItem(key) { store.delete(key); }",
      ),
    ],
    [
      "/platform/notifications",
      dataModule(
        'export async function requestPermission() { return false; } export async function getPermissionStatus() { return "undetermined"; } export async function scheduleHabitReminder() { return []; } export async function scheduleHabitReminderAt() { return ""; } export async function cancelScheduledReminder() {} export async function cancelAllReminders() {}',
      ),
    ],
  ];
  const loaderSource = `
const externalStubs = new Map(${JSON.stringify(externalStubs)});
const platformStubs = new Map(${JSON.stringify(platformStubs)});
export async function resolve(specifier, context, nextResolve) {
  const external = externalStubs.get(specifier);
  if (external) return { url: external, shortCircuit: true };
  for (const [suffix, url] of platformStubs) {
    if (specifier.endsWith(suffix)) return { url, shortCircuit: true };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code === "ERR_MODULE_NOT_FOUND" && (specifier.startsWith(".") || specifier.startsWith("/"))) {
      return nextResolve(specifier + ".ts", context);
    }
    throw error;
  }
}`;

  register(dataModule(loaderSource), import.meta.url);
  actionImportTestLoaderRegistered = true;
}

test("localDateKey uses local calendar fields", () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
});

test("app date helpers validate date keys and add calendar days", () => {
  assert.equal(isValidAppDateKey("2026-05-31"), true);
  assert.equal(isValidAppDateKey("2026-02-30"), false);
  assert.equal(addDateKeyDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dayIndexForDateKey("2026-05-31"), 0);
});

test("completion period rules reject future and too-old new logs", () => {
  const now = new Date(2026, 4, 31, 12, 0);
  assert.deepEqual(validateCompletionPeriod("2026-05-31", { now }), { ok: true });
  assert.equal(validateCompletionPeriod("2026-06-01", { now }).ok, false);
  assert.equal(
    validateCompletionPeriod(addDateKeyDays("2026-05-31", -(COMPLETION_LOOKBACK_DAYS + 1)), {
      now,
    }).ok,
    false,
  );
});

test("completion period rules always allow undo of existing periods", () => {
  const now = new Date(2026, 4, 31, 12, 0);
  assert.equal(
    validateCompletionPeriod("2026-01-01", {
      now,
      operation: "undo",
      existingCompletion: true,
    }).ok,
    true,
  );
});

test("completion period rules reject future undo of existing periods", () => {
  assert.equal(
    validateCompletionPeriod("2026-06-01", {
      now: new Date(2026, 4, 31, 12, 0),
      operation: "undo",
      existingCompletion: true,
    }).ok,
    false,
  );
});

test("completion value rules require positive bounded numbers", () => {
  assert.deepEqual(validateCompletionValue(10, { metricType: "minutes", target: 30 }), {
    ok: true,
    value: 10,
  });
  assert.equal(validateCompletionValue(0, { metricType: "minutes", target: 30 }).ok, false);
  assert.equal(
    validateCompletionValue(Number.POSITIVE_INFINITY, { metricType: "steps", target: 10000 }).ok,
    false,
  );
  assert.equal(validateCompletionValue(31, { metricType: "minutes", target: 30 }).ok, false);
});

test("localDateDaysAgo crosses month boundaries", () => {
  assert.equal(localDateDaysAgo(1, new Date(2026, 0, 1, 8, 0)), "2025-12-31");
});

test("website date helpers preserve browser-local calendar days", () => {
  const boundary = new Date("2026-01-01T23:30:00.000Z");
  assert.equal(dateKeyInTimeZone(boundary, "UTC"), "2026-01-01");
  assert.equal(dateKeyInTimeZone(boundary, "Asia/Kolkata"), "2026-01-02");
  assert.equal(websiteLocalDateKey(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
});

test("date key validation accepts only real yyyy-mm-dd calendar dates", () => {
  assert.equal(isValidDateKey("2026-05-10"), true);
  assert.equal(isValidDateKey("2026-02-30"), false);
  assert.equal(isValidDateKey("05/10/2026"), false);
});

test("localDateDaysAgo lands on Feb 29 in leap years and Feb 28 in non-leap years", () => {
  assert.equal(localDateDaysAgo(1, new Date(2024, 2, 1, 8, 0)), "2024-02-29");
  assert.equal(localDateDaysAgo(1, new Date(2025, 2, 1, 8, 0)), "2025-02-28");
});

test("addLocalDays crosses the year boundary forward", () => {
  assert.equal(localDateKey(addLocalDays(new Date(2025, 11, 31, 12, 0), 1)), "2026-01-01");
});

test("localDateKey flips at the stroke of midnight", () => {
  assert.equal(localDateKey(new Date(2026, 4, 17, 23, 59, 59, 999)), "2026-05-17");
  assert.equal(localDateKey(new Date(2026, 4, 18, 0, 0, 0, 1)), "2026-05-18");
});

// DST: Date.setDate is calendar-day arithmetic, so streaks across spring-forward
// (US: Mar 9 2025 02:00 -> 03:00) and fall-back (US: Nov 2 2025 02:00 -> 01:00)
// must still count consecutive days without an off-by-one.
test("streakFromDates spans US DST spring-forward without dropping a day", () => {
  const afterSpringForward = new Date(2025, 2, 10, 12, 0);
  const dates = [
    localDateKey(afterSpringForward),
    localDateDaysAgo(1, afterSpringForward),
    localDateDaysAgo(2, afterSpringForward),
    localDateDaysAgo(3, afterSpringForward),
  ];
  assert.equal(streakFromDates(dates, afterSpringForward), 4);
});

test("streakFromDates spans US DST fall-back without double-counting", () => {
  const afterFallBack = new Date(2025, 10, 3, 12, 0);
  const dates = [
    localDateKey(afterFallBack),
    localDateDaysAgo(1, afterFallBack),
    localDateDaysAgo(2, afterFallBack),
    localDateDaysAgo(3, afterFallBack),
  ];
  assert.equal(streakFromDates(dates, afterFallBack), 4);
});

test("streakFromDates counts an unbroken run across the new year", () => {
  const newYearsDay = new Date(2026, 0, 1, 9, 0);
  const dates = [
    localDateKey(newYearsDay),
    localDateDaysAgo(1, newYearsDay),
    localDateDaysAgo(2, newYearsDay),
  ];
  assert.equal(dates[1], "2025-12-31");
  assert.equal(streakFromDates(dates, newYearsDay), 3);
});

test("XP constants are canonical across app, website, and SQL", () => {
  assert.equal(XP_PER_COMPLETION, 10);
  assert.equal(XP_PER_LEVEL, 500);
  assert.equal(WEBSITE_XP_PER_COMPLETION, XP_PER_COMPLETION);
  assert.equal(WEBSITE_XP_PER_LEVEL, XP_PER_LEVEL);
  assert.equal(xpForCompletions(51), 510);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(500), 2);
  assert.equal(xpInLevel(510), 10);

  const sql = readFileSync("supabase/migrations/0008_release_readiness.sql", "utf8");
  assert.match(sql, /count\(\*\)::bigint \* 10 as xp/);
  assert.match(sql, /\/ 500 \+ 1 as level/);
});

test("leaderboard RPC is restricted to authenticated callers", () => {
  const sql = readFileSync("supabase/migrations/0012_restrict_leaderboard_rpc.sql", "utf8");
  assert.match(sql, /revoke execute on function public\.get_leaderboard\(text\) from public/i);
  assert.match(sql, /revoke execute on function public\.get_leaderboard\(text\) from anon/i);
  assert.match(sql, /grant execute on function public\.get_leaderboard\(text\) to authenticated/i);
  assert.match(sql, /if auth\.uid\(\) is null then/i);
  assert.match(sql, /raise exception 'authenticated user required'/i);
});

test("AI quota RPC is service-only and records quota events", () => {
  const sql = readFileSync("supabase/migrations/0013_ai_quota_and_auth_hardening.sql", "utf8");
  assert.match(sql, /create table if not exists public\.ai_usage_counters/i);
  assert.match(sql, /create table if not exists public\.ai_usage_events/i);
  assert.match(sql, /revoke all on table public\.ai_usage_counters from public/i);
  assert.match(sql, /revoke all on table public\.ai_usage_events from public/i);
  assert.match(sql, /create or replace function public\.consume_ai_quota/i);
  assert.match(sql, /current_setting\('request\.jwt\.claim\.role'/i);
  assert.match(sql, /raise exception 'service role required'/i);
  assert.match(
    sql,
    /revoke execute on function public\.consume_ai_quota\(uuid, text, integer, integer\) from public/i,
  );
  assert.match(
    sql,
    /revoke execute on function public\.consume_ai_quota\(uuid, text, integer, integer\) from anon/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.consume_ai_quota\(uuid, text, integer, integer\) to service_role/i,
  );
  assert.match(sql, /where key = 'ai_suggestions'/i);
  assert.match(sql, /hourly_quota_exceeded/i);
  assert.match(sql, /daily_quota_exceeded/i);
});

test("AI Edge Functions enforce server-side quota before Gemini calls", () => {
  for (const [path, feature] of [
    ["supabase/functions/coach-message/index.ts", "coach-message"],
    ["supabase/functions/habit-routine/index.ts", "habit-routine"],
    ["supabase/functions/smart-reminders/index.ts", "smart-reminders"],
  ]) {
    const source = readFileSync(path, "utf8");
    const guardIndex = source.indexOf("enforceAiQuota");
    const callIndex = source.indexOf("generateContent(");
    assert.ok(guardIndex >= 0, `${path} should enforce the AI quota guard`);
    assert.ok(
      callIndex >= 0,
      `${path} should call Gemini through the shared generateContent helper`,
    );
    assert.ok(guardIndex < callIndex, `${path} should enforce quota before calling Gemini`);
    assert.match(source, new RegExp(`enforceAiQuota\\(admin, user\\.id, "${feature}"\\)`));
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(source, /recordAiUsageEvent/);
  }
});

test("Shared Gemini helper bounds requests with a timeout and a single retry", () => {
  const source = readFileSync("supabase/functions/_shared/gemini.ts", "utf8");
  assert.match(source, /generativelanguage\.googleapis\.com/);
  assert.match(source, /AbortController/);
  assert.match(source, /RETRYABLE_STATUS/);
  assert.match(source, /const MAX_RETRIES = 1/);
});

test("subscription migration grants only new signups a seven day Pro trial", () => {
  const sql = readFileSync("supabase/migrations/0018_free_pro_subscriptions.sql", "utf8");
  assert.match(sql, /pro_trial_started_at timestamptz/i);
  assert.match(sql, /pro_trial_ends_at\s+timestamptz/i);
  assert.match(sql, /revenuecat_app_user_id text/i);
  assert.match(sql, /revenuecat_entitlement_id text/i);
  assert.match(sql, /pro_expires_at\s+timestamptz/i);
  assert.match(sql, /create or replace function public\.has_pro_access\(p_user_id uuid\)/i);
  assert.match(
    sql,
    /insert into public\.profiles \(user_id, pro_trial_started_at, pro_trial_ends_at\)/i,
  );
  assert.match(sql, /now\(\) \+ interval '7 days'/i);
  assert.doesNotMatch(sql, /update public\.profiles\s+set\s+pro_trial_started_at/i);
});

test("Pro access helper covers trial subscription and admin override states", () => {
  const now = new Date("2026-05-22T00:00:00.000Z");
  assert.deepEqual(
    resolveProAccess({ is_pro: false, pro_trial_ends_at: "2026-05-21T23:59:59.000Z" }, now),
    { hasPro: false, source: "free", expiresAt: null, trialDaysLeft: null },
  );
  assert.deepEqual(
    resolveProAccess({ is_pro: false, pro_trial_ends_at: "2026-05-22T00:00:01.000Z" }, now),
    {
      hasPro: true,
      source: "trial",
      expiresAt: "2026-05-22T00:00:01.000Z",
      trialDaysLeft: 1,
    },
  );
  assert.deepEqual(
    resolveProAccess(
      {
        is_pro: false,
        revenuecat_entitlement_active: true,
        pro_expires_at: "2026-06-01T00:00:00.000Z",
      },
      now,
    ),
    {
      hasPro: true,
      source: "subscription",
      expiresAt: "2026-06-01T00:00:00.000Z",
      trialDaysLeft: null,
    },
  );
  assert.deepEqual(
    resolveProAccess(
      {
        is_pro: false,
        pro_trial_ends_at: "2026-05-29T00:00:00.000Z",
        revenuecat_entitlement_active: true,
        pro_expires_at: "2026-06-01T00:00:00.000Z",
      },
      now,
    ),
    {
      hasPro: true,
      source: "subscription",
      expiresAt: "2026-06-01T00:00:00.000Z",
      trialDaysLeft: null,
    },
  );
  assert.deepEqual(resolveProAccess({ is_pro: true }, now), {
    hasPro: true,
    source: "admin",
    expiresAt: null,
    trialDaysLeft: null,
  });
  assert.equal(subscriptionStatusLabel({ is_pro: true }, now), "Pro");
  assert.equal(
    subscriptionStatusLabel({ pro_trial_ends_at: "2026-05-22T00:00:01.000Z" }, now),
    "Trial",
  );
  assert.equal(subscriptionStatusLabel({}, now), "Free");
});

test("trial helpers expose rounded days left and session banner visibility", () => {
  const now = new Date("2026-05-22T10:00:00.000Z");
  assert.equal(subscriptionAccess.trialDaysLeft?.("2026-05-22T10:00:01.000Z", now), 1);
  assert.equal(subscriptionAccess.trialDaysLeft?.("2026-05-23T09:59:59.000Z", now), 1);
  assert.equal(subscriptionAccess.trialDaysLeft?.("2026-05-29T10:00:00.000Z", now), 7);
  assert.equal(subscriptionAccess.trialDaysLeft?.("2026-05-22T09:59:59.000Z", now), null);
  assert.equal(subscriptionAccess.trialDaysLeft?.("not-a-date", now), null);

  const trialAccess = resolveProAccess(
    { is_pro: false, pro_trial_ends_at: "2026-05-29T10:00:00.000Z" },
    now,
  );
  const paidAccess = resolveProAccess(
    {
      is_pro: false,
      revenuecat_entitlement_active: true,
      pro_expires_at: "2026-06-01T00:00:00.000Z",
    },
    now,
  );
  const expiredAccess = resolveProAccess(
    { is_pro: false, pro_trial_ends_at: "2026-05-22T09:59:59.000Z" },
    now,
  );

  assert.equal(subscriptionAccess.shouldShowTrialSubscriptionBanner?.(trialAccess, false), true);
  assert.equal(subscriptionAccess.shouldShowTrialSubscriptionBanner?.(trialAccess, true), false);
  assert.equal(subscriptionAccess.shouldShowTrialSubscriptionBanner?.(paidAccess, false), false);
  assert.equal(subscriptionAccess.shouldShowTrialSubscriptionBanner?.(expiredAccess, false), false);
});

test("AI Edge Functions enforce Pro access before quota and Gemini calls", () => {
  for (const [path, feature] of [
    ["supabase/functions/coach-message/index.ts", "coach-message"],
    ["supabase/functions/habit-routine/index.ts", "habit-routine"],
    ["supabase/functions/smart-reminders/index.ts", "smart-reminders"],
  ]) {
    const source = readFileSync(path, "utf8");
    const proIndex = source.indexOf("await enforceProAccess");
    const quotaIndex = source.indexOf("await enforceAiQuota");
    const callIndex = source.indexOf("generateContent(");
    assert.ok(proIndex >= 0, `${path} should enforce Pro access`);
    assert.ok(quotaIndex >= 0, `${path} should still enforce quota`);
    assert.ok(proIndex < quotaIndex, `${path} should enforce Pro access before quota`);
    assert.ok(proIndex < callIndex, `${path} should enforce Pro access before Gemini`);
    assert.match(source, new RegExp(`enforceProAccess\\(admin, user\\.id, "${feature}"\\)`));
    assert.match(source, /reason: "pro_required"/);
  }
});

test("RevenueCat Pro integration exposes sync webhook and product identifiers", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.dependencies["react-native-purchases"], "^10.1.2");

  const subscriptionClient = readFileSync("lib/subscription/revenuecat.ts", "utf8");
  assert.match(subscriptionClient, /PRO_ENTITLEMENT_ID = "pro"/);
  assert.match(subscriptionClient, /PRO_MONTHLY_PRODUCT_ID = "pro_monthly"/);
  assert.match(subscriptionClient, /PRO_ANNUAL_PRODUCT_ID = "pro_annual"/);
  assert.match(subscriptionClient, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/);
  assert.match(subscriptionClient, /EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY/);
  assert.match(subscriptionClient, /sync-subscription/);

  const syncFunction = readFileSync("supabase/functions/sync-subscription/index.ts", "utf8");
  assert.match(syncFunction, /REVENUECAT_SECRET_API_KEY/);
  assert.match(syncFunction, /api\.revenuecat\.com\/v1\/subscribers/);
  assert.match(syncFunction, /revenuecat_entitlement_active/);

  const webhookFunction = readFileSync("supabase/functions/revenuecat-webhook/index.ts", "utf8");
  assert.match(webhookFunction, /REVENUECAT_WEBHOOK_AUTH_TOKEN/);
  assert.match(webhookFunction, /entitlement_ids/);
  assert.match(webhookFunction, /revenuecat_latest_event_id/);

  const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
  assert.match(supabaseConfig, /\[functions\.revenuecat-webhook\]/);
  assert.match(supabaseConfig, /verify_jwt = false/);
});

test("reminder schedule habit queries are explicitly scoped to the current user", () => {
  const source = readFileSync("lib/data/reminders.ts", "utf8");
  const habitQueries =
    source.match(
      /supabase\s*\n\s*\.from\("habits"\)[\s\S]*?\.eq\("reminders_enabled", true\);?/g,
    ) ?? [];

  assert.equal(habitQueries.length, 2);
  for (const query of habitQueries) {
    assert.match(query, /\.eq\("user_id", user\.id\)/);
  }
});

test("Sentry crash reporting honors the privacy opt-out", () => {
  const sentrySource = readFileSync("lib/services/sentry.ts", "utf8");
  assert.match(sentrySource, /SENTRY_OPT_OUT_KEY/);
  assert.match(sentrySource, /export async function isSentryOptedOut/);
  assert.match(sentrySource, /export async function setSentryOptOut/);
  assert.match(sentrySource, /optedOut = await readOptOut\(\)/);
  assert.match(sentrySource, /if \(optedOut \|\| !initialized \|\| !SentryRef\) return;/);

  const privacyScreen = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacyScreen, /isSentryOptedOut/);
  assert.match(privacyScreen, /setSentryOptOut/);
  assert.match(privacyScreen, /Crash reporting opt-out/);
});

test("account deletion requires password confirmation and recent sign-in", () => {
  const actionSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(
    actionSource,
    /requestAccountDeletion\(\s*reason\?: string,\s*password\?: string,?\s*\)/,
  );
  assert.match(actionSource, /signInWithPassword/);
  assert.match(actionSource, /Confirm your password before deleting your account/);

  const screenSource = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(screenSource, /deletePassword/);
  assert.match(screenSource, /secureTextEntry/);
  assert.match(screenSource, /requestAccountDeletion\(reason, deletePassword\)/);

  const functionSource = readFileSync("supabase/functions/delete-account/index.ts", "utf8");
  assert.match(functionSource, /DELETE_ACCOUNT_REAUTH_MAX_AGE_SECONDS/);
  assert.match(functionSource, /function hasRecentSignIn/);
  assert.match(functionSource, /user\.last_sign_in_at/);
  assert.match(functionSource, /Recent sign-in required before deleting your account/);
  assert.ok(
    functionSource.indexOf("hasRecentSignIn(user)") <
      functionSource.indexOf("admin.auth.admin.deleteUser"),
    "delete-account should enforce recent sign-in before deleting the auth user",
  );
});

test("external account deletion page is wired for Play Store compliance", () => {
  const mobileEnvExample = readFileSync(".env.local.example", "utf8");
  assert.match(
    mobileEnvExample,
    /EXPO_PUBLIC_ACCOUNT_DELETION_URL=https:\/\/your-domain\.example\/account-deletion/,
  );

  const websiteEnvExample = readFileSync("website/.env.local.example", "utf8");
  assert.match(
    websiteEnvExample,
    /NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL=privacy@your-domain\.example/,
  );

  const privacyScreen = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacyScreen, /EXPO_PUBLIC_ACCOUNT_DELETION_URL/);
  assert.match(privacyScreen, /openAccountDeletionPage/);
  assert.doesNotMatch(privacyScreen, /ExpoLinking\.createURL\("account-deletion"\)/);

  const deletionPage = readFileSync("website/app/account-deletion/page.tsx", "utf8");
  assert.match(deletionPage, /Delete your Lagan account/);
  assert.match(deletionPage, /\/login\?next=\/settings/);
  assert.match(deletionPage, /NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL/);

  const settingsForm = readFileSync("website/app/(app)/settings/SettingsForm.tsx", "utf8");
  assert.match(settingsForm, /deletePassword/);
  assert.match(settingsForm, /signInWithPassword/);
  assert.match(
    settingsForm,
    /functions\.invoke<\{ ok\?: boolean; error\?: string \}>\("delete-account"/,
  );
  assert.match(settingsForm, /\/account-deletion\?status=deleted/);

  const loginForm = readFileSync("website/app/login/LoginForm.tsx", "utf8");
  assert.match(loginForm, /useSearchParams/);
  assert.match(loginForm, /safeNextPath/);
});

test("store-facing support and legal links have production build defaults", () => {
  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /https:\/\/lagan\.health\/terms/);
  assert.match(settingsScreen, /support@lagan\.health/);

  const privacyScreen = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacyScreen, /https:\/\/lagan\.health\/privacy/);
  assert.match(privacyScreen, /https:\/\/lagan\.health\/account-deletion/);

  const easConfig = JSON.parse(readFileSync("eas.json", "utf8"));
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_TERMS_URL, "https://lagan.health/terms");
  assert.equal(
    easConfig.build.production.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    "https://lagan.health/privacy",
  );
  assert.equal(
    easConfig.build.production.env.EXPO_PUBLIC_ACCOUNT_DELETION_URL,
    "https://lagan.health/account-deletion",
  );
  assert.equal(easConfig.build.production.env.EXPO_PUBLIC_SUPPORT_EMAIL, "support@lagan.health");
});

test("Health Connect privacy policy links route to a dedicated Play rationale activity", () => {
  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));
  const plugins = appConfig.expo.plugins.map((plugin) =>
    Array.isArray(plugin) ? plugin[0] : plugin,
  );
  const healthConnectIndex = plugins.indexOf("expo-health-connect");
  const rationaleIndex = plugins.indexOf("./plugins/with-health-connect-rationale");
  assert.ok(healthConnectIndex >= 0, "app should install the Health Connect config plugin");
  assert.ok(rationaleIndex >= 0, "app should install the Health Connect rationale config plugin");
  assert.ok(
    rationaleIndex < healthConnectIndex,
    "rationale plugin should be declared before expo-health-connect so its manifest cleanup runs after Expo composes mods",
  );
  assert.deepEqual(
    appConfig.expo.android.permissions.filter((permission) =>
      permission.startsWith("android.permission.health."),
    ),
    ["android.permission.health.READ_STEPS", "android.permission.health.READ_SLEEP"],
  );

  const pluginSource = readFileSync("plugins/with-health-connect-rationale.js", "utf8");
  assert.match(pluginSource, /HealthConnectRationaleActivity/);
  assert.match(pluginSource, /ACTION_SHOW_PERMISSIONS_RATIONALE/);
  assert.match(pluginSource, /VIEW_PERMISSION_USAGE/);
  assert.match(pluginSource, /EXPO_PUBLIC_PRIVACY_POLICY_URL/);
  assert.match(pluginSource, /removeMainActivityHealthConnectRationaleFilter/);
});

test("Supabase stale refresh token errors are recognized", () => {
  const error = new Error("Invalid Refresh Token: Refresh Token Not Found");
  assert.equal(isMissingRefreshTokenError(error), true);
  assert.equal(websiteIsMissingRefreshTokenError({ message: "refresh_token_not_found" }), true);
  assert.equal(isMissingRefreshTokenError(new Error("Network request failed")), false);
});

test("password validation rejects weak passwords", () => {
  assert.equal(validatePassword("Short1"), "Password must be at least 8 characters.");
  assert.equal(validatePassword("lowercaseonly1"), "Password must include an uppercase letter.");
  assert.equal(validatePassword("Valid123"), null);
  assert.equal(validatePassword("ValidPassword1"), null);
});

test("signup and email confirmation copy gives a clear next step", () => {
  assert.match(SIGNUP_CONFIRMATION_MESSAGE, /check your email/i);
  assert.match(SIGNUP_CONFIRMATION_MESSAGE, /confirm/i);
  assert.equal(AUTH_CALLBACK_CONFIRMED_TITLE, "Congratulations, your email is confirmed!");
  assert.match(AUTH_CALLBACK_CONFIRMED_BODY, /refresh the app/i);
  assert.match(AUTH_CALLBACK_CONFIRMED_BODY, /sign in/i);
  assert.equal(FIRST_LOGIN_WELCOME_TITLE, "Welcome to Lagan!");
  assert.match(FIRST_LOGIN_WELCOME_BODY, /all set/i);
});

test("first-run onboarding is required for new users without habits", () => {
  assert.equal(shouldRequireFirstRunOnboarding({ newUser: "1", habitCount: 0 }), true);
  assert.equal(shouldRequireFirstRunOnboarding({ newUser: "1", habitCount: 2 }), false);
  assert.equal(shouldRequireFirstRunOnboarding({ newUser: undefined, habitCount: 0 }), true);
});

test("first-login welcome is hidden for existing users with habits", () => {
  assert.equal(shouldShowFirstLoginWelcome({ newUser: "1", habitCount: 0 }), true);
  assert.equal(shouldShowFirstLoginWelcome({ newUser: "1", habitCount: 2 }), false);
  assert.equal(shouldShowFirstLoginWelcome({ newUser: undefined, habitCount: 0 }), false);
});

test("i18n translates Hindi copy with interpolation and English fallback", () => {
  assert.equal(translate("hi", "Settings"), "सेटिंग्स");
  assert.equal(translate("hi", "Hey, {name}", { name: "Ravi" }), "नमस्ते, Ravi");
  assert.equal(translate("hi", "{count} habits remaining", { count: 3 }), "3 आदतें बाकी हैं");
  assert.equal(translate("hi", "Untranslated {thing}", { thing: "copy" }), "Untranslated copy");
  assert.equal(translate("en", "Settings"), "Settings");
});

test("i18n exposes stable labels and rejects unsupported language values", () => {
  assert.equal(languageLabel("en"), "English");
  assert.equal(languageLabel("hi"), "हिन्दी");
  assert.equal(isSupportedLanguage("hi"), true);
  assert.equal(isSupportedLanguage("fr"), false);
  assert.equal(isSupportedLanguage(null), false);
});

test("tracking preference copy has Hindi translations", () => {
  const messages = [
    "TRACKING",
    "Step tracking",
    "Auto-sync steps from your device pedometer.",
    "Sleep tracking",
    "Auto-sync sleep from Health Connect or Apple Health.",
    "Sleep tracking is off",
    "Turn on Sleep tracking in Settings to sync from Health Connect or Apple Health.",
    "Auto-sync is paused. Turn it back on in Settings, or keep logging sleep manually below.",
  ];

  for (const message of messages) {
    assert.notEqual(translate("hi", message), message);
  }
});

test("auth callback params can reconstruct a callback URL when native Linking has no URL", () => {
  const url = authCallbackUrlFromParams("/auth/callback", {
    code: "auth-code",
    state: ["first-state", "ignored-state"],
    error: undefined,
  });

  assert.equal(url, "/auth/callback?code=auth-code&state=first-state");
});

test("native Supabase OAuth uses PKCE so Android callbacks carry query params", () => {
  const clientSource = readFileSync("lib/supabase/client.ts", "utf8");
  assert.match(clientSource, /flowType:\s*["']pkce["']/);
});

test("native Google auth config is driven by the public web client id", () => {
  assert.equal(googleNativeAuthReady({ webClientId: "" }), false);
  assert.equal(
    googleNativeAuthUnavailableReason({ webClientId: "" }),
    "Google Sign-In is not configured. Add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.",
  );
  assert.deepEqual(
    googleNativeAuthConfig({ webClientId: "web-client.apps.googleusercontent.com" }),
    {
      webClientId: "web-client.apps.googleusercontent.com",
      offlineAccess: false,
    },
  );
});

test("native Google sign-in handles new and legacy token response shapes", () => {
  assert.equal(getGoogleNativeIdToken({ data: { idToken: "new-token" } }), "new-token");
  assert.equal(getGoogleNativeIdToken({ idToken: "legacy-token" }), "legacy-token");
  assert.equal(getGoogleNativeIdToken({ data: {} }), null);
});

test("native Google sign-in keeps browser OAuth as fallback outside configured Android builds", () => {
  assert.equal(
    googleNativeSignInButtonMode({ platform: "android", webClientId: "web-client" }),
    "native",
  );
  assert.equal(googleNativeSignInButtonMode({ platform: "android", webClientId: "" }), "oauth");
  assert.equal(
    googleNativeSignInButtonMode({ platform: "web", webClientId: "web-client" }),
    "oauth",
  );
  // Expo Go has no @react-native-google-signin native module — must fall back to OAuth.
  assert.equal(
    googleNativeSignInButtonMode({
      platform: "android",
      webClientId: "web-client",
      isExpoGo: true,
    }),
    "oauth",
  );
});

test("native Google sign-in maps cancellation errors to cancelled results", () => {
  assert.equal(isGoogleNativeCancellationError({ code: "SIGN_IN_CANCELLED" }), true);
  assert.equal(isGoogleNativeCancellationError({ code: "cancelled" }), true);
  assert.equal(isGoogleNativeCancellationError(new Error("cancelled")), false);
});

test("Android Google sign-in uses native ID-token auth before browser OAuth fallback", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(packageJson.dependencies["@react-native-google-signin/google-signin"]);

  const actionSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionSource, /@react-native-google-signin\/google-signin/);
  assert.match(actionSource, /googleNativeSignInButtonMode/);
  assert.match(actionSource, /signInWithIdToken\(\{\s*provider:\s*"google"/);
  assert.match(actionSource, /signInWithOAuth/);
});

test("Google web client id is documented for native Android sign-in", () => {
  const envExample = readFileSync(".env.local.example", "utf8");
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
});

test("queued reminder sync cancels the latest stored IDs before the next sync schedules", async () => {
  let stored = {};
  const scheduled = [];
  const cancelled = [];
  let firstScheduleStarted;
  const firstScheduleStartedPromise = new Promise((resolve) => {
    firstScheduleStarted = resolve;
  });
  let releaseFirstSchedule;
  const releaseFirstSchedulePromise = new Promise((resolve) => {
    releaseFirstSchedule = resolve;
  });

  const runSync = createQueuedReminderSync(async () => {
    const currentStored = { ...stored };
    for (const ids of Object.values(currentStored)) {
      for (const id of ids) cancelled.push(id);
    }
    stored = {};

    if (scheduled.length === 0) {
      firstScheduleStarted();
      await releaseFirstSchedulePromise;
    }

    const id = `scheduled-${scheduled.length + 1}`;
    scheduled.push(id);
    stored = { habit1: [id] };
  });

  const first = runSync();
  await firstScheduleStartedPromise;
  const second = runSync();
  releaseFirstSchedule();
  await Promise.all([first, second]);

  assert.deepEqual(scheduled, ["scheduled-1", "scheduled-2"]);
  assert.deepEqual(cancelled, ["scheduled-1"]);
  assert.deepEqual(stored, { habit1: ["scheduled-2"] });
});

test("queued reminder sync coalesces a burst into one trailing sync", async () => {
  let runs = 0;
  let firstRunStarted;
  const firstRunStartedPromise = new Promise((resolve) => {
    firstRunStarted = resolve;
  });
  let releaseFirstRun;
  const releaseFirstRunPromise = new Promise((resolve) => {
    releaseFirstRun = resolve;
  });

  const runSync = createQueuedReminderSync(async () => {
    runs++;
    if (runs === 1) {
      firstRunStarted();
      await releaseFirstRunPromise;
    }
  });

  const first = runSync();
  await firstRunStartedPromise;
  const second = runSync();
  const third = runSync();
  const fourth = runSync();

  releaseFirstRun();
  await Promise.all([first, second, third, fourth]);

  assert.equal(runs, 2);
});

test("readThroughCache returns fresh cached values without refetching", async () => {
  clearCache("test-cache:");
  let calls = 0;
  const first = await readThroughCache("test-cache:fresh", 1_000, async () => {
    calls++;
    return { value: "loaded" };
  });
  const second = await readThroughCache("test-cache:fresh", 1_000, async () => {
    calls++;
    return { value: "new" };
  });

  assert.deepEqual(first, { value: "loaded" });
  assert.deepEqual(second, { value: "loaded" });
  assert.equal(calls, 1);
});

test("readThroughCache refreshes expired entries and supports prefix clearing", async () => {
  clearCache("test-cache:");
  let now = 1_000;
  let calls = 0;

  await readThroughCache(
    "test-cache:expiring",
    100,
    async () => {
      calls++;
      return { value: calls };
    },
    { now: () => now },
  );

  now = 1_200;
  const refreshed = await readThroughCache(
    "test-cache:expiring",
    100,
    async () => {
      calls++;
      return { value: calls };
    },
    { now: () => now },
  );

  assert.deepEqual(refreshed, { value: 2 });
  assert.equal(calls, 2);

  clearCache("test-cache:");
  assert.equal(getCachedValue("test-cache:expiring", 1_000, { now: () => now }), null);
});

test("first-login welcome is scoped to the email that just signed up", () => {
  assert.equal(isPendingSignupForEmail("New.User@Example.com ", "new.user@example.com"), true);
  assert.equal(isPendingSignupForEmail("other@example.com", "new.user@example.com"), false);
  assert.equal(isPendingSignupForEmail(null, "new.user@example.com"), false);
});

test("reminder time validation accepts only HH:MM in 24-hour time", () => {
  assert.equal(isValidReminderTime("08:30"), true);
  assert.equal(isValidReminderTime("23:59"), true);
  assert.equal(isValidReminderTime("24:00"), false);
  assert.equal(isValidReminderTime("7:30"), false);
});

test("positive number parsing rejects invalid habit targets", () => {
  assert.deepEqual(parseOptionalPositiveNumber(""), { ok: true, value: null });
  assert.deepEqual(parseOptionalPositiveNumber("2.5"), { ok: true, value: 2.5 });
  assert.equal(parseOptionalPositiveNumber("0").ok, false);
  assert.equal(parseOptionalPositiveNumber("-1").ok, false);
});

test("habit input rules reject empty long and duplicate names", () => {
  const existing = [
    { id: "h1", name: "Drink Water", archived_at: null },
    { id: "h2", name: "Archived Habit", archived_at: "2026-05-01T00:00:00Z" },
  ];

  assert.deepEqual(normalizeHabitName("  Drink   Water  "), "Drink Water");
  assert.equal(
    validateHabitInput({ name: "   ", metricType: "boolean", target: null, existingHabits: [] })
      .ok,
    false,
  );
  assert.equal(
    validateHabitInput({
      name: "x".repeat(HABIT_NAME_MAX_LENGTH + 1),
      metricType: "boolean",
      target: null,
      existingHabits: [],
    }).ok,
    false,
  );
  assert.equal(
    validateHabitInput({
      name: " drink water ",
      metricType: "boolean",
      target: null,
      existingHabits: existing,
    }).ok,
    false,
  );
  assert.equal(
    validateHabitInput({
      name: "Archived Habit",
      metricType: "boolean",
      target: null,
      existingHabits: existing,
    }).ok,
    true,
  );
});

test("habit input rules require bounded quantitative targets", () => {
  assert.equal(
    validateHabitInput({ name: "Walk", metricType: "steps", target: null, existingHabits: [] }).ok,
    false,
  );
  assert.equal(
    validateHabitInput({ name: "Walk", metricType: "steps", target: 0, existingHabits: [] }).ok,
    false,
  );
  assert.equal(
    validateHabitInput({
      name: "Walk",
      metricType: "steps",
      target: 50001,
      existingHabits: [],
    }).ok,
    false,
  );
  assert.equal(
    validateHabitInput({
      name: "Walk",
      metricType: "steps",
      target: 10000,
      existingHabits: [],
    }).ok,
    true,
  );
  assert.equal(
    validateHabitInput({
      name: "Meditate",
      metricType: "boolean",
      target: null,
      existingHabits: [],
    }).ok,
    true,
  );
});

test("schedule rules reject contradictory reminder settings and normalize values", () => {
  assert.equal(
    normalizeReminderSchedule({
      remindersEnabled: true,
      reminderStrategy: "manual",
      reminderTimes: [],
      reminderDays: [1],
      reminderIntervalMinutes: null,
    }).ok,
    false,
  );
  assert.equal(
    normalizeReminderSchedule({
      remindersEnabled: true,
      reminderStrategy: "interval",
      reminderTimes: [],
      reminderDays: [1],
      reminderIntervalMinutes: 0,
    }).ok,
    false,
  );
  assert.equal(
    normalizeReminderSchedule({
      remindersEnabled: true,
      reminderStrategy: "manual",
      reminderTimes: ["08:30"],
      reminderDays: [],
      reminderIntervalMinutes: null,
    }).ok,
    false,
  );
  assert.equal(
    normalizeReminderSchedule({
      remindersEnabled: true,
      reminderStrategy: "interval",
      reminderTimes: ["08:00"],
      reminderDays: [1],
      reminderIntervalMinutes: -5,
    }).ok,
    false,
  );

  const normalized = normalizeReminderSchedule({
    remindersEnabled: true,
    reminderStrategy: "manual",
    reminderTimes: ["08:30", "08:30", "20:00"],
    reminderDays: [5, 1, 1],
    reminderIntervalMinutes: null,
  });
  assert.deepEqual(normalized, {
    ok: true,
    data: {
      remindersEnabled: true,
      reminderTimes: ["08:30", "20:00"],
      reminderDays: [1, 5],
      reminderIntervalMinutes: null,
    },
  });
});

test("log value rules reject non-positive and unreasonable values", () => {
  assert.deepEqual(validateLogValueForHabit(5, { metricType: "minutes", target: 30 }), {
    ok: true,
    value: 5,
  });
  assert.equal(validateLogValueForHabit(0, { metricType: "minutes", target: 30 }).ok, false);
  assert.equal(validateLogValueForHabit(-1, { metricType: "minutes", target: 30 }).ok, false);
  assert.equal(validateLogValueForHabit(31, { metricType: "minutes", target: 30 }).ok, false);
  assert.equal(validateLogValueForHabit(2500, { metricType: "volume_ml", target: 2000 }).ok, true);
  assert.deepEqual(validateLogValueForHabit(0.5, { metricType: "distance_km", target: 5 }), {
    ok: true,
    value: 0.5,
  });
  assert.deepEqual(validateLogValueForHabit(1.5, { metricType: "hours", target: 8 }), {
    ok: true,
    value: 1.5,
  });
  assert.equal(validateLogValueForHabit(0.5, { metricType: "steps", target: 10000 }).ok, false);
});

test("habit form validation errors are accessible beyond color", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /alert-circle-outline/);
  assert.match(source, /Error: \{message\}/);
});

test("habit form and actions use shared habit input rules", () => {
  const formSource = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(formSource, /validateHabitInput/);
  assert.match(formSource, /normalizeReminderSchedule/);

  const actionsSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionsSource, /validateHabitInput/);
  assert.match(actionsSource, /normalizeReminderSchedule/);
  assert.match(actionsSource, /"A habit with this name already exists\."/);
});

test("feedback validation requires useful message and valid rating", () => {
  assert.equal(validateFeedback({ rating: 5, message: "Great, but reminders need snooze." }), null);
  assert.equal(
    validateFeedback({ rating: 5, message: "too short" })?.includes("10 characters"),
    true,
  );
  assert.equal(
    validateFeedback({ rating: 6, message: "This message is long enough." })?.includes("rating"),
    true,
  );
});

test("streakFromDates returns 0 for empty input", () => {
  assert.equal(streakFromDates([]), 0);
});

test("streakFromDates counts consecutive days ending today", () => {
  const today = new Date(2026, 4, 10);
  const dates = [localDateKey(today), localDateDaysAgo(1, today), localDateDaysAgo(2, today)];
  assert.equal(streakFromDates(dates, today), 3);
});

test("streakFromDates breaks on a missing day", () => {
  const today = new Date(2026, 4, 10);
  const dates = [localDateKey(today), localDateDaysAgo(2, today), localDateDaysAgo(3, today)];
  assert.equal(streakFromDates(dates, today), 1);
});

test("streakFromDates is 0 when latest completion is older than today", () => {
  const today = new Date(2026, 4, 10);
  const dates = [localDateDaysAgo(1, today), localDateDaysAgo(2, today)];
  assert.equal(streakFromDates(dates, today), 0);
});

test("streakFromDates ignores duplicate days", () => {
  const today = new Date(2026, 4, 10);
  const key = localDateKey(today);
  assert.equal(streakFromDates([key, key, localDateDaysAgo(1, today)], today), 2);
});

test("habit intelligence assigns habit-specific metrics", () => {
  assert.deepEqual(
    inferHabitIntelligence({ name: "Drink Water", unit: "ml", target: 2000 }).metricType,
    "volume_ml",
  );
  const walk = inferHabitIntelligence({ name: "Walk", unit: "km", target: 3 });
  assert.equal(walk.metricType, "steps");
  assert.equal(walk.unit, "steps");
  assert.equal(walk.target, 8000);
  const timedReading = inferHabitIntelligence({ name: "Read for 30 minutes" });
  assert.equal(timedReading.metricType, "minutes");
  assert.equal(timedReading.target, 30);
});

test("habit intelligence recognizes cold shower custom names", () => {
  const coldShower = inferHabitIntelligence({ name: "Cold Shower", icon: "shower" });
  assert.equal(coldShower.habitType, "cold_shower");
  assert.equal(coldShower.metricType, "minutes");
});

test("cold shower habits resolve the curated image even for legacy custom rows", () => {
  const image = getHabitImageForHabit({
    name: "Cold Shower",
    icon: "shower",
    unit: "min",
    habit_type: "custom",
  });
  assert.notEqual(image, getHabitImageForHabit({ name: "Custom habit", icon: "star", unit: "" }));
});

test("habit intelligence normalizes water litre goals to ml", () => {
  const water = inferHabitIntelligence({ name: "Drink 1 litre water daily" });
  assert.equal(water.habitType, "water_intake");
  assert.equal(water.unit, "ml");
  assert.equal(water.target, 1000);
});

test("habit intelligence converts selected display units into base storage units", () => {
  const water = inferHabitIntelligence({
    name: "Drink water",
    unit: "l",
    target: 2,
    habitType: "water_intake",
    metricType: "volume_ml",
  });
  assert.equal(water.unit, "ml");
  assert.equal(water.target, 2000);
  const run = inferHabitIntelligence({
    name: "Run",
    unit: "m",
    target: 500,
    habitType: "run",
    metricType: "distance_km",
  });
  assert.equal(run.unit, "km");
  assert.equal(run.target, 0.5);
});

test("progressForHabit supports partial and completed target habits", () => {
  const habit = {
    id: "h1",
    user_id: "u1",
    name: "Drink Water",
    description: null,
    icon: "water_drop",
    color: "secondary",
    target: 2000,
    unit: "ml",
    reminder_time: null,
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    reminders_enabled: true,
    habit_type: "water_intake",
    metric_type: "volume_ml",
    visual_type: "water_bottle",
    reminder_strategy: "interval",
    reminder_interval_minutes: 120,
    default_log_value: 250,
    created_at: "2026-05-10T00:00:00Z",
    archived_at: null,
  };
  assert.equal(progressForHabit(habit, null).isDone, false);
  assert.equal(progressForHabit(habit, { value: 750 }).label, "750 / 2000 ml");
  assert.equal(progressForHabit(habit, { value: 2000 }).isDone, true);
});

test("completion value payload stores absolute values", () => {
  assert.deepEqual(
    buildCompletionValuePayload("habit-1", "user-1", "2026-05-14", 1234.9, " synced "),
    {
      habit_id: "habit-1",
      user_id: "user-1",
      completed_on: "2026-05-14",
      value: 1234,
      note: "synced",
    },
  );
});

test("setCompletionValue preserves decimal-capable completion values", async () => {
  assert.deepEqual(
    buildCompletionValuePayload("sleep-1", "user-1", "2026-05-14", 1.5, " nap ", {
      metricType: "hours",
      target: 8,
    }),
    {
      habit_id: "sleep-1",
      user_id: "user-1",
      completed_on: "2026-05-14",
      value: 1.5,
      note: "nap",
    },
  );

  const originalUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const originalAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const hadDev = Object.prototype.hasOwnProperty.call(globalThis, "__DEV__");
  const originalDev = globalThis.__DEV__;
  const OriginalDate = globalThis.Date;
  const originalSetTimeout = globalThis.setTimeout;
  const fixedNow = new OriginalDate(2026, 4, 14, 12, 0);
  let capturedPayload = null;

  process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  globalThis.__DEV__ = false;
  globalThis.Date = class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedNow.getTime()] : args));
    }

    static now() {
      return fixedNow.getTime();
    }
  };
  globalThis.setTimeout = () => 0;

  await registerActionImportTestLoader();
  const { supabase } = await import("../lib/supabase/client.ts");
  const originalGetUser = supabase.auth.getUser;
  const originalFrom = supabase.from;

  try {
    supabase.auth.getUser = async () => ({
      data: { user: { id: "user-1", email: "u@example.com", user_metadata: {} } },
      error: null,
    });
    supabase.from = (table) => {
      if (table === "habits") {
        const filters = [];
        return {
          select(columns) {
            assert.equal(columns, "target, metric_type");
            return this;
          },
          eq(column, value) {
            filters.push([column, value]);
            return this;
          },
          async single() {
            assert.deepEqual(filters, [
              ["id", "sleep-1"],
              ["user_id", "user-1"],
            ]);
            return { data: { target: 8, metric_type: "hours" }, error: null };
          },
        };
      }
      if (table === "habit_completions") {
        return {
          upsert(payload, options) {
            capturedPayload = payload;
            assert.deepEqual(options, { onConflict: "habit_id,completed_on" });
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    };

    const { setCompletionValue } = await import("../lib/data/actions.ts");
    assert.deepEqual(await setCompletionValue("sleep-1", 1.5, " nap ", "2026-05-14"), {
      ok: true,
    });
    assert.deepEqual(capturedPayload, {
      habit_id: "sleep-1",
      user_id: "user-1",
      completed_on: "2026-05-14",
      value: 1.5,
      note: "nap",
    });
  } finally {
    supabase.auth.getUser = originalGetUser;
    supabase.from = originalFrom;
    globalThis.Date = OriginalDate;
    globalThis.setTimeout = originalSetTimeout;
    if (hadDev) globalThis.__DEV__ = originalDev;
    else delete globalThis.__DEV__;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    else process.env.EXPO_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalAnonKey === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  }
});

test("health connect step range starts at local midnight", () => {
  const range = healthConnectTodayRange(new Date(2026, 4, 14, 15, 45, 12));
  const start = new Date(range.startTime);
  const end = new Date(range.endTime);
  assert.equal(range.operator, "between");
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 4);
  assert.equal(start.getDate(), 14);
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.equal(end.getHours(), 15);
  assert.equal(end.getMinutes(), 45);
});

test("health connect step aggregate normalization returns integer totals", () => {
  assert.equal(normalizeStepCount(1234.9), 1234);
  assert.equal(normalizeStepCount(-20), 0);
  assert.equal(normalizeHealthConnectStepAggregate({ COUNT_TOTAL: 6789.8, dataOrigins: [] }), 6789);
  assert.equal(normalizeHealthConnectStepAggregate({ dataOrigins: [] }), 0);
  assert.equal(normalizeHealthConnectStepAggregate(null), null);
});

test("sleep date is assigned from wake time and windows span 18:00 to 18:00", () => {
  assert.equal(sleepDateForWakeTime(new Date(2026, 4, 14, 7, 30)), "2026-05-14");
  assert.equal(sleepDateForWakeTime(new Date(2026, 4, 14, 17, 59)), "2026-05-14");
  assert.equal(sleepDateForWakeTime(new Date(2026, 4, 14, 18, 0)), "2026-05-15");

  const window = sleepWindowForDate("2026-05-14");
  const start = new Date(window.startTime);
  const end = new Date(window.endTime);
  assert.equal(start.getFullYear(), 2026);
  assert.equal(start.getMonth(), 4);
  assert.equal(start.getDate(), 13);
  assert.equal(start.getHours(), 18);
  assert.equal(end.getDate(), 14);
  assert.equal(end.getHours(), 18);
});

test("sleep sync builds recent nightly windows newest first", () => {
  const windows = sleepLookbackWindows(3, new Date(2026, 4, 14, 7, 30));
  assert.deepEqual(
    windows.map((window) => window.sleepDate),
    ["2026-05-14", "2026-05-13", "2026-05-12"],
  );
  assert.equal(new Date(windows[2].startTime).getDate(), 11);
  assert.equal(new Date(windows[2].endTime).getDate(), 12);
});

test("sleep no-data copy explains the provider and checked range", () => {
  const windows = sleepLookbackWindows(2, new Date(2026, 4, 14, 7, 30));
  const message = sleepNoDataMessage("Health Connect", windows);
  assert.match(message, /No sleep data was found in Health Connect/i);
  assert.match(message, /2026-05-13 through 2026-05-14/i);
  assert.match(message, /sleep app or wearable/i);
});

test("health connect sleep sessions normalize duration and stages", () => {
  const normalized = normalizeHealthConnectSleepSessions([
    {
      startTime: "2026-05-13T22:30:00.000Z",
      endTime: "2026-05-14T06:30:00.000Z",
      stages: [
        { startTime: "2026-05-13T22:30:00.000Z", endTime: "2026-05-14T00:00:00.000Z", stage: 4 },
        { startTime: "2026-05-14T00:00:00.000Z", endTime: "2026-05-14T02:00:00.000Z", stage: 5 },
        { startTime: "2026-05-14T02:00:00.000Z", endTime: "2026-05-14T06:30:00.000Z", stage: 1 },
      ],
    },
  ]);

  assert.equal(normalized?.sleepDate, "2026-05-14");
  assert.equal(normalized?.durationMinutes, 480);
  assert.equal(normalized?.stageMinutes?.deep, 90);
  assert.equal(normalized?.stageMinutes?.rem, 120);
  assert.equal(normalized?.stageMinutes?.asleep, 270);
});

test("healthkit sleep samples count asleep categories and ignore in-bed/awake", () => {
  const normalized = normalizeHealthKitSleepSamples([
    { startDate: "2026-05-13T21:45:00.000Z", endDate: "2026-05-13T22:30:00.000Z", value: 0 },
    { startDate: "2026-05-13T22:30:00.000Z", endDate: "2026-05-14T01:30:00.000Z", value: 3 },
    { startDate: "2026-05-14T01:30:00.000Z", endDate: "2026-05-14T02:00:00.000Z", value: 2 },
    { startDate: "2026-05-14T02:00:00.000Z", endDate: "2026-05-14T06:00:00.000Z", value: 5 },
  ]);

  assert.equal(normalized?.sleepDate, "2026-05-14");
  assert.equal(normalized?.durationMinutes, 420);
  assert.equal(normalized?.stageMinutes?.core, 180);
  assert.equal(normalized?.stageMinutes?.rem, 240);
  assert.equal(normalized?.stageMinutes?.awake, 30);
});

test("sleep score is duration-first with neutral consistency and stage points", () => {
  assert.equal(
    computeSleepScore({ durationMinutes: 480, targetMinutes: 480, recentEntries: [] }),
    100,
  );
  assert.equal(
    computeSleepScore({ durationMinutes: 240, targetMinutes: 480, recentEntries: [] }),
    58,
  );
  assert.equal(
    computeSleepScore({
      durationMinutes: 480,
      targetMinutes: 480,
      startMinutes: 23 * 60,
      endMinutes: 7 * 60,
      recentEntries: [
        { startMinutes: 22 * 60 + 45, endMinutes: 6 * 60 + 45 },
        { startMinutes: 23 * 60, endMinutes: 7 * 60 },
        { startMinutes: 23 * 60 + 15, endMinutes: 7 * 60 + 10 },
      ],
      stageMinutes: { deep: 0, rem: 0, core: 0, asleep: 480, awake: 0 },
    }),
    95,
  );
});

test("sleep completion value stores hours from synced minutes", () => {
  assert.equal(buildSleepCompletionValue(465), 7.8);
  assert.equal(buildSleepCompletionValue(-20), 0);
});

test("sleep storage setup errors are recognized", () => {
  assert.equal(
    isSleepEntriesSetupError("Could not find the table 'public.sleep_entries' in the schema cache"),
    true,
  );
  assert.equal(isSleepEntriesSetupError('relation "public.sleep_entries" does not exist'), true);
  assert.equal(isSleepEntriesSetupError("permission denied for table sleep_entries"), true);
  assert.equal(isSleepEntriesSetupError("Network request failed"), false);
});

test("sleep entries migration exposes the table to authenticated clients", () => {
  const sql = [
    readFileSync("supabase/migrations/0010_sleep_tracking.sql", "utf8"),
    readFileSync("supabase/schema.sql", "utf8"),
  ].join("\n");
  assert.match(
    sql,
    /grant select,\s*insert,\s*update,\s*delete on table public\.sleep_entries to authenticated/i,
  );
  assert.match(sql, /alter table public\.sleep_entries enable row level security/i);
});

test("duplicate scoring and merging combine compatible water habits", () => {
  const existing = {
    id: "h1",
    user_id: "u1",
    name: "Drink 1 litre water daily",
    description: null,
    icon: "water_drop",
    color: "secondary",
    target: 1000,
    unit: "ml",
    reminder_time: null,
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    reminders_enabled: true,
    habit_type: "water_intake",
    metric_type: "volume_ml",
    visual_type: "water_bottle",
    reminder_strategy: "interval",
    reminder_interval_minutes: 120,
    default_log_value: 250,
    created_at: "2026-05-10T00:00:00Z",
    archived_at: null,
  };
  const candidate = { name: "Drink more water", icon: "water_drop", unit: "ml", target: 2000 };
  assert.ok(scoreHabitSimilarity(candidate, existing) >= 0.8);
  const merged = mergeHabitSettings(candidate, existing);
  assert.equal(merged.target, 2000);
  assert.equal(merged.metric_type, "volume_ml");
});

test("bundling keeps the stronger workout habit identity and target", () => {
  const existing = {
    id: "workout-15",
    user_id: "u1",
    name: "15 min workout",
    description: "Short starter workout.",
    icon: "fitness_center",
    color: "tertiary",
    target: 15,
    unit: "min",
    reminder_time: null,
    reminder_times: ["07:00"],
    reminder_days: [1, 2],
    reminders_enabled: true,
    habit_type: "workout",
    metric_type: "minutes",
    visual_type: "progress_ring",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: 5,
    created_at: "2026-05-10T00:00:00Z",
    archived_at: null,
  };
  const candidate = {
    name: "45 min workout",
    description: "Longer strength session.",
    icon: "fitness_center",
    unit: "min",
    target: 45,
    habitType: "workout",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 15,
  };

  assert.ok(scoreHabitSimilarity(candidate, existing) >= 0.8);
  const merged = mergeHabitSettings(candidate, existing);
  assert.equal(merged.name, "45 min workout");
  assert.equal(merged.description, "Longer strength session.");
  assert.equal(merged.target, 45);
  assert.equal(merged.default_log_value, 15);
});

test("bundling keeps the existing habit identity when it has the stronger target", () => {
  const existing = {
    id: "read-30",
    user_id: "u1",
    name: "Read 30 pages",
    description: "Evening reading.",
    icon: "menu_book",
    color: "primary",
    target: 30,
    unit: "pages",
    reminder_time: null,
    reminder_times: ["21:00"],
    reminder_days: [1, 2, 3],
    reminders_enabled: true,
    habit_type: "read",
    metric_type: "pages",
    visual_type: "reading_book",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: 10,
    created_at: "2026-05-10T00:00:00Z",
    archived_at: null,
  };
  const candidate = {
    name: "Read 10 pages",
    description: "Short reading habit.",
    icon: "menu_book",
    unit: "pages",
    target: 10,
    habitType: "read",
    metricType: "pages",
    visualType: "reading_book",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 5,
  };

  const merged = mergeHabitSettings(candidate, existing);
  assert.equal(merged.name, "Read 30 pages");
  assert.equal(merged.description, "Evening reading.");
  assert.equal(merged.target, 30);
  assert.equal(merged.default_log_value, 10);
});

test("bundling unions active reminder times and days without copying disabled defaults", () => {
  assert.deepEqual(
    mergeHabitReminders(
      { enabled: true, times: ["07:00"], days: [1, 2] },
      { enabled: true, times: ["07:00", "18:00"], days: [1, 2, 3] },
    ),
    { enabled: true, times: ["07:00", "18:00"], days: [1, 2, 3] },
  );

  assert.deepEqual(
    mergeHabitReminders(
      { enabled: false, times: [], days: [0, 1, 2, 3, 4, 5, 6] },
      { enabled: true, times: ["08:30"], days: [1, 3, 5] },
    ),
    { enabled: true, times: ["08:30"], days: [1, 3, 5] },
  );
});

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => {
      values.set(key, value);
    },
    removeItem: async (key) => {
      values.delete(key);
    },
  };
}

function smartReminderTestContext(overrides = {}) {
  const now = overrides.now ?? new Date(2026, 4, 10, 9, 15);
  return {
    habitId: "water-1",
    habitName: "Drink water",
    habitType: "water_intake",
    metricType: "volume_ml",
    strategy: "interval",
    intervalMinutes: 120,
    target: 2000,
    unit: "ml",
    progress: { current: 250, target: 2000, ratio: 0.125, isDone: false, label: "250 / 2000 ml" },
    completions: [],
    manualTimes: [],
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
    streak: 1,
    typicalHour: null,
    now,
    ...overrides,
  };
}

test("smart reminder slots respect active hours and intervals", () => {
  const slots = smartReminderTimesForDay(new Date(2026, 4, 10, 7, 30), 120);
  assert.deepEqual(
    slots.map((slot) => slot.getHours()),
    [8, 10, 12, 14, 16, 18, 20, 22],
  );
  const midday = smartReminderTimesForDay(new Date(2026, 4, 10, 12, 30), 60);
  assert.equal(midday[0].getHours(), 13);
});

test("learned smart reminders prefer the user's recent successful hour", () => {
  const slots = learnedSmartReminderTimesForDay({
    habitId: "workout-1",
    habitName: "Workout",
    habitType: "workout",
    metricType: "minutes",
    strategy: "conditional_interval",
    intervalMinutes: 480,
    target: 45,
    unit: "min",
    progress: { current: 0, target: 45, ratio: 0, isDone: false, label: "0 / 45 min" },
    completions: [
      { completedOn: "2026-05-07", createdAt: "2026-05-07T18:10:00", value: 45 },
      { completedOn: "2026-05-08", createdAt: "2026-05-08T18:20:00", value: 45 },
      { completedOn: "2026-05-09", createdAt: "2026-05-09T18:00:00", value: 45 },
    ],
    manualTimes: [],
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
    streak: 3,
    typicalHour: 18,
    now: new Date(2026, 4, 10, 9, 0),
  });

  assert.deepEqual(
    slots.map((slot) => slot.getHours()),
    [17, 18],
  );
});

test("strict smart reminder AI times reject past, invalid, and crowded slots", () => {
  const now = new Date(2026, 4, 10, 9, 15);
  assert.equal(sanitizeSmartReminderPlanTimes(["09:00"], now, { maxCount: 3 }), null);
  assert.equal(sanitizeSmartReminderPlanTimes(["10:00", "10:30"], now, { maxCount: 3 }), null);
  assert.equal(sanitizeSmartReminderPlanTimes(["25:00"], now, { maxCount: 3 }), null);

  const valid = sanitizeSmartReminderPlanTimes(["10:00", "13:00"], now, { maxCount: 3 });
  assert.deepEqual(
    valid?.map((slot) => slot.getHours()),
    [10, 13],
  );
});

test("AI smart reminder plans keep valid habit plans and drop invalid ones", async () => {
  const baseContext = {
    habitName: "Drink water",
    habitType: "water_intake",
    metricType: "volume_ml",
    strategy: "interval",
    intervalMinutes: 120,
    target: 2000,
    unit: "ml",
    progress: { current: 250, target: 2000, ratio: 0.125, isDone: false, label: "250 / 2000 ml" },
    completions: [],
    manualTimes: [],
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
    streak: 1,
    typicalHour: null,
    now: new Date(2026, 4, 10, 9, 15),
  };

  const plans = await resolveAiSmartReminderPlans(
    [
      { ...baseContext, habitId: "valid-habit" },
      { ...baseContext, habitId: "invalid-habit" },
    ],
    {
      enabled: true,
      now: new Date(2026, 4, 10, 9, 15),
      invoke: async () => ({
        plans: [
          { habitId: "valid-habit", times: ["10:00", "14:00"] },
          { habitId: "invalid-habit", times: ["08:00"] },
        ],
        generated: true,
      }),
    },
  );

  assert.deepEqual(
    plans.get("valid-habit")?.map((slot) => slot.getHours()),
    [10, 14],
  );
  assert.equal(plans.has("invalid-habit"), false);
});

test("AI smart reminder plans reuse cached responses for matching contexts", async () => {
  const now = new Date(2026, 4, 10, 9, 15);
  const context = smartReminderTestContext({ now });
  const storage = createMemoryStorage();
  let calls = 0;

  const options = {
    enabled: true,
    now,
    storage,
    invoke: async () => {
      calls++;
      return { plans: [{ habitId: context.habitId, times: ["10:00", "14:00"] }] };
    },
  };

  const first = await resolveAiSmartReminderPlans([context], options);
  const second = await resolveAiSmartReminderPlans([context], options);

  assert.deepEqual(
    first.get(context.habitId)?.map((slot) => slot.getHours()),
    [10, 14],
  );
  assert.deepEqual(
    second.get(context.habitId)?.map((slot) => slot.getHours()),
    [10, 14],
  );
  assert.equal(calls, 1);
});

test("AI smart reminder plans share an in-flight invocation", async () => {
  const now = new Date(2026, 4, 10, 9, 15);
  const context = smartReminderTestContext({ now });
  const storage = createMemoryStorage();
  let calls = 0;
  let releaseInvoke;
  const releaseInvokePromise = new Promise((resolve) => {
    releaseInvoke = resolve;
  });

  const invoke = async () => {
    calls++;
    await releaseInvokePromise;
    return { plans: [{ habitId: context.habitId, times: ["10:00"] }] };
  };

  const first = resolveAiSmartReminderPlans([context], { enabled: true, now, storage, invoke });
  const second = resolveAiSmartReminderPlans([context], { enabled: true, now, storage, invoke });
  releaseInvoke();
  const [firstPlans, secondPlans] = await Promise.all([first, second]);

  assert.equal(calls, 1);
  assert.equal(firstPlans.get(context.habitId)?.[0].getHours(), 10);
  assert.equal(secondPlans.get(context.habitId)?.[0].getHours(), 10);
});

test("AI smart reminder plans cool down after a 429", async () => {
  const now = new Date(2026, 4, 10, 9, 15);
  const context = smartReminderTestContext({ now });
  const storage = createMemoryStorage();
  let calls = 0;
  const rateLimitError = new Error("quota exceeded");
  rateLimitError.name = "FunctionsHttpError";
  rateLimitError.context = {
    status: 429,
    headers: { get: () => null },
  };

  const invoke = async () => {
    calls++;
    throw rateLimitError;
  };

  const first = await resolveAiSmartReminderPlans([context], {
    enabled: true,
    now,
    storage,
    cooldownMs: 60 * 60 * 1000,
    invoke,
  });
  const second = await resolveAiSmartReminderPlans([context], {
    enabled: true,
    now: new Date(now.getTime() + 60_000),
    storage,
    cooldownMs: 60 * 60 * 1000,
    invoke,
  });

  assert.equal(first.size, 0);
  assert.equal(second.size, 0);
  assert.equal(calls, 1);
});

test("AI smart reminder 429 cooldown honors retryAfterSeconds when available", async () => {
  const now = new Date(2026, 4, 10, 9, 15);
  const context = smartReminderTestContext({ now });
  const storage = createMemoryStorage();
  let calls = 0;
  const rateLimitError = new Error("quota exceeded");
  rateLimitError.name = "FunctionsHttpError";
  rateLimitError.context = {
    status: 429,
    headers: { get: () => null },
    clone: () => ({
      json: async () => ({ retryAfterSeconds: 120 }),
    }),
  };

  const invoke = async () => {
    calls++;
    if (calls === 1) throw rateLimitError;
    return { plans: [{ habitId: context.habitId, times: ["11:00"] }] };
  };

  const first = await resolveAiSmartReminderPlans([context], {
    enabled: true,
    now,
    storage,
    invoke,
  });
  const second = await resolveAiSmartReminderPlans(
    [smartReminderTestContext({ now: new Date(now.getTime() + 180_000) })],
    {
      enabled: true,
      now: new Date(now.getTime() + 180_000),
      storage,
      invoke,
    },
  );

  assert.equal(first.size, 0);
  assert.equal(second.get(context.habitId)?.[0].getHours(), 11);
  assert.equal(calls, 2);
});

test("AI smart reminder plans ignore stale cached times and fall back locally", async () => {
  const firstNow = new Date(2026, 4, 10, 9, 15);
  const secondNow = new Date(2026, 4, 10, 10, 30);
  const firstContext = smartReminderTestContext({ now: firstNow });
  const secondContext = smartReminderTestContext({ now: secondNow });
  const storage = createMemoryStorage();
  let calls = 0;

  const first = await resolveAiSmartReminderPlans([firstContext], {
    enabled: true,
    now: firstNow,
    storage,
    invoke: async () => {
      calls++;
      return { plans: [{ habitId: firstContext.habitId, times: ["10:00"] }] };
    },
  });
  const second = await resolveAiSmartReminderPlans([secondContext], {
    enabled: true,
    now: secondNow,
    storage,
    invoke: async () => {
      calls++;
      throw new Error("offline");
    },
  });

  assert.equal(first.get(firstContext.habitId)?.[0].getHours(), 10);
  assert.equal(second.size, 0);
  assert.equal(calls, 2);
});

test("reminders screen previews skip AI smart reminder invocation", () => {
  const source = readFileSync("app/(tabs)/settings/reminders.tsx", "utf8");
  assert.match(source, /getReminderSchedule\(\{\s*aiSmartReminders:\s*false\s*\}\)/);
});

test("routine builder gives office workers water posture walking and sleep habits", () => {
  const routine = buildRoutineRecommendations({
    goals: ["energy", "health"],
    lifestyle: "office",
    sleep: "poor",
    workload: "high",
    stress: "medium",
    fitnessLevel: "beginner",
  });
  const names = routine.map((habit) => habit.name.toLowerCase());
  assert.ok(names.some((name) => name.includes("water")));
  assert.ok(names.some((name) => name.includes("posture") || name.includes("stretch")));
  assert.ok(names.some((name) => name.includes("walk")));
  assert.ok(names.some((name) => name.includes("sleep")));
  assert.ok(routine.length <= 5);
});

test("routine builder gives students focus revision reading and screen limit habits", () => {
  const routine = buildRoutineRecommendations({
    goals: ["focus", "learning"],
    lifestyle: "student",
    sleep: "okay",
    workload: "high",
    stress: "high",
    fitnessLevel: "beginner",
  });
  const names = routine.map((habit) => habit.name.toLowerCase());
  assert.ok(names.some((name) => name.includes("focus")));
  assert.ok(names.some((name) => name.includes("revision") || name.includes("study")));
  assert.ok(names.some((name) => name.includes("read")));
  assert.ok(names.some((name) => name.includes("screen")));
  assert.ok(routine.length <= 5);
});

test("routine builder keeps beginner fitness targets gentle", () => {
  const routine = buildRoutineRecommendations({
    goals: ["fitness"],
    lifestyle: "active",
    sleep: "good",
    workload: "normal",
    stress: "low",
    fitnessLevel: "beginner",
  });
  const workout = routine.find((habit) => habit.habitType === "workout");
  const walk = routine.find((habit) => habit.habitType === "walk");
  assert.ok(!workout || (workout.target ?? 0) <= 20);
  assert.ok(!walk || (walk.target ?? 0) <= 6000);
});

test("AI routine sanitizer rejects invalid names enums and oversized routines", () => {
  const fallback = buildRoutineRecommendations({
    goals: ["focus"],
    lifestyle: "student",
    sleep: "okay",
    workload: "normal",
    stress: "medium",
    fitnessLevel: "beginner",
  });
  assert.equal(sanitizeHabitRecommendations([{ ...fallback[0], name: "" }], fallback), fallback);
  assert.equal(
    sanitizeHabitRecommendations([{ ...fallback[0], color: "rainbow" }], fallback),
    fallback,
  );
  assert.equal(sanitizeHabitRecommendations([...fallback, ...fallback], fallback), fallback);
});

const coachHabit = {
  id: "coach-water",
  user_id: "u1",
  name: "Drink Water",
  description: null,
  icon: "water_drop",
  color: "secondary",
  target: 2000,
  unit: "ml",
  reminder_time: null,
  reminder_times: [],
  reminder_days: [0, 1, 2, 3, 4, 5, 6],
  reminders_enabled: true,
  habit_type: "water_intake",
  metric_type: "volume_ml",
  visual_type: "water_bottle",
  reminder_strategy: "interval",
  reminder_interval_minutes: 120,
  default_log_value: 250,
  created_at: "2026-05-01T00:00:00Z",
  archived_at: null,
};

test("coach detects target habits falling behind by time of day", () => {
  const signals = buildCoachSignals({
    habits: [coachHabit],
    completions: [
      {
        habit_id: coachHabit.id,
        completed_on: "2026-05-14",
        created_at: "2026-05-14T09:00:00",
        value: 600,
      },
    ],
    now: new Date(2026, 4, 14, 16, 0),
    tone: "friendly",
  });
  const signal = signals.find((item) => item.kind === "behind_progress");
  assert.equal(signal?.habitId, coachHabit.id);
  assert.equal(signal?.suggestedAction, "log_value");
  assert.equal(signal?.suggestedValue, 500);
  assert.match(signal?.message ?? "", /only completed 30%/i);
});

test("coach detects same-weekday late skip windows and suggests an easier version", () => {
  const workout = {
    ...coachHabit,
    id: "coach-workout",
    name: "Workout",
    target: 45,
    unit: "min",
    habit_type: "workout",
    metric_type: "minutes",
    default_log_value: 15,
  };
  const signals = buildCoachSignals({
    habits: [workout],
    completions: [
      {
        habit_id: workout.id,
        completed_on: "2026-05-12",
        created_at: "2026-05-12T18:30:00",
        value: 45,
      },
      {
        habit_id: workout.id,
        completed_on: "2026-05-11",
        created_at: "2026-05-11T18:30:00",
        value: 45,
      },
      {
        habit_id: workout.id,
        completed_on: "2026-05-06",
        created_at: "2026-05-06T18:30:00",
        value: 45,
      },
      {
        habit_id: workout.id,
        completed_on: "2026-04-29",
        created_at: "2026-04-29T18:30:00",
        value: 45,
      },
    ],
    now: new Date(2026, 4, 13, 20, 30),
    tone: "motivational",
  });
  const signal = signals.find((item) => item.kind === "usual_skip_window");
  assert.equal(signal?.suggestedValue, 15);
  assert.match(signal?.message ?? "", /15-minute version/i);
});

test("coach softens strict tones when burnout is detected", () => {
  const signals = buildCoachSignals({
    habits: [coachHabit],
    completions: [
      {
        habit_id: coachHabit.id,
        completed_on: "2026-05-05",
        created_at: "2026-05-05T09:00:00",
        value: 2000,
      },
      {
        habit_id: coachHabit.id,
        completed_on: "2026-05-06",
        created_at: "2026-05-06T09:00:00",
        value: 2000,
      },
      {
        habit_id: coachHabit.id,
        completed_on: "2026-05-07",
        created_at: "2026-05-07T09:00:00",
        value: 2000,
      },
      {
        habit_id: coachHabit.id,
        completed_on: "2026-05-08",
        created_at: "2026-05-08T09:00:00",
        value: 2000,
      },
    ],
    now: new Date(2026, 4, 14, 18, 0),
    tone: "military",
  });
  const signal = chooseTopCoachSignal(signals);
  assert.equal(signal?.kind, "burnout");
  assert.equal(signal?.tone, "calm");
  assert.match(signal?.message ?? "", /smaller/i);
});

test("coach tone formatter supports every configured tone", () => {
  const base = {
    kind: "encouragement",
    priority: 10,
    habitId: "habit-1",
    habitName: "Read",
    suggestedAction: "open_habit",
    message: "",
  };
  assert.match(formatCoachMessage({ ...base, tone: "friendly" }), /You/i);
  assert.match(formatCoachMessage({ ...base, tone: "motivational" }), /momentum/i);
  assert.match(formatCoachMessage({ ...base, tone: "calm" }), /small/i);
  assert.match(formatCoachMessage({ ...base, tone: "strict" }), /Commit/i);
  assert.match(formatCoachMessage({ ...base, tone: "military" }), /Mission/i);
});

test("AI coach message falls back when disabled or generation fails", async () => {
  const signal = {
    kind: "encouragement",
    priority: 10,
    habitId: "habit-1",
    habitName: "Read",
    tone: "friendly",
    suggestedAction: "open_habit",
    message: "Read one page now.",
  };
  let calls = 0;
  const disabled = await resolveCoachMessage(signal, {
    enabled: false,
    invoke: async () => {
      calls++;
      return "Generated";
    },
  });
  assert.equal(disabled, signal.message);
  assert.equal(calls, 0);

  const failed = await resolveCoachMessage(signal, {
    enabled: true,
    invoke: async () => {
      calls++;
      throw new Error("offline");
    },
  });
  assert.equal(failed, signal.message);
  assert.equal(calls, 1);
});

test("AI coach message uses cache before invoking generation", async () => {
  const signal = {
    kind: "behind_progress",
    priority: 70,
    habitId: "habit-1",
    habitName: "Water",
    tone: "friendly",
    suggestedAction: "log_value",
    suggestedValue: 500,
    message: "Drink 500 ml now.",
  };
  const cachedAt = new Date(2026, 4, 14, 12, 0).getTime();
  const cache = new Map([
    [
      "habbit:coach-message:behind_progress:habit-1:friendly:500",
      JSON.stringify({ message: "Cached coach line.", cachedAt }),
    ],
  ]);
  const storage = {
    getItem: async (key) => cache.get(key) ?? null,
    setItem: async (key, value) => {
      cache.set(key, value);
    },
  };
  let calls = 0;
  const message = await resolveCoachMessage(signal, {
    enabled: true,
    now: new Date(cachedAt + 60_000),
    storage,
    invoke: async () => {
      calls++;
      return "Generated coach line.";
    },
  });
  assert.equal(message, "Cached coach line.");
  assert.equal(calls, 0);
});

test("AI coach message cools down after a 429 and stops invoking", async () => {
  const signal = {
    kind: "encouragement",
    priority: 10,
    habitId: "habit-1",
    habitName: "Read",
    tone: "friendly",
    suggestedAction: "open_habit",
    message: "Read one page now.",
  };
  const now = new Date(2026, 4, 10, 9, 15);
  const storage = createMemoryStorage();
  let calls = 0;
  const rateLimitError = new Error("quota exceeded");
  rateLimitError.name = "FunctionsHttpError";
  rateLimitError.context = { status: 429, headers: { get: () => null } };
  const invoke = async () => {
    calls++;
    throw rateLimitError;
  };

  const first = await resolveCoachMessage(signal, {
    enabled: true,
    now,
    storage,
    cooldownMs: 60 * 60 * 1000,
    invoke,
  });
  const second = await resolveCoachMessage(signal, {
    enabled: true,
    now: new Date(now.getTime() + 60_000),
    storage,
    cooldownMs: 60 * 60 * 1000,
    invoke,
  });

  assert.equal(first, signal.message);
  assert.equal(second, signal.message);
  assert.equal(calls, 1);
});

test("AI coach message negative-caches empty output to avoid re-invoking", async () => {
  const signal = {
    kind: "streak_risk",
    priority: 60,
    habitId: "habit-9",
    habitName: "Walk",
    tone: "calm",
    suggestedAction: "open_habit",
    message: "Take a short walk.",
  };
  const now = new Date(2026, 4, 10, 9, 15);
  const storage = createMemoryStorage();
  let calls = 0;
  const invoke = async () => {
    calls++;
    return null; // empty generation -> fallback
  };

  const first = await resolveCoachMessage(signal, { enabled: true, now, storage, invoke });
  const second = await resolveCoachMessage(signal, {
    enabled: true,
    now: new Date(now.getTime() + 60_000),
    storage,
    invoke,
  });
  // After the negative TTL the suppression lifts and we try again.
  const third = await resolveCoachMessage(signal, {
    enabled: true,
    now: new Date(now.getTime() + 10 * 60_000),
    storage,
    invoke,
  });

  assert.equal(first, signal.message);
  assert.equal(second, signal.message);
  assert.equal(third, signal.message);
  assert.equal(calls, 2);
});

test("geminiFetch times out and falls back after exhausting retries", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      calls++;
      const signal = init?.signal;
      const abort = () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal?.aborted) return abort();
      signal?.addEventListener("abort", abort);
    });
  try {
    const response = await generateContent("model-x", "key", { contents: [] }, { timeoutMs: 20 });
    assert.equal(response.ok, false);
    assert.equal(response.status, 504);
    assert.equal(calls, 2); // initial attempt + one retry
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("geminiFetch retries once on 429 then returns success", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("rate limited", { status: 429 });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    const response = await generateContent("model-x", "key", { contents: [] }, { timeoutMs: 5000 });
    assert.equal(response.ok, true);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("geminiFetch returns non-retryable errors immediately", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("bad request", { status: 400 });
  };
  try {
    const response = await generateContent("model-x", "key", { contents: [] }, { timeoutMs: 5000 });
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await testChain;
