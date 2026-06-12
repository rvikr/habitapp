import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import {
  addLocalDays,
  localDateDaysAgo,
  localDateKey,
  previousUtcWeekStartKey,
} from "../lib/utils/date.ts";
import {
  XP_PER_COMPLETION,
  XP_PER_LEVEL,
  levelForXp,
  xpForCompletions,
  xpInLevel,
} from "../lib/coach/xp.ts";
import { validatePassword } from "../lib/auth/password.ts";
import { hasPasswordIdentity, hasRecentSignIn } from "../lib/auth/identity.ts";
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
import {
  HABIT_CATALOG,
  HABIT_CATALOG_SECTIONS,
  HABIT_CATEGORIES,
} from "../lib/data/habit-catalog.ts";
import { buildLifeBalanceWheelSegments } from "../lib/coach/life-balance.ts";
import { authCallbackUrlFromParams } from "../lib/auth/auth-callback-params.ts";
import { buildWebAuthCallbackUrl } from "../lib/auth/auth-callback-url.ts";
import {
  googleNativeAuthConfig,
  googleNativeAuthReady,
  googleNativeAuthUnavailableReason,
  googleNativeDeveloperErrorMessage,
  googleNativeSignInButtonMode,
  getGoogleNativeIdToken,
  isExpoGoRuntime,
  isGoogleNativeCancellationError,
  isGoogleNativeDeveloperError,
} from "../lib/auth/google-native.ts";
import { isSupportedLanguage, languageLabel, translate } from "../lib/i18n/translations.ts";
import { isMissingRefreshTokenError } from "../lib/supabase/auth-error.ts";
import {
  isValidReminderTime,
  parseOptionalPositiveNumber,
  validateFeedback,
} from "../lib/auth/validation.ts";
import { streakFromDates } from "../lib/coach/streak.ts";
import { buildCompletionValuePayload } from "../lib/data/completions.ts";
import {
  healthConnectTodayRange,
  isStepHabit,
  normalizeHealthConnectStepAggregate,
  normalizeStepCount,
} from "../lib/data/steps-shared.ts";
import {
  buildHomeWidgetSnapshot,
  stringifyHomeWidgetSnapshot,
} from "../lib/widgets/home-widget-snapshot.ts";
import {
  buildSleepCompletionValue,
  computeSleepScore,
  isSleepEntriesSetupError,
  normalizeHealthConnectSleepSessions,
  normalizeHealthKitSleepSamples,
  summarizeSleepRange,
  sleepNoDataMessage,
  sleepDateForWakeTime,
  sleepLookbackWindows,
  sleepWindowForDate,
} from "../lib/data/sleep-shared.ts";
import { isExpoGoRuntime as isExpoGoPlatformRuntime } from "../lib/platform/runtime.ts";
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
import { buildCreatedHabits, pickTutorialHabit } from "../lib/coach/post-onboarding.ts";
import { buildCoachSignals, formatCoachMessage, chooseTopCoachSignal } from "../lib/coach/coach.ts";
import {
  buildCoachSignals as buildCoachSignalsPort,
  chooseTopCoachSignal as chooseTopCoachSignalPort,
  localTimeContext,
} from "../supabase/functions/_shared/coach-signals.ts";
import { resolveCoachMessage } from "../lib/coach/coach-ai.ts";
import { dismissCoachCard, isCoachCardDismissed } from "../lib/coach/coach-card-dismissal.ts";
import { generateContent, parseRetryDelayMs } from "../supabase/functions/_shared/gemini.ts";
import { createLimiter } from "../lib/utils/concurrency-limiter.ts";
import {
  buildWeeklyStats,
  buildFacts,
  fallbackSummary,
  scheduledDaysForHabit,
  formatAmount,
  withUnit,
} from "../supabase/functions/progress-report/stats.ts";
import * as subscriptionAccess from "../lib/subscription/access.ts";
import { clearCache, getCachedValue, readThroughCache } from "../lib/data/cache.ts";
import { createQueuedReminderSync } from "../lib/data/reminder-sync-queue.ts";
import { CHUNK_SIZE, LargeSecureStore, splitChunks } from "../lib/platform/large-secure-store.ts";
import { classifyStoredSession } from "../lib/supabase/session-storage.ts";
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

test("localDateKey uses local calendar fields", () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
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
  assert.equal(xpForCompletions(11), 110);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(500), 2);
  assert.equal(xpInLevel(510), 10);

  const sql = readFileSync(
    "supabase/migrations/20260529174021_0021_leaderboard_service_api.sql",
    "utf8",
  );
  assert.match(sql, /\(coalesce\(ct\.total_completions, 0\)::bigint \* 10\) as total_xp/);
  assert.match(sql, /\/ 500\) \+ 1\)::integer as level/);
});

test("landing nav keeps the proxied web app CTA mobile-hidden without Next prefetch", () => {
  const source = readFileSync("website/components/landing/site-nav.tsx", "utf8");
  assert.doesNotMatch(source, /<Link\s+href="\/app"/);
  assert.match(source, /<a\s+href="\/app"/);

  const appCta = source.match(/<a\s+href="\/app"[\s\S]*?<\/a>/)?.[0] ?? "";
  assert.match(appCta, /className="[^"]*\bhidden\b[^"]*\bmd:inline-flex\b/);
  assert.doesNotMatch(appCta, /display:\s*"inline-flex"/);
});

test("website habit clicks refresh dashboard data and show action errors", () => {
  const habitList = readFileSync("website/components/HabitList.tsx", "utf8");

  assert.match(habitList, /useRouter/);
  assert.match(habitList, /router\.refresh\(\)/);
  assert.match(habitList, /result\.ok/);
  assert.match(habitList, /role="alert"/);
});

test("website dashboard lets signed-in users add habits", () => {
  const habitList = readFileSync("website/components/HabitList.tsx", "utf8");
  const actions = readFileSync("website/app/(app)/dashboard/actions.ts", "utf8");

  assert.match(habitList, /Add habit/);
  assert.doesNotMatch(habitList, /Open the mobile app to add your first habit/);
  assert.match(actions, /export async function createHabit/);
  assert.match(actions, /\.from\("habits"\)[\s\S]*\.insert\(/);
});

test("Expo SDK patch dependencies match Expo install expectations", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(packageJson.dependencies.expo, "~54.0.35");
  assert.equal(packageJson.dependencies["expo-file-system"], "~19.0.23");
  assert.equal(packageJson.dependencies["expo-font"], "~14.0.12");
  assert.equal(packageJson.dependencies["expo-localization"], "~17.0.9");
  assert.equal(packageJson.dependencies["expo-router"], "~6.0.24");
  assert.equal(packageJson.dependencies["expo-updates"], "~29.0.18");
});

test("Supabase advisor hardening migration is source-controlled", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_advisor_hardening.sql"),
  );
  assert.ok(migrationName, "expected an advisor hardening migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(
    sql,
    /create or replace function public\.valid_reminder_times\([^)]*\)[\s\S]*set search_path = public, pg_temp/i,
  );
  assert.match(
    sql,
    /create or replace function public\.log_habit_completion\([\s\S]*set search_path = public, pg_temp/i,
  );
  assert.match(sql, /alter extension pg_net set schema extensions/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /\(select auth\.uid\(\)\)/i);
});

test("habit completion ownership is enforced at the database boundary", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_completion_owner_integrity.sql"),
  );
  assert.ok(migrationName, "expected a completion owner integrity migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /alter table public\.habits[\s\S]*unique \(id, user_id\)/i);
  assert.match(
    sql,
    /alter table public\.habit_completions[\s\S]*foreign key \(habit_id, user_id\)/i,
  );
  assert.match(sql, /references public\.habits\(id, user_id\)/i);
  assert.match(sql, /on delete cascade/i);
  assert.match(sql, /not valid/i);
  assert.match(sql, /validate constraint habit_completions_habit_owner_fk/i);
});

test("habit dashboard queries include explicit user_id filters", () => {
  const appSource = readFileSync("lib/data/habits.ts", "utf8");
  const websiteSource = readFileSync("website/lib/habits.ts", "utf8");

  const appTodayQuery =
    appSource.match(
      /supabase\s*\n\s*\.from\("habits"\)[\s\S]*?\.order\("created_at", \{ ascending: true \}\)/,
    )?.[0] ?? "";
  assert.match(appTodayQuery, /\.eq\("user_id", user\.id\)/);

  const websiteTodayHabitQuery =
    websiteSource.match(
      /supabase\s*\n\s*\.from\("habits"\)[\s\S]*?\.order\("created_at", \{ ascending: true \}\)/,
    )?.[0] ?? "";
  assert.match(websiteTodayHabitQuery, /\.eq\("user_id", user\.id\)/);

  const websiteTodayCompletionQuery =
    websiteSource.match(
      /supabase\s*\n\s*\.from\("habit_completions"\)[\s\S]*?\.eq\("completed_on"/,
    )?.[0] ?? "";
  assert.match(websiteTodayCompletionQuery, /\.eq\("user_id", user\.id\)/);

  const websiteWeeklyFunction =
    websiteSource.match(
      /export async function getWeeklyCompletions\(\): Promise<HabitCompletion\[\]> \{[\s\S]*?return \(data \?\? \[\]\) as HabitCompletion\[\];\r?\n\}/,
    )?.[0] ?? "";
  assert.match(websiteWeeklyFunction, /const user = await getCurrentUser\(supabase\)/);
  assert.match(websiteWeeklyFunction, /\.eq\("user_id", user\.id\)/);
});

test("home widget snapshot clamps progress and formats launcher copy", () => {
  const snapshot = buildHomeWidgetSnapshot({
    completedCount: 7,
    totalHabits: 5,
    currentStreak: 1,
    level: 3,
    now: new Date(2026, 4, 10, 9, 5),
    locale: "en-US",
  });

  assert.deepEqual(
    {
      title: snapshot.title,
      completedCount: snapshot.completedCount,
      totalHabits: snapshot.totalHabits,
      remainingCount: snapshot.remainingCount,
      progressPercent: snapshot.progressPercent,
      completionLabel: snapshot.completionLabel,
      streakLabel: snapshot.streakLabel,
      levelLabel: snapshot.levelLabel,
    },
    {
      title: "Today",
      completedCount: 5,
      totalHabits: 5,
      remainingCount: 0,
      progressPercent: 100,
      completionLabel: "All habits done",
      streakLabel: "1 day streak",
      levelLabel: "Level 3",
    },
  );
  assert.match(snapshot.updatedLabel, /^Updated /);
});

test("home widget snapshot handles an empty routine", () => {
  const snapshot = buildHomeWidgetSnapshot({
    completedCount: 2,
    totalHabits: 0,
    currentStreak: 0,
    level: null,
    now: new Date(2026, 4, 10, 9, 5),
    locale: "en-US",
  });

  assert.equal(snapshot.completedCount, 0);
  assert.equal(snapshot.totalHabits, 0);
  assert.equal(snapshot.remainingCount, 0);
  assert.equal(snapshot.progressPercent, 0);
  assert.equal(snapshot.completionLabel, "No habits yet");
  assert.equal(snapshot.streakLabel, "No streak yet");
  assert.equal(snapshot.levelLabel, "Level 1");
  assert.doesNotThrow(() => JSON.parse(stringifyHomeWidgetSnapshot(snapshot)));
});

test("leaderboard RPC is restricted to authenticated callers", () => {
  const sql = readFileSync("supabase/migrations/0012_restrict_leaderboard_rpc.sql", "utf8");
  assert.match(sql, /revoke execute on function public\.get_leaderboard\(text\) from public/i);
  assert.match(sql, /revoke execute on function public\.get_leaderboard\(text\) from anon/i);
  assert.match(sql, /grant execute on function public\.get_leaderboard\(text\) to authenticated/i);
  assert.match(sql, /if auth\.uid\(\) is null then/i);
  assert.match(sql, /raise exception 'authenticated user required'/i);
});

test("leaderboard service API is source-controlled and service-only", () => {
  const apiSql = readFileSync(
    "supabase/migrations/20260529174021_0021_leaderboard_service_api.sql",
    "utf8",
  );
  const lockSql = readFileSync(
    "supabase/migrations/20260529174032_0022_lock_down_leaderboard_views.sql",
    "utf8",
  );
  const edgeFunction = readFileSync("supabase/functions/leaderboard/index.ts", "utf8");

  assert.match(apiSql, /drop function if exists public\.get_leaderboard\(text\)/i);
  assert.match(apiSql, /create or replace function public\.get_leaderboard_entries/i);
  assert.match(apiSql, /create or replace function public\.get_leaderboard_position/i);
  assert.match(lockSql, /revoke all on public\.leaderboard from authenticated/i);
  assert.match(lockSql, /grant all on public\.leaderboard to service_role/i);
  assert.match(
    lockSql,
    /revoke execute on function public\.get_leaderboard_entries\(text, integer, uuid\) from authenticated/i,
  );
  assert.match(
    lockSql,
    /grant execute on function public\.get_leaderboard_position\(uuid, text\) to service_role/i,
  );
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /admin\.rpc\("get_leaderboard_entries"/);
  assert.match(edgeFunction, /admin\.rpc\("get_leaderboard_position"/);
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

test("progress report client exposes an authenticated generate-now action", () => {
  const source = readFileSync("lib/data/progress-reports.ts", "utf8");
  assert.match(source, /export async function generateProgressReportNow/);
  assert.match(source, /supabase\.functions\.invoke(?:<[^>]+>)?\(\s*"progress-report"/);
  assert.match(source, /mode:\s*"generate-now"/);
  assert.match(source, /getLatestProgressReport\(\{\s*force:\s*true\s*\}\)/);
});

test("achievements screen lets Pro users generate a weekly report now", () => {
  const source = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.match(source, /generateProgressReportNow/);
  assert.match(source, /generatingReport/);
  assert.match(source, /onGenerateNow/);
  assert.match(source, /Generate now/);
});

test("previousUtcWeekStartKey matches the edge function's previous ISO week", () => {
  // Friday mid-week → previous Monday-based UTC week starts Jun 1.
  assert.equal(previousUtcWeekStartKey(new Date("2026-06-12T07:00:00Z")), "2026-06-01");
  // Monday 00:00 UTC already belongs to the new week, so previous week is Jun 1.
  assert.equal(previousUtcWeekStartKey(new Date("2026-06-08T00:00:00Z")), "2026-06-01");
  // Sunday 23:59 UTC is still inside the Jun 1 week, so previous week is May 25.
  assert.equal(previousUtcWeekStartKey(new Date("2026-06-07T23:59:59Z")), "2026-05-25");
});

test("achievements screen offers catch-up generation when the latest report is stale", () => {
  const lib = readFileSync("lib/data/progress-reports.ts", "utf8");
  assert.match(lib, /export function isReportStale/);
  assert.match(lib, /week_start < previousUtcWeekStartKey\(\)/);
  const source = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.match(source, /isReportStale\(report\)/);
  assert.match(source, /Generate last week's report/);
});

test("progress-report edge function accepts authenticated generate-now requests", () => {
  const source = readFileSync("supabase/functions/progress-report/index.ts", "utf8");
  assert.match(source, /SUPABASE_ANON_KEY/);
  assert.match(source, /mode\s*===\s*"generate-now"/);
  assert.match(source, /userClient\.auth\.getUser\(\)/);
  assert.match(source, /enforceProAccess\(admin as any, user\.id, "progress-report"\)/);
  assert.match(source, /generateForUser\(admin, user\.id/);
  assert.match(source, /mode:\s*"generate-now"/);
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
    {
      hasPro: false,
      source: "free",
      expiresAt: null,
      trialDaysLeft: null,
      trialEndedAt: "2026-05-21T23:59:59.000Z",
    },
  );
  assert.deepEqual(
    resolveProAccess({ is_pro: false, pro_trial_ends_at: "2026-05-22T00:00:01.000Z" }, now),
    {
      hasPro: true,
      source: "trial",
      expiresAt: "2026-05-22T00:00:01.000Z",
      trialDaysLeft: 1,
      trialEndedAt: null,
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
      trialEndedAt: null,
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
      trialEndedAt: null,
    },
  );
  assert.deepEqual(resolveProAccess({ is_pro: true }, now), {
    hasPro: true,
    source: "admin",
    expiresAt: null,
    trialDaysLeft: null,
    trialEndedAt: null,
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

  // Trial-ended banner: shown to recently lapsed trials, suppressed once
  // dismissed for that trial end, never shown to active trial/paid users,
  // and dropped entirely after the 7-day window.
  assert.equal(subscriptionAccess.shouldShowTrialEndedBanner?.(expiredAccess, null, now), true);
  assert.equal(
    subscriptionAccess.shouldShowTrialEndedBanner?.(expiredAccess, "2026-05-22T09:59:59.000Z", now),
    false,
  );
  assert.equal(subscriptionAccess.shouldShowTrialEndedBanner?.(trialAccess, null, now), false);
  assert.equal(subscriptionAccess.shouldShowTrialEndedBanner?.(paidAccess, null, now), false);
  const staleNow = new Date("2026-06-05T10:00:00.000Z");
  assert.equal(
    subscriptionAccess.shouldShowTrialEndedBanner?.(
      resolveProAccess({ is_pro: false, pro_trial_ends_at: "2026-05-22T09:59:59.000Z" }, staleNow),
      null,
      staleNow,
    ),
    false,
  );
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

test("habit catalog is grouped by the configured categories", () => {
  assert.deepEqual(
    [...HABIT_CATEGORIES],
    ["Health", "Fitness", "Productivity", "Learning", "Mental Health", "Spiritual", "Finance"],
  );
  assert.equal(new Set(HABIT_CATEGORIES).size, HABIT_CATEGORIES.length);

  for (const entry of HABIT_CATALOG) {
    assert.ok(HABIT_CATEGORIES.includes(entry.category), `${entry.name} has a known category`);
  }

  assert.deepEqual(
    HABIT_CATALOG_SECTIONS.map((section) => section.title),
    [...HABIT_CATEGORIES],
  );
  assert.equal(
    HABIT_CATALOG_SECTIONS.flatMap((section) => section.data).length,
    HABIT_CATALOG.length,
  );
});

test("life balance wheel scores visible catalog categories from habit progress", () => {
  const segments = buildLifeBalanceWheelSegments(
    [
      { id: "water", name: "Drink Water", habit_type: "water_intake" },
      { id: "read", name: "Read", habit_type: "read" },
      { id: "budget", name: "Review Budget", habit_type: "custom" },
    ],
    new Map([
      ["water", { ratio: 0.5, isDone: false }],
      ["read", { ratio: 1.2, isDone: true }],
      ["budget", { ratio: 0.25, isDone: false }],
    ]),
  );

  assert.equal(segments.length, HABIT_CATEGORIES.length);
  assert.deepEqual(
    segments.map((segment) => segment.category),
    [...HABIT_CATEGORIES],
  );
  assert.equal(segments.find((segment) => segment.category === "Health")?.score, 0.5);
  assert.equal(segments.find((segment) => segment.category === "Learning")?.score, 1);
  assert.equal(segments.find((segment) => segment.category === "Finance")?.score, 0.25);
  assert.equal(segments.find((segment) => segment.category === "Fitness")?.score, 0);
  assert.equal(segments.find((segment) => segment.category === "Learning")?.completedCount, 1);
});

test("home screen surfaces stats, level, and today's progress", () => {
  const dashboardScreen = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboardScreen, /getStats/);
  assert.match(dashboardScreen, /Today's Focus/);
  assert.match(dashboardScreen, /data\.stats\.level/);
});

test("progress tab surfaces life balance and level progress", () => {
  const progressScreen = readFileSync("app/(tabs)/progress.tsx", "utf8");
  assert.match(progressScreen, /getStats/);
  assert.match(progressScreen, /getConsistencyData/);
  assert.match(progressScreen, /buildLifeBalanceWheelSegments/);
  assert.match(progressScreen, /LIFE BALANCE WHEEL/);
  assert.match(progressScreen, /Level \{level\}/);
});

test("progress tab auto sleep sync does not request native sleep permission", () => {
  const progressScreen = readFileSync("app/(tabs)/progress.tsx", "utf8");
  assert.match(progressScreen, /syncLastNightSleep\(\{\s*requestPermission:\s*false\s*\}\)/);
});

test("sleep tracking is disabled by default", () => {
  const provider = readFileSync("components/tracking-preferences-provider.tsx", "utf8");
  assert.match(provider, /\[sleepEnabled,\s*setSleepEnabledState\]\s*=\s*useState\(false\)/);
});

test("settings requests sleep permission before enabling sleep tracking", () => {
  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /requestSleepPermission/);
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

test("Rate Lagan has a visible Android Play Store fallback", () => {
  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));
  assert.equal(appConfig.expo.android.package, "health.lagan.app");

  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /async function handleRateLagan/);
  assert.match(settingsScreen, /await requestReviewManually\(\)/);
  assert.match(settingsScreen, /Store unavailable/);

  const storeReviewSource = readFileSync("lib/platform/store-review.ts", "utf8");
  assert.match(storeReviewSource, /Promise<boolean>/);
  assert.match(storeReviewSource, /Platform\.OS === "android"/);
  assert.match(storeReviewSource, /Constants\.expoConfig\?\.android\?\.package/);
  assert.match(storeReviewSource, /market:\/\/details\?id=/);
  assert.match(storeReviewSource, /play\.google\.com\/store\/apps\/details\?id=/);
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

test("Android launcher widget is wired through Expo config and dashboard sync", () => {
  const appConfig = JSON.parse(readFileSync("app.json", "utf8"));
  assert.ok(
    appConfig.expo.plugins.some((plugin) =>
      Array.isArray(plugin)
        ? plugin[0] === "./plugins/with-lagan-widget"
        : plugin === "./plugins/with-lagan-widget",
    ),
  );

  const pluginSource = readFileSync("plugins/with-lagan-widget.js", "utf8");
  assert.match(pluginSource, /LaganWidgetProvider/);
  assert.match(pluginSource, /android\.appwidget\.action\.APPWIDGET_UPDATE/);
  assert.match(pluginSource, /lagan_widget_info/);

  const moduleConfig = JSON.parse(
    readFileSync("modules/lagan-widget/expo-module.config.json", "utf8"),
  );
  assert.deepEqual(moduleConfig.platforms, ["android"]);
  assert.deepEqual(moduleConfig.android.modules, ["health.lagan.widget.LaganWidgetModule"]);

  const nativeModule = readFileSync(
    "modules/lagan-widget/android/src/main/java/health/lagan/widget/LaganWidgetModule.kt",
    "utf8",
  );
  assert.match(nativeModule, /Name\("LaganWidget"\)/);
  assert.match(nativeModule, /AsyncFunction\("updateAsync"\)/);
  assert.match(nativeModule, /AppWidgetManager\.ACTION_APPWIDGET_UPDATE/);
  assert.match(nativeModule, /SNAPSHOT_KEY/);

  const dashboardSource = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboardSource, /syncHomeWidgetFromDashboard/);
  assert.match(dashboardSource, /completedCount/);
  assert.match(dashboardSource, /currentStreak/);
});

test("sign-out clears the Android launcher widget snapshot", () => {
  const widgetSource = readFileSync("lib/widgets/home-widget.ts", "utf8");
  assert.match(widgetSource, /clearHomeWidgetSnapshot/);
  assert.match(widgetSource, /SIGNED_OUT_HOME_WIDGET_SNAPSHOT/);
  assert.match(widgetSource, /Open Lagan to start/);
  assert.match(widgetSource, /Sign in to sync/);

  const platformSource = readFileSync("lib/platform/home-widget.android.ts", "utf8");
  assert.match(platformSource, /clearAsync/);

  const nativeModule = readFileSync(
    "modules/lagan-widget/android/src/main/java/health/lagan/widget/LaganWidgetModule.kt",
    "utf8",
  );
  assert.match(nativeModule, /AsyncFunction\("clearAsync"\)/);
  assert.match(nativeModule, /\.remove\(SNAPSHOT_KEY\)/);
  assert.match(nativeModule, /AppWidgetManager\.ACTION_APPWIDGET_UPDATE/);

  const pluginSource = readFileSync("plugins/with-lagan-widget.js", "utf8");
  assert.match(pluginSource, /streakLabel = "Sign in to sync"/);
  assert.match(pluginSource, /levelLabel = "Lagan"/);

  const actionSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionSource, /clearHomeWidgetSnapshot/);
  assert.match(actionSource, /await clearHomeWidgetSnapshot\(\)/);

  const layoutSource = readFileSync("app/_layout.tsx", "utf8");
  assert.match(layoutSource, /clearHomeWidgetSnapshot/);
  assert.match(layoutSource, /void clearHomeWidgetSnapshot\(\)/);
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

test("first-run onboarding is required only for trustworthy empty habit lists", () => {
  assert.equal(
    shouldRequireFirstRunOnboarding({ habitCount: 0, dataOk: true, onboardingComplete: false }),
    true,
  );
  assert.equal(
    shouldRequireFirstRunOnboarding({ habitCount: 2, dataOk: true, onboardingComplete: false }),
    false,
  );
  // A failed fetch must never look like "no habits" — that used to bounce
  // signed-in users into onboarding on every visit.
  assert.equal(
    shouldRequireFirstRunOnboarding({ habitCount: 0, dataOk: false, onboardingComplete: false }),
    false,
  );
  // A user who finished (or skipped past) the wizard is never forced back in,
  // even after archiving every habit.
  assert.equal(
    shouldRequireFirstRunOnboarding({ habitCount: 0, dataOk: true, onboardingComplete: true }),
    false,
  );
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

test("web auth callback URL keeps the Expo Router base path so the PWA handles OAuth", () => {
  // Production PWA served under /app: redirect must re-enter the PWA, not the
  // marketing site's root /auth/callback.
  assert.equal(
    buildWebAuthCallbackUrl("https://lagan.health", "/app", false),
    "https://lagan.health/app/auth/callback",
  );
  // Dev web serves routes at root, so no base path is applied.
  assert.equal(
    buildWebAuthCallbackUrl("http://localhost:8081", "/app", true),
    "http://localhost:8081/auth/callback",
  );
  // No configured base path → plain origin-relative callback.
  assert.equal(
    buildWebAuthCallbackUrl("https://lagan.health", undefined, false),
    "https://lagan.health/auth/callback",
  );
  // Stray leading/trailing slashes in the base path are normalized.
  assert.equal(
    buildWebAuthCallbackUrl("https://lagan.health", "app/", false),
    "https://lagan.health/app/auth/callback",
  );
  assert.equal(
    buildWebAuthCallbackUrl("https://lagan.health", "/app/", false),
    "https://lagan.health/app/auth/callback",
  );
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

test("native Google sign-in requires explicit Android opt-in outside Expo Go", () => {
  assert.equal(
    googleNativeSignInButtonMode({ platform: "android", webClientId: "web-client" }),
    "oauth",
  );
  assert.equal(
    googleNativeSignInButtonMode({
      platform: "android",
      webClientId: "web-client",
      nativeAndroidAuthEnabled: true,
    }),
    "native",
  );
  assert.equal(
    googleNativeSignInButtonMode({
      platform: "android",
      webClientId: "",
      nativeAndroidAuthEnabled: true,
    }),
    "oauth",
  );
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
      nativeAndroidAuthEnabled: true,
    }),
    "oauth",
  );
});

test("Expo Go runtime detection covers current and deprecated constants", () => {
  assert.equal(isExpoGoRuntime({ executionEnvironment: "storeClient" }), true);
  assert.equal(isExpoGoRuntime({ appOwnership: "expo" }), true);
  assert.equal(isExpoGoRuntime({ executionEnvironment: "standalone", appOwnership: null }), false);
});

test("shared platform runtime detection covers current and deprecated Expo Go constants", () => {
  assert.equal(isExpoGoPlatformRuntime({ executionEnvironment: "storeClient" }), true);
  assert.equal(isExpoGoPlatformRuntime({ appOwnership: "expo" }), true);
  assert.equal(
    isExpoGoPlatformRuntime({ executionEnvironment: "standalone", appOwnership: null }),
    false,
  );
});

test("native Google sign-in maps cancellation errors to cancelled results", () => {
  assert.equal(isGoogleNativeCancellationError({ code: "SIGN_IN_CANCELLED" }), true);
  assert.equal(isGoogleNativeCancellationError({ code: "cancelled" }), true);
  assert.equal(isGoogleNativeCancellationError(new Error("cancelled")), false);
});

test("native Google sign-in maps Android developer errors to actionable setup copy", () => {
  assert.equal(isGoogleNativeDeveloperError({ code: "DEVELOPER_ERROR" }), true);
  assert.equal(isGoogleNativeDeveloperError({ code: "10" }), true);
  assert.equal(isGoogleNativeDeveloperError(new Error("developer error")), true);
  assert.match(googleNativeDeveloperErrorMessage(), /SHA-1 fingerprint/);
  assert.match(googleNativeDeveloperErrorMessage(), /EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH/);
});

test("Android Google sign-in uses native ID-token auth before browser OAuth fallback", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(packageJson.dependencies["@react-native-google-signin/google-signin"]);

  const actionSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionSource, /@react-native-google-signin\/google-signin/);
  assert.match(actionSource, /googleNativeSignInButtonMode/);
  assert.match(actionSource, /GOOGLE_NATIVE_ANDROID_AUTH_ENABLED/);
  assert.match(actionSource, /signInWithIdToken\(\{\s*provider:\s*"google"/);
  assert.match(actionSource, /signInWithOAuth/);
});

test("Google web client id is documented for native Android sign-in", () => {
  const envExample = readFileSync(".env.local.example", "utf8");
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=/);
  assert.match(envExample, /EXPO_PUBLIC_GOOGLE_NATIVE_ANDROID_AUTH=/);
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

test("habit form validation errors are accessible beyond color", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /alert-circle-outline/);
  assert.match(source, /Error: \{message\}/);
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

function sleepEntry(id, sleepDate, score, durationMinutes) {
  return {
    id,
    user_id: "user-1",
    sleep_date: sleepDate,
    source: "manual",
    duration_minutes: durationMinutes,
    score,
    start_time: null,
    end_time: null,
    stage_minutes: null,
    source_metadata: null,
    synced_at: `${sleepDate}T07:00:00.000Z`,
    created_at: `${sleepDate}T07:00:00.000Z`,
    updated_at: `${sleepDate}T07:00:00.000Z`,
  };
}

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

test("sleep range summary only counts entries inside the selected sleep window", () => {
  const entries = [
    sleepEntry("recent", "2026-05-14", 90, 480),
    sleepEntry("inside-week", "2026-05-10", 70, 420),
    sleepEntry("older-than-week", "2026-05-06", 100, 600),
  ];
  const now = new Date(2026, 4, 14, 7, 30);

  const sevenDay = summarizeSleepRange(entries, 7, now);
  assert.deepEqual(
    sevenDay.entries.map((entry) => entry.sleep_date),
    ["2026-05-14", "2026-05-10"],
  );
  assert.deepEqual(
    sevenDay.trendEntries.map((entry) => entry.sleep_date),
    ["2026-05-10", "2026-05-14"],
  );
  assert.equal(sevenDay.count, 2);
  assert.equal(sevenDay.averageScore, 80);
  assert.equal(sevenDay.averageDurationMinutes, 450);

  const thirtyDay = summarizeSleepRange(entries, 30, now);
  assert.equal(thirtyDay.count, 3);
  assert.equal(thirtyDay.averageScore, 87);
});

test("sleep range summary reports no data when the selected window is empty", () => {
  const summary = summarizeSleepRange(
    [sleepEntry("stale", "2026-05-06", 100, 600)],
    7,
    new Date(2026, 4, 14, 7, 30),
  );

  assert.deepEqual(summary.entries, []);
  assert.deepEqual(summary.trendEntries, []);
  assert.equal(summary.count, 0);
  assert.equal(summary.averageScore, null);
  assert.equal(summary.averageDurationMinutes, 0);
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

function recommendation(name, habitType) {
  return {
    id: name,
    reason: "because",
    selected: true,
    name,
    description: null,
    icon: "water_drop",
    color: "primary",
    unit: "ml",
    target: 2000,
    habitType,
  };
}

test("buildCreatedHabits zips selected recs with created ids and keeps merged, drops failures", () => {
  const selected = [
    recommendation("Drink Water", "water_intake"),
    recommendation("Walk", "walk"),
    recommendation("Sleep", "sleep"),
  ];
  const results = [
    { ok: true, id: "id-water" },
    { ok: false, id: null, error: "nope" }, // failure in the middle
    { ok: true, id: "id-sleep", merged: true }, // merged habits are kept
  ];
  const created = buildCreatedHabits(selected, results);
  assert.deepEqual(
    created.map((h) => h.id),
    ["id-water", "id-sleep"],
  );
  // alignment preserved: the kept entries carry the right rec metadata
  assert.equal(created[0].name, "Drink Water");
  assert.equal(created[0].habitType, "water_intake");
  assert.equal(created[1].name, "Sleep");
});

test("buildCreatedHabits drops ok results without an id and handles empty input", () => {
  assert.deepEqual(buildCreatedHabits([], []), []);
  assert.deepEqual(
    buildCreatedHabits([recommendation("Walk", "walk")], [{ ok: true, id: null }]),
    [],
  );
});

test("pickTutorialHabit prefers the water habit, else first, else null", () => {
  const water = { id: "w", name: "Drink Water", habitType: "water_intake" };
  const walk = { id: "k", name: "Walk", habitType: "walk" };
  assert.equal(pickTutorialHabit([walk, water]).id, "w"); // water preferred even when not first
  assert.equal(pickTutorialHabit([walk]).id, "k"); // falls back to the first created habit
  assert.equal(pickTutorialHabit([]), null); // null only when nothing was created
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

test("AI coach card only shows secondary Open when primary logs progress", () => {
  const cardSource = readFileSync("components/coach-card.tsx", "utf8");
  const primaryLabelIndex = cardSource.indexOf("{coachActionLabel(signal, t)}");
  const secondaryOpenIndex = cardSource.indexOf('{t("Open")}', primaryLabelIndex);

  assert.notEqual(primaryLabelIndex, -1);
  assert.notEqual(secondaryOpenIndex, -1);
  const secondaryOpenGuard = cardSource.slice(primaryLabelIndex, secondaryOpenIndex);
  assert.match(secondaryOpenGuard, /signal\.suggestedAction\s*===\s*"log_value"/);
  assert.match(secondaryOpenGuard, /signal\.suggestedValue\s*!=\s*null/);
});

test("dashboard auto-shows the coach card but never for the encouragement fallback", () => {
  const dashboardSource = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboardSource, /coachSignal\.kind\s*!==\s*"encouragement"/);
  assert.match(dashboardSource, /dismissCoachCard\(coachSignal\)/);
});

test("coach card dismissal persists for the same signal on the same day", async () => {
  const storage = createMemoryStorage();
  const now = new Date(2026, 5, 12, 9, 0);
  const signal = { kind: "streak_risk", habitId: "habit-1" };

  assert.equal(await isCoachCardDismissed(signal, storage, now), false);
  await dismissCoachCard(signal, storage, now);
  assert.equal(await isCoachCardDismissed(signal, storage, now), true);

  const later = new Date(2026, 5, 12, 21, 30);
  assert.equal(await isCoachCardDismissed(signal, storage, later), true);
});

test("coach card dismissal resets the next day", async () => {
  const storage = createMemoryStorage();
  const today = new Date(2026, 5, 12, 9, 0);
  const signal = { kind: "behind_progress", habitId: "habit-1" };

  await dismissCoachCard(signal, storage, today);
  const tomorrow = new Date(2026, 5, 13, 9, 0);
  assert.equal(await isCoachCardDismissed(signal, storage, tomorrow), false);
});

test("coach card dismissal is isolated per signal kind and habit", async () => {
  const storage = createMemoryStorage();
  const now = new Date(2026, 5, 12, 9, 0);

  await dismissCoachCard({ kind: "streak_risk", habitId: "habit-1" }, storage, now);
  assert.equal(
    await isCoachCardDismissed({ kind: "behind_progress", habitId: "habit-1" }, storage, now),
    false,
  );
  assert.equal(
    await isCoachCardDismissed({ kind: "streak_risk", habitId: "habit-2" }, storage, now),
    false,
  );
  assert.equal(
    await isCoachCardDismissed({ kind: "streak_risk", habitId: "habit-1" }, storage, now),
    true,
  );

  // Dismissing a second signal must not clear the first.
  await dismissCoachCard({ kind: "behind_progress", habitId: "habit-1" }, storage, now);
  assert.equal(
    await isCoachCardDismissed({ kind: "streak_risk", habitId: "habit-1" }, storage, now),
    true,
  );
});

test("coach card dismissal survives corrupted storage", async () => {
  const storage = createMemoryStorage({ "habbit:coach-card:dismissed": "not json" });
  const now = new Date(2026, 5, 12, 9, 0);
  const signal = { kind: "streak_risk", habitId: "habit-1" };

  assert.equal(await isCoachCardDismissed(signal, storage, now), false);
  await dismissCoachCard(signal, storage, now);
  assert.equal(await isCoachCardDismissed(signal, storage, now), true);
});

// The server port runs the same engine against the user's IANA timezone
// instead of the device clock; with the host timezone both must agree exactly.
function portSignalsFor(habits, completions, now, tone) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return buildCoachSignalsPort({
    habits,
    completions,
    local: localTimeContext(now, timezone),
    tone,
  });
}

test("server coach signal port matches the client engine for behind_progress", () => {
  const now = new Date(2026, 4, 14, 16, 0);
  const completions = [
    {
      habit_id: coachHabit.id,
      completed_on: "2026-05-14",
      created_at: "2026-05-14T09:00:00",
      value: 600,
    },
  ];
  const clientTop = chooseTopCoachSignal(
    buildCoachSignals({ habits: [coachHabit], completions, now, tone: "friendly" }),
  );
  const portTop = chooseTopCoachSignalPort(
    portSignalsFor([coachHabit], completions, now, "friendly"),
  );
  assert.equal(clientTop?.kind, "behind_progress");
  assert.deepEqual(portTop, clientTop);
});

test("server coach signal port matches the client engine for streak_risk", () => {
  const now = new Date(2026, 4, 14, 9, 0);
  const completions = [
    {
      habit_id: coachHabit.id,
      completed_on: "2026-05-13",
      created_at: "2026-05-13T09:00:00",
      value: 2000,
    },
    {
      habit_id: coachHabit.id,
      completed_on: "2026-05-12",
      created_at: "2026-05-12T09:00:00",
      value: 2000,
    },
  ];
  const clientTop = chooseTopCoachSignal(
    buildCoachSignals({ habits: [coachHabit], completions, now, tone: "strict" }),
  );
  const portTop = chooseTopCoachSignalPort(
    portSignalsFor([coachHabit], completions, now, "strict"),
  );
  assert.equal(clientTop?.kind, "streak_risk");
  assert.deepEqual(portTop, clientTop);
});

test("server coach signal port falls back to encouragement like the client", () => {
  const now = new Date(2026, 4, 14, 9, 0);
  const clientTop = chooseTopCoachSignal(
    buildCoachSignals({ habits: [coachHabit], completions: [], now, tone: "friendly" }),
  );
  const portTop = chooseTopCoachSignalPort(portSignalsFor([coachHabit], [], now, "friendly"));
  assert.equal(clientTop?.kind, "encouragement");
  assert.deepEqual(portTop, clientTop);
});

test("coach signal priorities stay in sync between client and server port", () => {
  const clientSource = readFileSync("lib/coach/coach.ts", "utf8");
  const portSource = readFileSync("supabase/functions/_shared/coach-signals.ts", "utf8");
  const markers = [
    "priority: 95",
    "priority: 82",
    "priority: 50",
    "priority: 10",
    "60 + Math.min(streak, 10)",
    "70 + Math.max(0, Math.round((expectedProgressForDay(",
  ];
  for (const marker of markers) {
    assert.ok(clientSource.includes(marker), `client engine missing: ${marker}`);
    assert.ok(portSource.includes(marker), `server port missing: ${marker}`);
  }
});

test("coach push only fires inside explicit send windows with a daily cap", () => {
  const source = readFileSync("supabase/functions/coach-push/index.ts", "utf8");
  // Window-gated kinds only — the daily encouragement fallback must never push.
  assert.match(source, /behind_progress: \{ start: 12 \* 60, end: 14 \* 60 \}/);
  assert.match(source, /streak_risk: \{ start: 18 \* 60, end: 20 \* 60 \}/);
  assert.ok(!/encouragement.*start:/.test(source));
  // Kill switch, cap check, and insert-before-send race protection.
  assert.match(source, /eq\("key", "coach_push"\)/);
  const capIndex = source.indexOf('from("coach_push_sends")');
  const insertIndex = source.indexOf('from("coach_push_sends").insert');
  const sendIndex = source.indexOf("webPush.sendNotification");
  assert.ok(capIndex >= 0 && insertIndex > capIndex && sendIndex > insertIndex);
  // Cron-secret gate before any work, like web-push-reminders.
  assert.match(source, /x-cron-secret/);
  assert.match(source, /timingSafeEqual/);
});

test("coach push migration enforces the one-per-day cap with service-role-only access", () => {
  const sql = readFileSync("supabase/migrations/20260612120000_coach_push_sends.sql", "utf8");
  assert.match(sql, /unique \(user_id, local_date\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /to service_role/);
  assert.match(sql, /revoke all on public\.coach_push_sends from anon, authenticated/i);
  assert.match(sql, /'coach_push'/);
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

test("parseRetryDelayMs honors the Retry-After header (seconds) over the body", () => {
  assert.equal(parseRetryDelayMs("3", null), 3000);
  assert.equal(parseRetryDelayMs("2", '{"error":{"details":[{"retryDelay":"9s"}]}}'), 2000);
});

test("parseRetryDelayMs reads RetryInfo.retryDelay from the JSON body", () => {
  assert.equal(
    parseRetryDelayMs(null, '{"error":{"details":[{"@type":"x","retryDelay":"5s"}]}}'),
    5000,
  );
  assert.equal(parseRetryDelayMs(null, '{"error":{"details":[{"retryDelay":"1.5s"}]}}'), 1500);
});

test("parseRetryDelayMs tolerates a missing header and a non-JSON body", () => {
  assert.equal(parseRetryDelayMs(null, "rate limited"), null);
  assert.equal(parseRetryDelayMs(null, null), null);
  assert.equal(parseRetryDelayMs("0", null), null);
});

test("parseRetryDelayMs caps the honored delay at the configured maximum", () => {
  // Default GEMINI_MAX_RETRY_DELAY_MS is 8000ms.
  assert.equal(parseRetryDelayMs("3600", null), 8000);
  assert.equal(parseRetryDelayMs(null, '{"error":{"details":[{"retryDelay":"600s"}]}}'), 8000);
});

test("geminiFetch honors a 429 Retry-After header then succeeds", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response("slow down", { status: 429, headers: { "Retry-After": "0.01" } });
    }
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

test("createLimiter runs at most max tasks concurrently", async () => {
  const limiter = createLimiter(2);
  let active = 0;
  let peak = 0;
  const makeTask = () => async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
  };
  await Promise.all(Array.from({ length: 6 }, () => limiter(makeTask())));
  assert.equal(peak, 2);
  assert.equal(active, 0);
});

test("createLimiter preserves each task's result", async () => {
  const limiter = createLimiter(1);
  const results = await Promise.all([1, 2, 3].map((n) => limiter(async () => n * 2)));
  assert.deepEqual(results, [2, 4, 6]);
});

test("AI coach message skips the background refresh when refresh is false", async () => {
  const signal = {
    kind: "encouragement",
    priority: 10,
    habitId: "habit-skip",
    habitName: "Read",
    tone: "friendly",
    suggestedAction: "open_habit",
    message: "Read one page now.",
  };
  const storage = createMemoryStorage();
  let calls = 0;
  const message = await resolveCoachMessage(signal, {
    enabled: true,
    now: new Date(2026, 4, 10, 9, 15),
    storage,
    nonBlocking: true,
    refresh: false,
    invoke: async () => {
      calls++;
      return "Generated coach line.";
    },
  });
  assert.equal(message, signal.message);
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------------------
// Weekly progress report stats (supabase/functions/progress-report/stats.ts)
// ---------------------------------------------------------------------------

// Monday-anchored test week: 2026-06-01 .. 2026-06-07. `today` sits far in the
// future so future-day capping never interferes unless a test sets it.
const REPORT_WEEK_START = new Date(Date.UTC(2026, 5, 1));
const REPORT_FAR_FUTURE = new Date(Date.UTC(2026, 11, 31));

function reportHabit(overrides = {}) {
  return {
    id: "h",
    name: "Habit",
    unit: null,
    target: null,
    metric_type: "boolean",
    reminder_days: null,
    reminders_enabled: false,
    created_at: "2025-01-01",
    ...overrides,
  };
}

test("weekly report number formatting groups thousands and keeps the habit's unit", () => {
  assert.equal(formatAmount(40000), "40,000");
  assert.equal(formatAmount(7666.666), "7,666.7");
  assert.equal(formatAmount(5), "5");
  assert.equal(withUnit(40000, "steps"), "40,000 steps");
  assert.equal(withUnit(2.5, "km"), "2.5 km");
  assert.equal(withUnit(3, ""), "3"); // empty unit -> no trailing space
});

test("weekly report keeps step counts in steps and never invents kilometres (143 km bug)", () => {
  const stats = buildWeeklyStats({
    habits: [
      reportHabit({ id: "walk", name: "Walk", unit: "steps", target: 8000, metric_type: "steps" }),
    ],
    completions: [
      { habit_id: "walk", completed_on: "2026-06-01", value: 8000 },
      { habit_id: "walk", completed_on: "2026-06-02", value: 5000 },
      { habit_id: "walk", completed_on: "2026-06-03", value: 10000 },
    ],
    lastWeekCompletions: 0,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  const walk = stats.byHabit[0];
  assert.equal(walk.isQuantity, true);
  assert.equal(walk.unit, "steps");
  assert.equal(walk.weeklyTotal, 23000);
  assert.equal(walk.displayTotal, "23,000 steps");
  assert.equal(walk.displayAverage, "7,666.7 steps"); // 23000 / 3 logged days
  assert.equal(walk.targetHitDays, 2); // only the 8000 and 10000 days reach 8000

  const facts = buildFacts(stats);
  assert.match(facts, /23,000 steps total/);
  assert.match(facts, /hit the 8,000 steps goal on 2 days/);
  assert.doesNotMatch(facts, /km/); // the regression: a steps habit must never read as km
});

test("weekly report treats boolean habits as day counts, never a quantity total", () => {
  const stats = buildWeeklyStats({
    habits: [reportHabit({ id: "journal", name: "Journal", unit: "", metric_type: "boolean" })],
    completions: [
      { habit_id: "journal", completed_on: "2026-06-01", value: 1 },
      { habit_id: "journal", completed_on: "2026-06-02", value: 1 },
    ],
    lastWeekCompletions: 0,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  const journal = stats.byHabit[0];
  assert.equal(journal.isQuantity, false);
  assert.equal(journal.weeklyTotal, null);
  assert.equal(journal.displayTotal, null);
  assert.equal(journal.daysLogged, 2);
  assert.equal(journal.scheduledDays, 7);
  assert.match(buildFacts(stats), /Journal: completed 2 of 7 days/);
});

test("weekly report picks strongest and focus habits and computes the week-over-week trend", () => {
  const stats = buildWeeklyStats({
    habits: [
      reportHabit({ id: "walk", name: "Walk", unit: "steps", target: 8000, metric_type: "steps" }),
      reportHabit({ id: "journal", name: "Journal", unit: "", metric_type: "boolean" }),
    ],
    completions: [
      { habit_id: "walk", completed_on: "2026-06-01", value: 8000 },
      { habit_id: "walk", completed_on: "2026-06-02", value: 8000 },
      { habit_id: "walk", completed_on: "2026-06-03", value: 8000 },
      { habit_id: "journal", completed_on: "2026-06-01", value: 1 },
      { habit_id: "journal", completed_on: "2026-06-02", value: 1 },
    ],
    lastWeekCompletions: 3,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  assert.equal(stats.totalCompletions, 5);
  assert.equal(stats.activeHabits, 2);
  assert.equal(stats.perfectDays, 2); // 06-01 and 06-02 have both habits logged
  assert.equal(stats.bestStreak, 3); // 06-01..06-03 all have at least one log
  assert.equal(stats.strongestHabit, "Walk"); // 3/7 beats 2/7
  assert.equal(stats.focusHabit, "Journal");
  assert.deepEqual(stats.trend, { lastWeekCompletions: 3, delta: 2 });

  const fallback = fallbackSummary(stats);
  assert.match(fallback, /5 completions across 2 habits/);
  assert.match(fallback, /Strongest habit: Walk\./);
  assert.match(fallback, /Focus next week on Journal\./);
  assert.match(fallback, /You hit every habit on 2 days\./);
});

test("weekly report does not flag a focus habit when the only habit is fully completed", () => {
  const stats = buildWeeklyStats({
    habits: [
      reportHabit({ id: "walk", name: "Walk", unit: "steps", target: 8000, metric_type: "steps" }),
    ],
    completions: Array.from({ length: 7 }, (_, i) => ({
      habit_id: "walk",
      completed_on: `2026-06-0${i + 1}`,
      value: 8000,
    })),
    lastWeekCompletions: 7,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  assert.equal(stats.byHabit[0].completionRate, 1);
  assert.equal(stats.strongestHabit, "Walk");
  assert.equal(stats.focusHabit, null);
  assert.equal(stats.completionRate, 1);
});

test("weekly report empty week falls back to an encouraging restart message", () => {
  const stats = buildWeeklyStats({
    habits: [reportHabit({ id: "walk", name: "Walk" })],
    completions: [],
    lastWeekCompletions: 4,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  assert.equal(stats.totalCompletions, 0);
  assert.deepEqual(stats.trend, { lastWeekCompletions: 4, delta: -4 });
  assert.match(fallbackSummary(stats), /No habits logged this week/);
});

test("scheduled days honor reminder_days, the habit creation date, and today", () => {
  // reminders_enabled with reminder_days [0,2,4] -> 3 scheduled day-offsets.
  assert.equal(
    scheduledDaysForHabit(
      reportHabit({ reminders_enabled: true, reminder_days: [0, 2, 4] }),
      REPORT_WEEK_START,
      REPORT_FAR_FUTURE,
    ),
    3,
  );

  // Created mid-week (offset 3): earlier days don't count yet -> offsets 3..6 = 4.
  assert.equal(
    scheduledDaysForHabit(
      reportHabit({ created_at: "2026-06-04" }),
      REPORT_WEEK_START,
      REPORT_FAR_FUTURE,
    ),
    4,
  );

  // today caps future days: only 06-01..06-03 (offsets 0..2) have happened -> 3.
  assert.equal(
    scheduledDaysForHabit(reportHabit(), REPORT_WEEK_START, new Date(Date.UTC(2026, 5, 3))),
    3,
  );
});

test("step sync only targets true step habits, never a distance habit named Walk", () => {
  // A real steps habit is a sync target.
  assert.equal(isStepHabit({ metric_type: "steps", habit_type: "walk", unit: "steps" }), true);

  // The 143 km bug: a distance "Walk" must NOT receive raw step writes. When
  // metric_type is set we trust it exclusively, ignoring the walk/unit heuristic.
  assert.equal(isStepHabit({ metric_type: "distance_km", habit_type: "walk", unit: "km" }), false);
  assert.equal(isStepHabit({ metric_type: "boolean", habit_type: "walk", unit: "" }), false);

  // Legacy rows without metric_type fall back to the habit_type/unit heuristic.
  assert.equal(isStepHabit({ metric_type: null, habit_type: "walk", unit: null }), true);
  assert.equal(isStepHabit({ metric_type: null, habit_type: null, unit: "steps" }), true);
  assert.equal(isStepHabit({ metric_type: null, habit_type: "run", unit: "km" }), false);
});

// Backend whose every operation yields to the event loop, so that without the
// LargeSecureStore mutex concurrent ops would genuinely interleave.
function makeAsyncSecureBackend() {
  const map = new Map();
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    async getItem(key) {
      await tick();
      return map.has(key) ? map.get(key) : null;
    },
    async setItem(key, value) {
      await tick();
      map.set(key, value);
    },
    async removeItem(key) {
      await tick();
      map.delete(key);
    },
  };
}

test("splitChunks preserves every character including newlines", () => {
  const value = "a\nb\nc".padEnd(CHUNK_SIZE * 2 + 5, "x") + "\n";
  const chunks = splitChunks(value);
  assert.equal(chunks.join(""), value, "reassembly must equal the original");
  assert.ok(
    chunks.every((chunk) => chunk.length <= CHUNK_SIZE),
    "no chunk may exceed the SecureStore size limit",
  );
});

test("LargeSecureStore round-trips oversized, newline-bearing session payloads", async () => {
  const store = new LargeSecureStore(makeAsyncSecureBackend());
  // > CHUNK_SIZE, with newlines and a multibyte char a `.{1,N}` regex would drop.
  const value = "session-α\n".repeat(600) + "Z";
  assert.ok(value.length > CHUNK_SIZE);
  await store.setItem("sb-auth-token", value);
  assert.equal(await store.getItem("sb-auth-token"), value);
});

test("LargeSecureStore serializes concurrent reads and writes (never a partial or null read)", async () => {
  const store = new LargeSecureStore(makeAsyncSecureBackend());
  const big1 = "A".repeat(CHUNK_SIZE * 3 + 17);
  const big2 = "B".repeat(CHUNK_SIZE * 2 + 9);
  await store.setItem("sb-auth-token", big1);

  // A write racing several reads. The mutex must make every read observe a
  // complete committed value — without it, a read could catch the mid-write
  // window (count present, chunks deleted) and return null or a partial string.
  const [, ...reads] = await Promise.all([
    store.setItem("sb-auth-token", big2),
    store.getItem("sb-auth-token"),
    store.getItem("sb-auth-token"),
    store.getItem("sb-auth-token"),
  ]);
  for (const read of reads) {
    assert.ok(
      read === big1 || read === big2,
      "each concurrent read must be a complete committed value, never partial or null",
    );
  }
  assert.equal(await store.getItem("sb-auth-token"), big2);
});

test("classifyStoredSession drops only parseable, refresh-token-less payloads", () => {
  assert.equal(
    classifyStoredSession(JSON.stringify({ refresh_token: "r1", access_token: "a" })),
    "usable",
  );
  assert.equal(
    classifyStoredSession(JSON.stringify({ currentSession: { refresh_token: "r1" } })),
    "usable",
  );
  assert.equal(
    classifyStoredSession(JSON.stringify({ access_token: "a" })),
    "missing-refresh-token",
  );
  assert.equal(
    classifyStoredSession(JSON.stringify({ refresh_token: "" })),
    "missing-refresh-token",
  );
  // A truncated/corrupt read must NOT be treated as droppable — deleting on it
  // would turn a transient glitch into a permanent sign-out.
  assert.equal(classifyStoredSession('{"refresh_token":"r1","acce'), "unparseable");
  assert.equal(classifyStoredSession("null"), "unparseable");
});

test("hasPasswordIdentity detects email identities and OAuth-only accounts", () => {
  // Email/password account: provider listed in identities.
  assert.equal(hasPasswordIdentity({ identities: [{ provider: "email" }] }), true);
  // Account with both Google and a password.
  assert.equal(
    hasPasswordIdentity({ identities: [{ provider: "google" }, { provider: "email" }] }),
    true,
  );
  // OAuth-only account: no email identity anywhere.
  assert.equal(
    hasPasswordIdentity({
      identities: [{ provider: "google" }],
      app_metadata: { provider: "google", providers: ["google"] },
    }),
    false,
  );
  // Fallback to app_metadata when identities are absent.
  assert.equal(hasPasswordIdentity({ app_metadata: { providers: ["email"] } }), true);
  assert.equal(hasPasswordIdentity({ app_metadata: { provider: "email" } }), true);
  assert.equal(hasPasswordIdentity({}), false);
  assert.equal(hasPasswordIdentity(null), false);
});

test("hasRecentSignIn honors the re-auth window and rejects garbage timestamps", () => {
  const now = new Date("2026-06-11T12:00:00Z");
  assert.equal(hasRecentSignIn("2026-06-11T11:55:00Z", now), true);
  assert.equal(hasRecentSignIn("2026-06-11T12:00:00Z", now), true);
  // Just outside the 10-minute window.
  assert.equal(hasRecentSignIn("2026-06-11T11:49:59Z", now), false);
  assert.equal(hasRecentSignIn(null, now), false);
  assert.equal(hasRecentSignIn(undefined, now), false);
  assert.equal(hasRecentSignIn("not-a-date", now), false);
  // Custom window.
  assert.equal(hasRecentSignIn("2026-06-11T11:00:00Z", now, 2 * 60 * 60 * 1000), true);
});

await testChain;
