import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

import {
  addDateKeyDays,
  addLocalDays,
  currentWeekStartKey,
  dayIndexForDateKey,
  isValidDateKey as isValidAppDateKey,
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
  AUTH_CALLBACK_AUTHENTICATED_BODY,
  AUTH_CALLBACK_CONFIRMED_TITLE,
  AUTH_CALLBACK_SIGN_IN_BODY,
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
import { dashboardDisplayName } from "../lib/data/display-name.ts";
import { buildLifeBalanceWheelSegments } from "../lib/coach/life-balance.ts";
import { authCallbackUrlFromParams } from "../lib/auth/auth-callback-params.ts";
import {
  EXPIRED_AUTH_LINK_MESSAGE,
  authCallbackErrorMessage,
} from "../lib/auth/auth-callback-error.ts";
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
import { authErrorMessageKey, isMissingRefreshTokenError } from "../lib/supabase/auth-error.ts";
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
import {
  COMPLETION_LOOKBACK_DAYS,
  validateCompletionPeriod,
  validateCompletionValue,
} from "../lib/data/completion-rules.ts";
import { streakForSchedule } from "../lib/coach/streak-rules.ts";
import { longestStreakFromDates, streakFromDates } from "../lib/coach/streak.ts";
import { nowMarkerIndex, orderHabitsForTimeline, reminderTimeFor } from "../lib/utils/timeline.ts";
import { buildCompletionValuePayload } from "../lib/data/completions.ts";
import { buildDataExport } from "../lib/utils/export-integrity.ts";
import { createHabitMutationQueueStore } from "../lib/data/habit-mutation-queue-store.ts";
import {
  healthConnectTodayRange,
  isStepHabit,
  normalizeHealthConnectStepAggregate,
  normalizeStepCount,
  resolveWatchedStepTotal,
  shouldStartAutomaticStepSync,
  stepSyncIdentity,
} from "../lib/data/steps-shared.ts";
import {
  buildHomeWidgetSnapshot,
  stringifyHomeWidgetSnapshot,
} from "../lib/widgets/home-widget-snapshot.ts";
import { buildWidgetWeekTrend } from "../lib/widgets/widget-trend.ts";
import { buildWidgetUpcomingInput, selectNextUpcoming } from "../lib/widgets/widget-upcoming.ts";
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
import * as habitIntelligence from "../lib/coach/habit-intelligence.ts";
import {
  learnedSmartReminderTimesForDay,
  sanitizeSmartReminderPlanTimes,
} from "../lib/coach/smart-reminders.ts";
import { resolveAiSmartReminderPlans } from "../lib/coach/smart-reminder-ai.ts";
import { buildRoutineRecommendations } from "../lib/coach/routine-builder.ts";
import { sanitizeHabitRecommendations } from "../lib/coach/routine-ai.ts";
import {
  buildCreatedHabits,
  getTutorialHabitAction,
  pickTutorialHabit,
} from "../lib/coach/post-onboarding.ts";
import { buildCoachSignals, formatCoachMessage, chooseTopCoachSignal } from "../lib/coach/coach.ts";
import {
  buildCoachSignals as buildCoachSignalsPort,
  chooseTopCoachSignal as chooseTopCoachSignalPort,
  formatCoachMessage as formatCoachMessagePort,
  localTimeContext,
} from "../supabase/functions/_shared/coach-signals.ts";
import * as clientCoach from "../lib/coach/coach.ts";
import * as serverCoach from "../supabase/functions/_shared/coach-signals.ts";
import { coachMessageCacheKey, resolveCoachMessage } from "../lib/coach/coach-ai.ts";
import {
  clearHabitValidationRemoteState,
  validateHabitRemote,
} from "../lib/habits/validate-remote.ts";
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
import {
  isRevenueCatPurchaseCancelled,
  selectProPaywallPackages,
} from "../lib/subscription/revenuecat-shared.ts";
import { clearCache, getCachedValue, readThroughCache } from "../lib/data/cache.ts";
import { createQueuedReminderSync } from "../lib/data/reminder-sync-queue.ts";
import { CHUNK_SIZE, LargeSecureStore, splitChunks } from "../lib/platform/large-secure-store.ts";
import { classifyStoredSession } from "../lib/supabase/session-storage.ts";
import {
  buildLoginRedirectPath,
  isAuthAwarePath,
  isLoginPath,
  isProtectedPath,
  safeAdminNextPath,
} from "../website/lib/auth-route-policy.ts";
import { isAdminEmail } from "../website/lib/admin/access.ts";
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

function sourceFiles(paths) {
  const files = [];
  for (const path of paths) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) files.push(...sourceFiles([child]));
      else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) files.push(child);
    }
  }
  return files;
}

test("first-run QA readiness command covers external release gates", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  assert.equal(
    packageJson.scripts["qa:first-run:readiness"],
    "node scripts/first-run/readiness.cjs",
  );
  assert.equal(
    packageJson.scripts["qa:first-run:readiness:skip-native-install"],
    "node scripts/first-run/readiness.cjs --skip-native-install",
  );
  assert.equal(
    packageJson.scripts["qa:first-run:readiness:web"],
    "node scripts/first-run/readiness.cjs --web-only --skip-native-install",
  );
  assert.equal(
    packageJson.scripts["qa:first-run:live-web"],
    "node scripts/first-run/live-web-sanity.cjs",
  );
  assert.equal(
    packageJson.scripts["qa:first-run:proof-template"],
    "node scripts/first-run/live-proof.cjs --write-template",
  );
  assert.equal(
    packageJson.scripts["qa:first-run:proof-validate"],
    "node scripts/first-run/live-proof.cjs --validate tmp/first-run-live-proof-current.json",
  );

  const readinessSource = readFileSync("scripts/first-run/readiness.cjs", "utf8");
  for (const requiredCheck of [
    "adb",
    "eas-cli",
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    "lagan://auth/callback",
    "health.lagan.app",
    "POST_NOTIFICATIONS",
  ]) {
    assert.match(readinessSource, new RegExp(requiredCheck.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(readinessSource, /skipNativeInstall/);
  assert.match(readinessSource, /--skip-native-install/);
  assert.match(readinessSource, /webOnly/);
  assert.match(readinessSource, /--web-only/);

  const liveWebSource = readFileSync("scripts/first-run/live-web-sanity.cjs", "utf8");
  assert.match(liveWebSource, /auth\/v1\/settings/);
  assert.match(liveWebSource, /apikey/);
  assert.match(liveWebSource, /EXPO_PUBLIC_SUPABASE_URL/);
  assert.match(liveWebSource, /EXPO_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(liveWebSource, /function formatError/);
  assert.match(liveWebSource, /error\.code/);
  assert.match(liveWebSource, /first-run-live-web-current\.json/);
  assert.match(liveWebSource, /writeFileSync/);
  assert.match(liveWebSource, /pendingManualGates/);
  assert.match(liveWebSource, /authSettingsSummary/);
  assert.match(liveWebSource, /signupDisabled/);
  assert.match(liveWebSource, /emailAutoconfirm/);

  const liveProofSource = readFileSync("scripts/first-run/live-proof.cjs", "utf8");
  for (const requiredProofField of [
    "signupConfirmation",
    "passwordRecovery",
    "googleSignIn",
    "confirmedAt",
    "resetCompletedAt",
    "oauthCompletedAt",
    "validationErrors",
  ]) {
    assert.match(liveProofSource, new RegExp(requiredProofField));
  }

  const readme = readFileSync("README.md", "utf8");
  assert.match(readme, /npm run qa:first-run:readiness/);
  assert.match(readme, /npm run qa:first-run:readiness:skip-native-install/);
  assert.match(readme, /npm run qa:first-run:readiness:web/);
  assert.match(readme, /npm run qa:first-run:live-web/);
  assert.match(readme, /npm run qa:first-run:proof-template/);
  assert.match(readme, /npm run qa:first-run:proof-validate/);
});

test("localDateKey uses local calendar fields", () => {
  assert.equal(localDateKey(new Date(2026, 0, 2, 23, 30)), "2026-01-02");
});

test("localDateDaysAgo crosses month boundaries", () => {
  assert.equal(localDateDaysAgo(1, new Date(2026, 0, 1, 8, 0)), "2025-12-31");
});

test("currentWeekStartKey returns the local Monday of the reference week", () => {
  assert.equal(currentWeekStartKey(new Date(2026, 5, 29, 8, 0)), "2026-06-29"); // Monday → itself
  assert.equal(currentWeekStartKey(new Date(2026, 6, 1, 8, 0)), "2026-06-29"); // Wednesday
  assert.equal(currentWeekStartKey(new Date(2026, 6, 5, 23, 30)), "2026-06-29"); // Sunday → past Monday
  assert.equal(currentWeekStartKey(new Date(2026, 6, 6, 0, 5)), "2026-07-06"); // next Monday flips the week
});

test("date key validation accepts only real yyyy-mm-dd calendar dates", () => {
  assert.equal(isValidAppDateKey("2026-05-10"), true);
  assert.equal(isValidAppDateKey("2026-02-30"), false);
  assert.equal(isValidAppDateKey("05/10/2026"), false);
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

test("XP constants are canonical across the app and SQL", () => {
  assert.equal(XP_PER_COMPLETION, 10);
  assert.equal(XP_PER_LEVEL, 500);
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

test("landing web app CTAs use plain anchors and expose the header CTA on mobile", () => {
  const pageSource = readFileSync("website/app/page.tsx", "utf8");
  const buttonSource = readFileSync("website/components/ui/button.tsx", "utf8");

  const externalBranch =
    buttonSource.match(
      /if \(props\.external\) \{\r?\n([\s\S]*?)\r?\n    \}(?=\r?\n    return \()/,
    )?.[1] ?? "";
  assert.match(externalBranch, /<a href=\{props\.href\}/);
  assert.doesNotMatch(externalBranch, /<Link\b/);

  const appCtas = [...pageSource.matchAll(/<Button\b[^>]*href=\{WEB_APP_URL\}[^>]*>/g)].map(
    (match) => match[0],
  );
  assert.equal(appCtas.length, 3);
  for (const appCta of appCtas) assert.match(appCta, /(?:^|\s)external(?=\s|>)/);

  const headerCta =
    pageSource.match(
      /<Button\s+[^>]*href=\{WEB_APP_URL\}[^>]*>[\s\S]*?Open the app[\s\S]*?<\/Button>/,
    )?.[0] ?? "";
  assert.doesNotMatch(headerCta, /\bhidden\b/);
  assert.doesNotMatch(pageSource, />\s*Sign in\s*</);
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

  const appTodayQuery =
    appSource.match(
      /supabase\s*\n\s*\.from\("habits"\)[\s\S]*?\.order\("created_at", \{ ascending: true \}\)/,
    )?.[0] ?? "";
  assert.match(appTodayQuery, /\.eq\("user_id", user\.id\)/);
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
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.todayKey, "2026-05-10");
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
  assert.equal(snapshot.nextHabitLabel, "");
  assert.doesNotThrow(() => JSON.parse(stringifyHomeWidgetSnapshot(snapshot)));
});

test("home widget next-habit and coach lines show for everyone", () => {
  const base = {
    completedCount: 1,
    totalHabits: 3,
    currentStreak: 2,
    level: 2,
    nextHabitName: "Daily walk",
    coachMessage: "You're 2,000 steps short — a quick stroll gets you there.",
    now: new Date(2026, 6, 4, 9, 5),
    locale: "en-US",
  };

  // Free users get the deterministic template, Pro users the AI-resolved
  // message — both arrive here as coachMessage, so no gate exists anymore.
  const snapshot = buildHomeWidgetSnapshot(base);
  assert.equal(snapshot.nextHabitLabel, "Next: Daily walk");
  assert.equal(snapshot.coachLabel, "You're 2,000 steps short — a quick stroll gets you there.");

  // All habits done: no next habit to point at, even if a stale name is passed.
  const allDone = buildHomeWidgetSnapshot({ ...base, completedCount: 3 });
  assert.equal(allDone.nextHabitLabel, "");

  // Missing coach message never renders a blank line.
  const noMessage = buildHomeWidgetSnapshot({ ...base, coachMessage: null });
  assert.equal(noMessage.coachLabel, "");
});

test("home widget exposes a safe check-in deep link and an exact-once route", async () => {
  const snapshot = buildHomeWidgetSnapshot({
    completedCount: 1,
    totalHabits: 3,
    currentStreak: 2,
    level: 4,
    nextHabitName: "Drink Water",
    nextHabit: {
      id: "habit water/1",
      name: "Drink Water",
      checkInValue: 250,
    },
    now: new Date(2026, 4, 10, 9, 5),
    locale: "en-US",
  });

  assert.equal(snapshot.checkInLabel, "Check in");
  assert.equal(snapshot.checkInUrl, "lagan://widget/check-in?habitId=habit%20water%2F1");
  assert.equal(JSON.parse(stringifyHomeWidgetSnapshot(snapshot)).checkInUrl, snapshot.checkInUrl);

  const rootLayout = readFileSync("app/_layout.tsx", "utf8");
  const route = readFileSync("app/widget/check-in.tsx", "utf8");
  const habitsData = readFileSync("lib/data/habits.ts", "utf8");
  const widgetHelper = readFileSync("lib/widgets/widget-check-in.ts", "utf8");
  const plugin = readFileSync("plugins/with-lagan-widget.js", "utf8");
  const qa = readFileSync("QA.md", "utf8");
  assert.match(rootLayout, /widget\/check-in/);
  assert.match(route, /getHabit/);
  assert.match(route, /validated\.ok/);
  assert.match(habitsData, /getHabit[\s\S]*?\.is\("archived_at", null\)/);
  assert.match(habitsData, /habitError \|\| completionsError/);
  assert.match(route, /widgetCheckInForValidatedState/);
  assert.match(widgetHelper, /suggestedCheckInForHabit/);
  assert.match(route, /logCompletionOnce/);
  assert.match(route, /Crypto\.randomUUID\(\)/);
  assert.doesNotMatch(route, /params\.value/);
  assert.match(route, /finish\(\)[\s\S]*?\.catch\(\(\) => undefined\)[\s\S]*?\.finally/);
  assert.match(route, /\.finally\(\(\) => router\.replace\("\/" as never\)\)/);
  assert.match(qa, /force-validates the current owned habit online/i);
  assert.match(qa, /offline[\s\S]*?does not queue or guess a check-in[\s\S]*?Today/i);
  assert.match(plugin, /lagan_widget_check_in/);
  assert.match(plugin, /checkInUrl/);
  assert.match(plugin, /widget\/check-in/);
  assert.equal(translate("en", "Logging check-in..."), "Logging check-in...");
  assert.equal(translate("hi", "Logging check-in..."), "चेक-इन लॉग हो रहा है...");

  assert.ok(existsSync("lib/widgets/widget-check-in.ts"));
  const { widgetCheckInForValidatedState } = await import("../lib/widgets/widget-check-in.ts");
  const activeHabit = {
    id: "widget-habit",
    name: "Focus",
    icon: "timer",
    unit: "min",
    metric_type: "minutes",
    target: 100,
    default_log_value: 25,
    archived_at: null,
  };
  assert.equal(
    widgetCheckInForValidatedState(
      { ok: false, habit: activeHabit, completions: [] },
      "2026-07-11",
    ),
    null,
  );
  assert.equal(
    widgetCheckInForValidatedState(
      { ok: true, habit: { ...activeHabit, archived_at: "2026-07-10" }, completions: [] },
      "2026-07-11",
    ),
    null,
  );
  assert.equal(
    widgetCheckInForValidatedState(
      {
        ok: true,
        habit: activeHabit,
        completions: [{ completed_on: "2026-07-11", value: 100 }],
      },
      "2026-07-11",
    ),
    null,
  );
  assert.deepEqual(
    widgetCheckInForValidatedState(
      {
        ok: true,
        habit: activeHabit,
        completions: [{ completed_on: "2026-07-11", value: 40 }],
      },
      "2026-07-11",
    ),
    { habitId: "widget-habit", amount: 25 },
  );
});

test("home widget 7-day trend colors days like the progress tab", () => {
  const now = new Date(2026, 6, 12, 9, 0);
  const habits = [
    { id: "walk", name: "Walk", description: null, icon: "walk", target: null, unit: null },
    { id: "read", name: "Read", description: null, icon: "book", target: 10, unit: "pages" },
  ];
  const completions = [
    { habit_id: "walk", completed_on: "2026-07-12", value: null },
    { habit_id: "read", completed_on: "2026-07-12", value: 10 },
    { habit_id: "walk", completed_on: "2026-07-11", value: null },
    // Below target: logged but not credited, same as the progress tab.
    { habit_id: "read", completed_on: "2026-07-11", value: 4 },
    { habit_id: "deleted-habit", completed_on: "2026-07-10", value: 1 },
  ];

  const trend = buildWidgetWeekTrend({ habits, completions, now });
  assert.equal(trend.length, 7);
  assert.equal(trend[0].date, "2026-07-06");
  assert.equal(trend[6].date, "2026-07-12");
  assert.equal(trend[6].state, "full");
  assert.equal(trend[5].state, "partial");
  assert.equal(trend[4].state, "empty");
  assert.deepEqual(buildWidgetWeekTrend({ habits: [], completions, now }), []);
});

test("home widget snapshot carries trend, upcoming, and stale-day labels", () => {
  const weekTrend = Array.from({ length: 7 }, (_, index) => ({
    date: addDateKeyDays("2026-07-06", index),
    state: "full",
  }));
  const base = {
    completedCount: 1,
    totalHabits: 2,
    currentStreak: 3,
    level: 2,
    nextHabitName: "Read",
    nextHabit: { id: "read", name: "Read", checkInValue: 2 },
    coachMessage: "Two pages gets you moving.",
    weekTrend,
    upcomingHabits: [
      { id: "read", name: "Read", time: "07:30", checkInValue: 2, preferred: false },
      { id: "walk", name: "Walk", time: null, checkInValue: 1, preferred: true },
    ],
    now: new Date(2026, 6, 12, 9, 5),
    locale: "en-US",
  };

  const snapshot = buildHomeWidgetSnapshot({ ...base, language: "en" });
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.todayKey, "2026-07-12");
  assert.equal(snapshot.trend.length, 7);
  // Today's dot reflects the live counts (1 of 2), not the stored history.
  assert.equal(snapshot.trend[6].state, "partial");
  assert.equal(snapshot.trend[0].state, "full");
  assert.equal(
    snapshot.trend[6].letter,
    ["S", "M", "T", "W", "T", "F", "S"][dayIndexForDateKey("2026-07-12")],
  );
  assert.deepEqual(snapshot.upcoming, [
    {
      name: "Read",
      label: "Next: Read",
      time: "07:30",
      checkInUrl: "lagan://widget/check-in?habitId=read",
      checkInLabel: "Check in",
      preferred: false,
    },
    {
      name: "Walk",
      label: "Next: Walk",
      time: null,
      checkInUrl: "lagan://widget/check-in?habitId=walk",
      checkInLabel: "Check in",
      preferred: true,
    },
  ]);
  assert.equal(snapshot.staleLabels.completionLabel, "New day — open Lagan");
  assert.equal(snapshot.staleLabels.streakLabel, "Open Lagan to keep your streak");
  assert.equal(snapshot.staleLabels.checkInLabel, "Open Lagan");
  assert.doesNotThrow(() => JSON.parse(stringifyHomeWidgetSnapshot(snapshot)));

  const hindi = buildHomeWidgetSnapshot({ ...base, language: "hi" });
  assert.equal(hindi.upcoming[0].label, "अगली: Read");
  assert.equal(hindi.staleLabels.completionLabel, "नया दिन — Lagan खोलें");
  assert.equal(
    hindi.trend[6].letter,
    ["र", "सो", "मं", "बु", "गु", "शु", "श"][dayIndexForDateKey("2026-07-12")],
  );

  // A malformed week (wrong length, wrong end date, bad state) is dropped so
  // the provider hides the row instead of rendering a misaligned week.
  assert.deepEqual(
    buildHomeWidgetSnapshot({ ...base, weekTrend: weekTrend.slice(0, 6) }).trend,
    [],
  );
  assert.deepEqual(
    buildHomeWidgetSnapshot({
      ...base,
      weekTrend: weekTrend.map((day) => ({ ...day, date: addDateKeyDays(day.date, -1) })),
    }).trend,
    [],
  );
  assert.deepEqual(
    buildHomeWidgetSnapshot({
      ...base,
      weekTrend: weekTrend.map((day, index) => (index === 0 ? { ...day, state: "great" } : day)),
    }).trend,
    [],
  );
  // An unloggable upcoming habit still renders, but its button opens the app.
  const unloggable = buildHomeWidgetSnapshot({
    ...base,
    upcomingHabits: [
      { id: "read", name: "Read", time: null, checkInValue: null, preferred: false },
    ],
  });
  assert.equal(unloggable.upcoming[0].checkInUrl, null);
  assert.equal(unloggable.upcoming[0].checkInLabel, "Open Lagan");
});

test("widget upcoming list keeps timeline order and dashboard check-in amounts", () => {
  const readHabit = {
    id: "read",
    name: "Read",
    description: null,
    icon: "book",
    target: 10,
    unit: "pages",
    metric_type: "pages",
    default_log_value: 2,
  };
  const walkHabit = {
    id: "walk",
    name: "Walk",
    description: null,
    icon: "walk",
    target: null,
    unit: null,
  };
  const doneHabit = {
    id: "done",
    name: "Stretch",
    description: null,
    icon: "yoga",
    target: null,
    unit: null,
  };

  const upcoming = buildWidgetUpcomingInput({
    timelineEntries: [
      { habit: readHabit, time: "07:30" },
      { habit: walkHabit, time: null },
      { habit: doneHabit, time: null },
    ],
    completedToday: new Set(["done"]),
    todayProgress: new Map(),
    preferredHabitId: "walk",
  });

  assert.deepEqual(upcoming, [
    { id: "read", name: "Read", time: "07:30", checkInValue: 2, preferred: false },
    { id: "walk", name: "Walk", time: null, checkInValue: 1, preferred: true },
  ]);
});

test("widget next-habit selection advances with the clock", () => {
  const items = [
    { id: "a", time: "07:00", preferred: false },
    { id: "b", time: "12:30", preferred: true },
    { id: "c", time: "18:00", preferred: false },
    { id: "d", time: null, preferred: false },
  ];

  // The coach-preferred habit leads until its reminder time passes.
  assert.equal(selectNextUpcoming(items, "06:00")?.id, "b");
  assert.equal(selectNextUpcoming(items, "12:30")?.id, "b");
  // After it passes, the first future-timed habit takes over.
  assert.equal(selectNextUpcoming(items, "13:00")?.id, "c");
  // All timed habits past-due: fall back to the untimed one.
  assert.equal(selectNextUpcoming(items, "19:00")?.id, "d");
  // Everything past-due: the first item stays "next" (app parity).
  assert.equal(
    selectNextUpcoming(
      items.filter((item) => item.time !== null),
      "19:00",
    )?.id,
    "a",
  );
  // An untimed preferred habit leads all day.
  assert.equal(
    selectNextUpcoming(
      [
        { id: "x", time: "07:00", preferred: false },
        { id: "y", time: null, preferred: true },
      ],
      "06:00",
    )?.id,
    "y",
  );
  assert.equal(selectNextUpcoming([], "12:00"), null);
});

test("partial check-in credit migration is target-aware, optimized, and least-privileged", () => {
  const migrationName = readdirSync("supabase/migrations")
    .filter((name) => name.endsWith("_smart_partial_checkin_credit.sql"))
    .sort()
    .at(-1);
  assert.ok(migrationName, "expected a CLI-generated smart partial check-in migration");
  assert.ok(
    migrationName > "20260711101535_completion_increment_idempotency.sql",
    "credit migration must run after the exact-once completion migration",
  );

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  const nativeHabits = readFileSync("lib/data/habits.ts", "utf8");
  const readme = readFileSync("README.md", "utf8");
  assert.equal(existsSync("supabase/get_leaderboard.sql"), false);
  assert.doesNotMatch(readme, /supabase\/get_leaderboard\.sql/i);
  assert.doesNotMatch(readme, /Leaderboard RPC:/i);
  assert.match(readme, /authenticated leaderboard Edge Function/i);
  assert.match(readme, /service-role-only database functions/i);
  assert.match(sql, /drop function if exists public\.get_leaderboard\(text\)/i);
  assert.ok(
    sql.indexOf("drop function if exists public.get_leaderboard(text)") <
      sql.indexOf("create or replace function public.get_leaderboard_entries"),
    "legacy RPC must be removed before replacement APIs are installed",
  );
  assert.match(
    sql,
    /create or replace view public\.leaderboard\s+with \(security_invoker\s*=\s*true\)/i,
  );
  assert.match(
    sql,
    /join public\.habits(?:\s+as)?\s+h\s+on h\.id\s*=\s*hc\.habit_id\s+and h\.user_id\s*=\s*hc\.user_id/i,
  );
  assert.match(
    sql,
    /h\.target is null\s+or h\.target <= 0\s+or coalesce\(hc\.value,\s*1\) >= h\.target/i,
  );
  assert.ok(
    (sql.match(/coalesce\(hc\.value,\s*1\)\s*>=\s*h\.target/gi) ?? []).length >= 5,
    "every leaderboard/date/stats path must apply target-aware credit",
  );
  assert.match(sql, /row_number\(\) over \(partition by dd\.user_id order by dd\.completed_on\)/i);
  assert.match(sql, /current_islands as/i);
  assert.match(sql, /create or replace function public\.get_leaderboard_position/i);
  assert.match(sql, /create or replace function public\.get_completion_dates\(\)/i);
  assert.match(sql, /create or replace function public\.get_completion_stats\(\)/i);
  assert.match(sql, /where hc\.user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(sql, /revoke all on public\.leaderboard from public, anon, authenticated/i);
  assert.match(sql, /grant all on public\.leaderboard to service_role/i);
  assert.match(
    sql,
    /revoke execute on function public\.get_leaderboard_entries\(text, integer, uuid\)\s+from public, anon, authenticated/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_leaderboard_entries\(text, integer, uuid\)\s+to service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.get_completion_stats\(\)\s+to authenticated/i,
  );
  assert.match(nativeHabits, /rpc\("get_completion_stats"\)/);

  const pgTapPath = "supabase/tests/database/smart_partial_checkin_credit.test.sql";
  assert.ok(existsSync(pgTapPath), "expected target-aware credit pgTAP coverage");
  const pgTap = readFileSync(pgTapPath, "utf8");
  assert.match(pgTap, /partial positive-target row receives no completion credit/i);
  assert.match(pgTap, /target-hit and targetless rows receive completion credit/i);
  assert.match(pgTap, /get_completion_stats is scoped to the authenticated owner/i);
  assert.match(pgTap, /anonymous callers cannot execute get_completion_stats/i);
  assert.match(pgTap, /legacy get_leaderboard RPC is absent/i);
  assert.match(pgTap, /authenticated callers cannot execute leaderboard entries/i);
  assert.match(pgTap, /service role may execute leaderboard entries/i);
});

test("historical leaderboard RPC migration denied anonymous callers before retirement", () => {
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

test("profiles entitlement columns are not writable by authenticated users", () => {
  const sql = readFileSync(
    "supabase/migrations/20260614120000_restrict_profiles_entitlement_writes.sql",
    "utf8",
  );
  // Blanket INSERT/UPDATE is revoked, then re-granted column-by-column.
  assert.match(sql, /revoke insert, update on table public\.profiles from anon, authenticated/i);

  const insertGrant = sql.match(/grant insert \(([^)]*)\)/i)?.[1] ?? "";
  const updateGrant = sql.match(/grant update \(([^)]*)\)/i)?.[1] ?? "";

  // The columns the app + website legitimately write must stay writable.
  for (const col of ["display_name", "avatar_style", "avatar_seed", "coach_tone", "updated_at"]) {
    assert.ok(updateGrant.includes(col), `update grant should include ${col}`);
  }
  assert.ok(insertGrant.includes("user_id"), "insert grant should include user_id");

  // No entitlement column may be writable by a non-privileged user (the path
  // that previously let any user self-grant Pro).
  for (const col of [
    "is_pro",
    "revenuecat_entitlement_active",
    "revenuecat_status",
    "pro_expires_at",
    "pro_trial_ends_at",
  ]) {
    assert.ok(!updateGrant.includes(col), `update grant must not expose ${col}`);
    assert.ok(!insertGrant.includes(col), `insert grant must not expose ${col}`);
  }
});

test("support-email escapes user-influenced fields in the notification HTML", () => {
  const source = readFileSync("supabase/functions/support-email/index.ts", "utf8");
  assert.match(source, /function escapeHtml/);
  // category flows through the escape helper, not raw interpolation.
  assert.match(source, /\$\{escapeHtml\(categoryLabel\)\}/);
  assert.doesNotMatch(source, /Category:<\/strong> \$\{categoryLabel\}/);
});

test("support-email requires stored feedback and server-side abuse limits", () => {
  const source = readFileSync("supabase/functions/support-email/index.ts", "utf8");
  const client = readFileSync("lib/utils/feedback.ts", "utf8");

  assert.match(source, /MAX_MESSAGE_LENGTH = 2000/);
  assert.match(source, /feedbackReportId/);
  assert.match(source, /\.from\("feedback_reports"\)[\s\S]*\.eq\("user_id", user\.id\)/);
  assert.match(source, /support_email_sent_at/);
  assert.match(source, /\.gte\("created_at", oneHourAgo\)/);
  assert.match(source, /return json\(\{ error: "Too many feedback emails" \}, 429\)/);
  assert.match(client, /\.select\("id"\)/);
  assert.match(client, /feedbackReportId: report\.id/);
});

test("support-email migration tracks sent notifications for duplicate suppression", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_support_email_limits.sql"),
  );
  assert.ok(migrationName, "expected support email limits migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /support_email_sent_at/i);
  assert.match(sql, /feedback_reports_user_email_sent_idx/i);
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

test("validate-habit is included in the AI quota SQL whitelist", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_validate_habit_quota.sql"),
  );
  assert.ok(migrationName, "expected a validate-habit quota migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /ai_usage_counters_feature_check[\s\S]*validate-habit/i);
  assert.match(sql, /ai_usage_events_feature_check[\s\S]*validate-habit/i);
  assert.match(sql, /p_feature not in \([\s\S]*'validate-habit'/i);
  assert.match(sql, /grant execute on function public\.consume_ai_quota/i);
});

test("AI release hardening migration requires adult attestation and secures its RPCs", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_ai_release_hardening.sql"),
  );
  assert.ok(migrationName, "expected an AI release hardening migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  for (const column of ["ai_adult_attested_at", "ai_disclosure_version", "time_zone"]) {
    assert.match(sql, new RegExp(`profiles[\\s\\S]*${column}`, "i"));
  }
  assert.match(sql, /create or replace function public\.set_ai_access_attestation/i);
  assert.match(sql, /create or replace function public\.set_profile_time_zone/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(
    sql,
    /revoke execute on function public\.set_ai_access_attestation[\s\S]*from public/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.set_ai_access_attestation[\s\S]*to authenticated/i,
  );
  assert.match(sql, /revoke execute on function public\.set_profile_time_zone[\s\S]*from public/i);
  assert.match(
    sql,
    /grant execute on function public\.set_profile_time_zone[\s\S]*to authenticated/i,
  );
  assert.match(
    sql,
    /select ai_adult_attested_at[\s\S]*if v_attested_at is null[\s\S]*ai_attestation_required/i,
  );
  assert.match(sql, /v_disclosure_version is distinct from '2026-07-12'/i);
});

test("AI release hardening adds privacy-safe correlated telemetry and a service-only view", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_ai_release_hardening.sql"),
  );
  assert.ok(migrationName, "expected an AI release hardening migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  for (const column of [
    "request_id",
    "prompt_version",
    "model",
    "latency_ms",
    "provider_status",
    "finish_reason",
    "safety_category",
    "input_tokens",
    "output_tokens",
  ]) {
    assert.match(sql, new RegExp(`ai_usage_events[\\s\\S]*${column}`, "i"));
  }
  assert.match(sql, /create or replace view public\.ai_health_summary/i);
  assert.match(sql, /revoke all on public\.ai_health_summary from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.ai_health_summary to service_role/i);
  assert.match(sql, /All Gemini Features/i);
});

test("shared AI guard fails closed without paid-service confirmation and exposes standard reasons", () => {
  const source = readFileSync("supabase/functions/_shared/ai-guard.ts", "utf8");
  assert.match(source, /GEMINI_PAID_SERVICE_CONFIRMED/);
  assert.match(source, /paid_service_unconfirmed/);
  assert.match(source, /ai_attestation_required/);
  assert.match(source, /feature_disabled/);
  assert.match(source, /quota_exceeded/);
  assert.match(source, /provider_unavailable/);
  assert.match(source, /invalid_output/);
  assert.match(source, /safety_blocked/);
  assert.match(source, /requestId/);
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

test("every Gemini Edge Function correlates terminal usage with the quota request", () => {
  for (const path of [
    "supabase/functions/coach-message/index.ts",
    "supabase/functions/coach-push/index.ts",
    "supabase/functions/habit-routine/index.ts",
    "supabase/functions/smart-reminders/index.ts",
    "supabase/functions/validate-habit/index.ts",
    "supabase/functions/progress-report/index.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /requestId:\s*quota\.requestId/, `${path} must correlate terminal events`);
  }
});

test("validate-habit quota guard failures return a warning validation result", () => {
  const source = readFileSync("supabase/functions/validate-habit/index.ts", "utf8");
  const guardIndex = source.indexOf('enforceAiQuota(admin, user.id, "validate-habit")');
  const warningIndex = source.indexOf('quota.reason === "provider_unavailable"');

  assert.ok(guardIndex >= 0, "expected validate-habit quota guard");
  assert.ok(warningIndex > guardIndex, "quota guard failure should be handled after enforcement");
  assert.match(source, /function unavailableResult/);
  assert.match(source, /status: "warn"/);
  assert.match(source, /source: "gemini_unavailable"/);
  assert.match(
    source,
    /if \(quota\.reason === "provider_unavailable"\)[\s\S]*?return json\(unavailableResult\(quota\.reason\)\)/,
  );
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
  assert.match(lib, /week_start < previousLocalWeekStartKey\(\)/);
  const source = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.match(source, /isReportStale\(report\)/);
  assert.match(source, /Generate last week's report/);
});

test("progress-report edge function accepts authenticated generate-now requests", () => {
  const source = readFileSync("supabase/functions/progress-report/index.ts", "utf8");
  assert.match(source, /SUPABASE_ANON_KEY/);
  assert.match(source, /mode\s*===\s*"generate-now"/);
  assert.match(source, /userClient\.auth\.getUser\(\)/);
  assert.match(source, /enforceProAccess\(\s*admin as any,\s*user\.id,\s*"progress-report",?\s*\)/);
  assert.match(source, /generateForUser\(\s*admin,\s*user\.id/);
  assert.match(source, /mode:\s*"generate-now"/);
});

test("Shared Gemini helper bounds requests with a timeout and a single retry", () => {
  const source = readFileSync("supabase/functions/_shared/gemini.ts", "utf8");
  assert.match(source, /generativelanguage\.googleapis\.com/);
  assert.match(source, /AbortController/);
  assert.match(source, /RETRYABLE_STATUS/);
  assert.match(source, /const MAX_RETRIES = 1/);
});

test("shared Gemini policy sanitizes untrusted text and extracts safety metadata", async () => {
  const policy = await import("../supabase/functions/_shared/ai-policy.ts").catch(() => null);
  assert.ok(policy, "expected shared Gemini AI policy module");

  assert.equal(policy.sanitizeUntrustedText("  Drink\u0000  water\nnow  ", 40), "Drink water now");
  assert.equal(policy.sanitizeUntrustedText("", 40), null);
  assert.equal(policy.sanitizeUntrustedText("abcdef", 3), null);
  assert.deepEqual(JSON.parse(policy.untrustedUserData({ habitName: "Ignore instructions" })), {
    user_data: { habitName: "Ignore instructions" },
  });

  const metadata = policy.geminiResponseMetadata({
    promptFeedback: { blockReason: "SAFETY", safetyRatings: [{ category: "DANGEROUS_CONTENT" }] },
    candidates: [{ finishReason: "SAFETY" }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 7 },
  });
  assert.equal(metadata.safetyBlocked, true);
  assert.equal(metadata.finishReason, "SAFETY");
  assert.equal(metadata.safetyCategory, "DANGEROUS_CONTENT");
  assert.equal(metadata.inputTokens, 12);
  assert.equal(metadata.outputTokens, 7);
  const normalMetadata = policy.geminiResponseMetadata({
    candidates: [
      { finishReason: "STOP", safetyRatings: [{ category: "HARASSMENT", blocked: false }] },
    ],
  });
  assert.equal(normalMetadata.safetyBlocked, false);
  assert.equal(normalMetadata.safetyCategory, null);
});

test("every Gemini request applies explicit safety settings and an untrusted-data envelope", () => {
  for (const path of [
    "supabase/functions/coach-message/index.ts",
    "supabase/functions/coach-push/index.ts",
    "supabase/functions/habit-routine/index.ts",
    "supabase/functions/smart-reminders/index.ts",
    "supabase/functions/validate-habit/index.ts",
    "supabase/functions/progress-report/index.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.match(source, /safetySettings:/, `${path} must set explicit model safety filters`);
    assert.match(source, /untrustedUserData\(/, `${path} must isolate user-controlled prompt data`);
    assert.match(
      source,
      /geminiResponseMetadata\(/,
      `${path} must inspect provider safety metadata`,
    );
  }
  const validator = readFileSync("supabase/functions/validate-habit/index.ts", "utf8");
  assert.match(validator, /CLASSIFIER_SAFETY_SETTINGS/);
  for (const path of [
    "supabase/functions/coach-message/index.ts",
    "supabase/functions/coach-push/index.ts",
    "supabase/functions/habit-routine/index.ts",
    "supabase/functions/smart-reminders/index.ts",
    "supabase/functions/progress-report/index.ts",
  ]) {
    assert.match(readFileSync(path, "utf8"), /GENERATIVE_SAFETY_SETTINGS/);
  }
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
  assert.equal(packageJson.dependencies["react-native-purchases"], "^10.4.2");

  const subscriptionShared = readFileSync("lib/subscription/revenuecat-shared.ts", "utf8");
  assert.match(subscriptionShared, /PRO_ENTITLEMENT_ID = "pro"/);
  assert.match(subscriptionShared, /PRO_MONTHLY_PRODUCT_ID = "rc_49_1m"/);
  assert.match(subscriptionShared, /PRO_ANNUAL_PRODUCT_ID = "rc_499_12m"/);
  assert.match(subscriptionShared, /selectProPaywallPackages/);
  assert.match(subscriptionShared, /isRevenueCatPurchaseCancelled/);

  const subscriptionClient = readFileSync("lib/subscription/revenuecat.ts", "utf8");
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

  const easConfig = JSON.parse(readFileSync("eas.json", "utf8"));
  for (const profile of ["development", "preview", "production"]) {
    assert.equal(easConfig.build[profile].environment, profile);
    for (const key of [
      "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
      "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
    ]) {
      const value = easConfig.build[profile].env?.[key] ?? "";
      assert.doesNotMatch(value, /^\$/);
      assert.doesNotMatch(value, /your-public|REPLACE_WITH|placeholder/i);
    }
  }
});

test("Pro purchase UI is Android-only for this release", () => {
  const proScreen = readFileSync("app/pro.tsx", "utf8");
  assert.match(proScreen, /const canPurchaseInApp = Platform\.OS === "android";/);
  assert.match(proScreen, /\{!canPurchaseInApp \? \(/);
  assert.match(proScreen, /\{loading && canPurchaseInApp &&/);
  assert.match(proScreen, /\{canPurchaseInApp && \(/);
  assert.doesNotMatch(proScreen, /Apple ID/);
  assert.doesNotMatch(proScreen, /Manage or cancel: App Store/);
});

test("RevenueCat paywall package selection prefers configured package slots", () => {
  const monthlySlot = { product: { identifier: "google_monthly:base" } };
  const annualSlot = { product: { identifier: "google_annual:base" } };
  // Google Play reports subscription identifiers as "productId:basePlanId".
  const fallbackMonthly = { product: { identifier: "rc_49_1m:trial-7d" } };
  const fallbackAnnual = { product: { identifier: "rc_499_12m" } };

  assert.deepEqual(
    selectProPaywallPackages({
      monthly: monthlySlot,
      annual: annualSlot,
      availablePackages: [fallbackMonthly, fallbackAnnual],
    }),
    {
      monthly: monthlySlot,
      annual: annualSlot,
      available: true,
    },
  );

  assert.deepEqual(
    selectProPaywallPackages({
      monthly: null,
      annual: null,
      availablePackages: [fallbackMonthly, fallbackAnnual],
    }),
    {
      monthly: fallbackMonthly,
      annual: fallbackAnnual,
      available: true,
    },
  );
});

test("RevenueCat purchase cancellation helper recognizes silent cancellation errors", () => {
  assert.equal(isRevenueCatPurchaseCancelled({ userCancelled: true }), true);
  assert.equal(isRevenueCatPurchaseCancelled({ code: "1" }), true);
  assert.equal(isRevenueCatPurchaseCancelled({ userCancelled: false, code: "2" }), false);
  assert.equal(isRevenueCatPurchaseCancelled(new Error("network")), false);
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

test("analytics does not initialize external tracking during development", () => {
  const analyticsSource = readFileSync("lib/services/analytics.ts", "utf8");
  assert.match(analyticsSource, /if \(initialized \|\| !KEY \|\| optedOut \|\| __DEV__\) return;/);
  assert.match(analyticsSource, /if \(__DEV__\) console\.log\("\[track\]"/);
});

test("app UI avoids React Native Web deprecated shadow and pointerEvents props", () => {
  const files = sourceFiles(["app", "components"]);
  const offenders = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (/pointerEvents=/.test(source)) offenders.push(`${file}: pointerEvents prop`);
    if (/pointer-events-/.test(source)) offenders.push(`${file}: pointer-events class`);
    if (/shadow(Color|Offset|Opacity|Radius)\s*:/.test(source))
      offenders.push(`${file}: shadow* style`);
    if (/elevation\s*:/.test(source)) offenders.push(`${file}: elevation style`);
  }

  assert.deepEqual(offenders, []);
});

test("web celebration avoids native-driver confetti warnings", () => {
  const source = readFileSync("components/celebration.tsx", "utf8");
  assert.match(source, /Platform/);
  assert.match(source, /Platform\.OS !== "web"[\s\S]*<ConfettiCannon/);
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
    /NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL=privacy@lagan\.health/,
  );

  const privacyScreen = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacyScreen, /EXPO_PUBLIC_ACCOUNT_DELETION_URL/);
  assert.match(privacyScreen, /openAccountDeletionPage/);
  assert.doesNotMatch(privacyScreen, /ExpoLinking\.createURL\("account-deletion"\)/);

  const deletionPage = readFileSync("website/app/account-deletion/page.tsx", "utf8");
  assert.match(deletionPage, /Delete your Lagan account/);
  assert.match(deletionPage, /href=\{WEB_APP_URL\}/);
  assert.match(deletionPage, /NEXT_PUBLIC_ACCOUNT_DELETION_CONTACT_EMAIL/);
  assert.match(deletionPage, /privacy@lagan\.health/);
  assert.doesNotMatch(deletionPage, /\/login\?next=\/settings/);

  const loginForm = readFileSync("website/app/login/LoginForm.tsx", "utf8");
  assert.match(loginForm, /useSearchParams/);
  assert.match(loginForm, /safeAdminNextPath/);
  assert.doesNotMatch(loginForm, /resetPasswordForEmail|signUp/);
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
  // Compact focus card: Done | Progress | Next columns, with the next habit
  // taken from timeline order and tinted with its own accent.
  assert.match(dashboardScreen, /t\("Done"\)/);
  assert.match(dashboardScreen, /t\("Progress"\)/);
  assert.match(dashboardScreen, /t\("Next"\)/);
  assert.match(dashboardScreen, /getHabitVisualForHabit\(nextEntry\.habit\)\.accent/);
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

test("progress tab sleep sync refreshes all habit metrics after syncing", () => {
  const progressScreen = readFileSync("app/(tabs)/progress.tsx", "utf8");
  const syncBlock =
    progressScreen.match(
      /syncLastNightSleep\(\{\s*requestPermission:\s*false\s*\}\)[\s\S]*?\.catch\(\(\) => \{\}\);/,
    )?.[0] ?? "";

  assert.match(syncBlock, /load\(\{ force: true \}\)/);
});

test("home step sync refreshes dashboard metrics after persisting step completion", () => {
  const homeScreen = readFileSync("app/(tabs)/index.tsx", "utf8");
  const persistBlock =
    homeScreen.match(
      /const persistStepCount = useCallback\([\s\S]*?setStepTracking\(\{ status: "tracking", lastSyncedAt: now \}\);[\s\S]*?\}, \[[^\]]*\]\);/,
    )?.[0] ?? "";

  assert.match(
    persistBlock,
    /raiseCompletionValue\(habit\.id, steps, "Synced from step counter"\)/,
  );
  assert.match(persistBlock, /load\(\{ force: true \}\)/);
});

test("step sync writes are raise-only so manual logs are never clobbered", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const raiseBlock =
    actions.match(/export async function raiseCompletionValue[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(raiseBlock, /supabase\.rpc\("raise_habit_completion_value"/);
  assert.match(raiseBlock, /kind: "set_value_max"/);
  assert.doesNotMatch(
    actions,
    /from\("habit_completions"\)\s*\.upsert\(buildCompletionValuePayload/,
  );

  const migration = readFileSync(
    "supabase/migrations/20260704120000_raise_completion_value_rpc.sql",
    "utf8",
  );
  assert.match(migration, /on conflict \(habit_id, completed_on\) do update/);
  assert.match(
    migration,
    /where coalesce\(public\.habit_completions\.value, 0\) < excluded\.value/,
  );
  assert.match(migration, /note\s*=\s*coalesce\(public\.habit_completions\.note, excluded\.note\)/);
  assert.match(migration, /grant\s+execute[\s\S]*to authenticated/);

  // A queued monotonic raise must not erase queued manual increments.
  const queue = readFileSync("lib/data/completion-queue.ts", "utf8");
  const queueStore = readFileSync("lib/data/completion-queue-store.ts", "utf8");
  assert.match(
    queueStore,
    /if \(op\.kind === "set_value_max"\) return item\.kind !== "set_value_max";/,
  );
  const replayBlock = queue.match(/async function replayOp[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(replayBlock, /raise_habit_completion_value/);

  // Local dashboard state mirrors the raise-only rule.
  const homeScreen = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(
    homeScreen,
    /Math\.max\(current\.todayProgress\.get\(habit\.id\)\?\.current \?\? 0, value\)/,
  );
});

test("sleep tracking is disabled by default", () => {
  const provider = readFileSync("components/tracking-preferences-provider.tsx", "utf8");
  assert.match(provider, /\[sleepEnabled,\s*setSleepEnabledState\]\s*=\s*useState\(false\)/);
});

test("settings requests sleep permission before enabling sleep tracking", () => {
  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /requestSleepPermission/);
});

test("web surfaces explain that auto-tracking needs the mobile app with a get-the-app link", () => {
  const constants = readFileSync("lib/constants.ts", "utf8");
  assert.match(constants, /GET_APP_URL = "https:\/\/lagan\.health"/);

  const dashboardScreen = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboardScreen, /Platform\.OS === "web" && state\.status === "unsupported"/);
  assert.match(dashboardScreen, /Track steps automatically with the app/);
  assert.match(dashboardScreen, /Linking\.openURL\(GET_APP_URL\)/);

  const progressScreen = readFileSync("app/(tabs)/progress.tsx", "utf8");
  assert.match(progressScreen, /Automatic sleep sync works in the Lagan iOS and Android app/);
  assert.match(progressScreen, /Linking\.openURL\(GET_APP_URL\)/);

  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /You can still log sleep manually on web/);
  assert.match(settingsScreen, /Auto-sync needs the Lagan mobile app/);
  assert.match(settingsScreen, /Platform\.OS === "web"[\s\S]*?<TrackingInfoRow/);
  assert.match(settingsScreen, /Mobile app required/);

  const trackingProvider = readFileSync("components/tracking-preferences-provider.tsx", "utf8");
  assert.match(trackingProvider, /Platform\.OS === "web" \? false : value/);
  assert.match(progressScreen, /Platform\.OS !== "web" && !sleepEnabled/);
});

test("store-facing support and legal links have production build defaults", () => {
  const settingsScreen = readFileSync("app/(tabs)/settings/index.tsx", "utf8");
  assert.match(settingsScreen, /https:\/\/lagan\.health\/terms/);
  // "Contact Support" routes to the in-app feedback flow, which emails the team
  // via the support-email edge function (production address lives in eas.json's
  // EXPO_PUBLIC_SUPPORT_EMAIL, asserted below) rather than a mailto: link.
  assert.match(settingsScreen, /Contact Support/);
  assert.match(settingsScreen, /settings\/feedback/);

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
  // Next-habit and coach lines: rendered from the snapshot, hidden when blank.
  assert.match(pluginSource, /lagan_widget_next_habit/);
  assert.match(pluginSource, /lagan_widget_coach/);
  assert.match(pluginSource, /json\.optString\("nextHabitLabel", ""\)/);
  assert.match(pluginSource, /json\.optString\("coachLabel", ""\)/);
  // The next-habit line binds the time-aware selected label (falling back to
  // the synced snapshot label for v1 payloads), hidden when blank.
  assert.match(pluginSource, /if \(nextHabitLabel\.isBlank\(\)\) View\.GONE else View\.VISIBLE/);
  assert.match(
    pluginSource,
    /if \(snapshot\.coachLabel\.isBlank\(\)\) View\.GONE else View\.VISIBLE/,
  );
  // 7-day trend row: fixed per-day views bound via setImageViewResource, and
  // hidden entirely for v1 snapshots that carry no trend data.
  assert.match(pluginSource, /TREND_DAYS = 7/);
  assert.match(pluginSource, /lagan_widget_trend_row/);
  assert.match(pluginSource, /lagan_widget_trend_dot_/);
  assert.match(pluginSource, /lagan_widget_trend_letter_/);
  assert.match(pluginSource, /lagan_widget_dot_full/);
  assert.match(pluginSource, /lagan_widget_dot_partial/);
  assert.match(pluginSource, /lagan_widget_dot_empty/);
  assert.match(pluginSource, /setImageViewResource/);
  assert.match(pluginSource, /setViewVisibility\(R\.id\.lagan_widget_trend_row, View\.GONE\)/);
  // Self-freshening provider: day rollover + time-aware next-habit selection.
  assert.match(pluginSource, /todayKey/);
  assert.match(pluginSource, /staleLabels/);
  assert.match(pluginSource, /bindStaleDay/);
  assert.match(pluginSource, /optJSONArray\("upcoming"\)/);
  assert.match(pluginSource, /private fun selectNext\(/);
  assert.match(pluginSource, /"with-lagan-widget", "1\.2\.0"/);

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
  assert.match(dashboardSource, /weekTrend: data\.weekTrend/);
  assert.match(dashboardSource, /buildWidgetUpcomingInput/);
  assert.match(dashboardSource, /upcomingHabits: widgetUpcomingHabits/);
});

test("sign-out clears the Android launcher widget snapshot", () => {
  const widgetSource = readFileSync("lib/widgets/home-widget.ts", "utf8");
  assert.match(widgetSource, /clearHomeWidgetSnapshot/);
  assert.match(widgetSource, /SIGNED_OUT_HOME_WIDGET_SNAPSHOT/);
  assert.match(widgetSource, /Open Lagan to start/);
  assert.match(widgetSource, /Sign in to sync/);
  // No todayKey in the signed-out snapshot: the provider must never flip the
  // signed-out card into the day-rollover ("stale") state.
  assert.doesNotMatch(widgetSource, /todayKey:/);

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

test("app-icon badge tracks the remaining-habits-today count", () => {
  // The badge rides the same outward sync as the home widget, using the
  // snapshot's remainingCount, and clears alongside it on sign-out.
  const widgetSource = readFileSync("lib/widgets/home-widget.ts", "utf8");
  assert.match(widgetSource, /setAppBadgeCount\(snapshot\.remainingCount\)/);
  assert.match(widgetSource, /clearAppBadge\(\)/);

  // Both platform adapters expose the badge API so the platform-split import
  // resolves on native and web.
  const nativeAdapter = readFileSync("lib/platform/notifications.native.ts", "utf8");
  assert.match(nativeAdapter, /export async function setAppBadgeCount/);
  assert.match(nativeAdapter, /setBadgeCountAsync/);
  const webAdapter = readFileSync("lib/platform/notifications.web.ts", "utf8");
  assert.match(webAdapter, /export async function setAppBadgeCount/);
  assert.match(webAdapter, /setAppBadge/);

  // A "Mark done" tap while the app is closed decrements the badge directly,
  // since the dashboard sync can't run to recompute it.
  const schedulerSource = readFileSync("components/notification-scheduler.tsx", "utf8");
  assert.match(schedulerSource, /getAppBadgeCount/);
  assert.match(schedulerSource, /setAppBadgeCount\(current - 1\)/);
});

test("Supabase stale refresh token errors are recognized", () => {
  const error = new Error("Invalid Refresh Token: Refresh Token Not Found");
  assert.equal(isMissingRefreshTokenError(error), true);
  assert.equal(websiteIsMissingRefreshTokenError({ message: "refresh_token_not_found" }), true);
  assert.equal(isMissingRefreshTokenError(new Error("Network request failed")), false);
});

test("website auth route policy keeps public and proxied app paths out of auth middleware", () => {
  for (const pathname of [
    "/",
    "/privacy",
    "/terms",
    "/account-deletion",
    "/auth/callback",
    "/api/og/card",
    "/sitemap.xml",
    "/robots.txt",
    "/app",
    "/app/",
    "/app/dashboard",
    "/app/login/",
    "/dashboard",
    "/achievements",
    "/leaderboard",
    "/settings",
    "/reset-password",
  ]) {
    assert.equal(isAuthAwarePath(pathname), false, `${pathname} should bypass auth middleware`);
    assert.equal(isProtectedPath(pathname), false, `${pathname} should not be protected`);
  }
});

test("website auth route policy protects only admin areas and login", () => {
  for (const pathname of ["/admin", "/admin/users"]) {
    assert.equal(isAuthAwarePath(pathname), true, `${pathname} should run auth middleware`);
    assert.equal(isProtectedPath(pathname), true, `${pathname} should be protected`);
  }

  assert.equal(isAuthAwarePath("/login"), true);
  assert.equal(isLoginPath("/login"), true);
  assert.equal(isProtectedPath("/login"), false);
});

test("website admin redirects preserve safe destinations and reject other paths", () => {
  assert.equal(buildLoginRedirectPath("/admin", ""), "/login?next=%2Fadmin");
  assert.equal(
    buildLoginRedirectPath("/admin/users", "?tab=pro"),
    "/login?next=%2Fadmin%2Fusers%3Ftab%3Dpro",
  );
  assert.equal(safeAdminNextPath("/admin/users?tab=pro"), "/admin/users?tab=pro");
  assert.equal(safeAdminNextPath("/privacy"), "/admin");
  assert.equal(safeAdminNextPath("//evil.example/admin"), "/admin");
  assert.equal(isAdminEmail("ADMIN@LAGAN.HEALTH", "admin@lagan.health"), true);
  assert.equal(isAdminEmail("user@lagan.health", "admin@lagan.health"), false);
});

test("first-run auth backend errors are mapped to localized user copy", () => {
  const cases = [
    [new Error("Invalid login credentials"), "Invalid email or password."],
    [new Error("Email not confirmed"), "Confirm your email before signing in."],
    [
      new Error("User already registered"),
      "An account with this email already exists. Try signing in instead.",
    ],
    [
      { message: "For security purposes, you can only request this after 60 seconds" },
      "Too many attempts. Wait a minute, then try again.",
    ],
  ];

  for (const [error, key] of cases) {
    assert.equal(authErrorMessageKey(error), key);
    assert.notEqual(translate("hi", key), key);
  }

  const loginSource = readFileSync("app/login.tsx", "utf8");
  assert.match(loginSource, /authErrorMessageKey/);
  assert.doesNotMatch(loginSource, /setError\(e\.message\)/);
  assert.doesNotMatch(loginSource, /setFeedback\(\{ text: error\.message, type: "error" \}\)/);
});

test("password validation rejects weak passwords", () => {
  assert.equal(validatePassword("Short1"), "Password must be at least 8 characters.");
  assert.equal(validatePassword("lowercaseonly1"), "Password must include an uppercase letter.");
  assert.equal(validatePassword("Valid123"), null);
  assert.equal(validatePassword("ValidPassword1"), null);
});

test("password validation errors are translated before display on auth screens", () => {
  const messages = [
    "Password must be at least 8 characters.",
    "Password must include a lowercase letter.",
    "Password must include an uppercase letter.",
    "Password must include a number.",
  ];

  for (const message of messages) {
    assert.notEqual(translate("hi", message), message);
  }

  const loginSource = readFileSync("app/login.tsx", "utf8");
  assert.match(loginSource, /setError\(t\(pwError\)\)/);

  const resetPasswordSource = readFileSync("app/reset-password.tsx", "utf8");
  assert.match(
    resetPasswordSource,
    /setMessage\(\{\s*text:\s*t\(pwError\),\s*type:\s*"error"\s*\}\)/,
  );

  const settingsSecuritySource = readFileSync("app/(tabs)/settings/security.tsx", "utf8");
  assert.match(
    settingsSecuritySource,
    /setMessage\(\{\s*text:\s*t\(pwError\),\s*type:\s*"error"\s*\}\)/,
  );
});

test("auth recovery errors are localized before display", () => {
  for (const message of [
    "Auth session missing!",
    "Missing authentication code or token.",
    "Missing authentication callback URL.",
    EXPIRED_AUTH_LINK_MESSAGE,
  ]) {
    assert.notEqual(translate("hi", message), message);
  }

  const resetPasswordSource = readFileSync("app/reset-password.tsx", "utf8");
  assert.doesNotMatch(resetPasswordSource, /text:\s*error\.message/);
  // Backend errors are mapped to a known, translated key rather than shown raw.
  assert.match(resetPasswordSource, /text:\s*t\(authErrorMessageKey\(error\)\)/);

  const callbackSource = readFileSync("app/auth/callback.tsx", "utf8");
  assert.match(callbackSource, /setError\(authCallbackErrorMessage\(e\)\)/);
  assert.doesNotMatch(callbackSource, /\{error\}/);
  assert.match(callbackSource, /\{error \? t\(error\) : null\}/);

  assert.equal(
    authCallbackErrorMessage({ code: "otp_expired", message: "Email link is invalid" }),
    EXPIRED_AUTH_LINK_MESSAGE,
  );
  assert.equal(
    authCallbackErrorMessage(new Error("Token has expired or is invalid")),
    EXPIRED_AUTH_LINK_MESSAGE,
  );
  assert.equal(
    authCallbackErrorMessage(new Error("Invalid login credentials")),
    "Invalid login credentials",
  );
});

test("signup and email confirmation copy gives a clear next step", () => {
  assert.match(SIGNUP_CONFIRMATION_MESSAGE, /check your email/i);
  assert.match(SIGNUP_CONFIRMATION_MESSAGE, /confirm/i);
  assert.equal(AUTH_CALLBACK_CONFIRMED_TITLE, "Congratulations, your email is confirmed!");
  assert.equal(
    AUTH_CALLBACK_AUTHENTICATED_BODY,
    "You're signed in and ready to continue to Lagan.",
  );
  assert.equal(
    AUTH_CALLBACK_SIGN_IN_BODY,
    "Your email is confirmed. Sign in to continue to Lagan.",
  );
  for (const copy of [
    AUTH_CALLBACK_AUTHENTICATED_BODY,
    AUTH_CALLBACK_SIGN_IN_BODY,
    "Back to sign in",
  ]) {
    assert.notEqual(translate("hi", copy), copy);
  }
  assert.equal(FIRST_LOGIN_WELCOME_TITLE, "Welcome to Lagan!");
  assert.match(FIRST_LOGIN_WELCOME_BODY, /all set/i);
});

test("forgot password modal pre-fills the latest typed email when opened", () => {
  const source = readFileSync("app/login.tsx", "utf8");
  const modalSource = source.slice(source.indexOf("function ForgotPasswordModal"));
  assert.match(modalSource, /useEffect\(\(\) => \{/);
  assert.match(
    modalSource,
    /if \(visible\) \{[\s\S]*setEmail\(initialEmail\);[\s\S]*setFeedback\(null\);[\s\S]*\}/,
  );
  assert.match(modalSource, /\}, \[visible, initialEmail\]\);/);
});

test("first-run auth touch targets expose web accessibility roles", () => {
  for (const file of ["app/login.tsx", "app/reset-password.tsx", "app/auth/callback.tsx"]) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  const loginSource = readFileSync("app/login.tsx", "utf8");
  for (const label of [
    "Change language",
    "Sign in with Google",
    "Hide password",
    "Show password",
    "Hide confirm password",
    "Show confirm password",
  ]) {
    assert.match(loginSource, new RegExp(`t\\("${label}"\\)`));
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run auth buttons use text loading states instead of web-warning spinners", () => {
  for (const file of ["app/login.tsx", "app/reset-password.tsx", "app/auth/callback.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /ActivityIndicator/);
    assert.doesNotMatch(source, /disabled=\{(?:loading|sending|googleLoading)/);
  }

  for (const label of [
    "Signing in...",
    "Creating account...",
    "Continuing...",
    "Sending...",
    "Updating...",
  ]) {
    assert.notEqual(translate("hi", label), label);
  }
});

test("shared recovery and account controls expose accessible actions", () => {
  for (const file of [
    "components/error-boundary.tsx",
    "components/top-app-bar.tsx",
    "components/logout-button.tsx",
    "components/persistent-toggle.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  assert.match(
    readFileSync("components/error-boundary.tsx", "utf8"),
    /accessibilityLabel="Try again"/,
  );
  assert.match(
    readFileSync("components/top-app-bar.tsx", "utf8"),
    /accessibilityLabel=\{t\("Go back"\)\}/,
  );
  assert.match(
    readFileSync("components/logout-button.tsx", "utf8"),
    /accessibilityLabel=\{t\("Sign out"\)\}/,
  );

  const toggleSource = readFileSync("components/persistent-toggle.tsx", "utf8");
  assert.match(toggleSource, /accessibilityRole="switch"/);
  assert.match(toggleSource, /accessibilityState=\{\{ checked \}\}/);
});

test("settings screens expose accessible actions and text loading states", () => {
  const settingsFiles = [
    "app/(tabs)/settings/coach.tsx",
    "app/(tabs)/settings/feedback.tsx",
    "app/(tabs)/settings/index.tsx",
    "app/(tabs)/settings/privacy.tsx",
    "app/(tabs)/settings/profile.tsx",
    "app/(tabs)/settings/reminders.tsx",
    "app/(tabs)/settings/security.tsx",
  ];

  for (const file of settingsFiles) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  for (const file of [
    "app/(tabs)/settings/feedback.tsx",
    "app/(tabs)/settings/privacy.tsx",
    "app/(tabs)/settings/profile.tsx",
    "app/(tabs)/settings/security.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /ActivityIndicator/);
  }

  for (const label of [
    "Sending...",
    "Exporting...",
    "Requesting deletion...",
    "Saving...",
    "Update password",
  ]) {
    assert.notEqual(translate("hi", label), label);
  }
});

test("remaining secondary first-run surfaces expose accessible actions", () => {
  const files = [
    "app/(tabs)/leaderboard.tsx",
    "app/(tabs)/progress.tsx",
    "app/account-deletion.tsx",
    "app/pro.tsx",
    "components/badge-grid.tsx",
    "components/share-card-modal.tsx",
  ];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  for (const file of [
    "app/(tabs)/leaderboard.tsx",
    "app/pro.tsx",
    "components/share-card-modal.tsx",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /ActivityIndicator/);
  }

  for (const label of [
    "Edit leaderboard profile",
    "Join the leaderboard",
    "Share your rank",
    "Saving...",
    "Get the app",
    "Share badge {name}",
    "Close share card",
    "Preparing...",
    "Share Card",
    "Share as Text",
    "Buy {label}",
    "Restore purchases",
    "Terms of Use",
    "Privacy Policy",
  ]) {
    assert.notEqual(translate("hi", label), label);
  }
});

test("late first-run surfaces localize alerts and use text busy states", () => {
  const achievementsSource = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.doesNotMatch(achievementsSource, /ActivityIndicator/);
  for (const label of ["Generating...", "Generate now", "Generate last week's report"]) {
    assert.match(
      achievementsSource,
      new RegExp(`t\\("${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
    );
    assert.notEqual(translate("hi", label), label);
  }

  for (const file of ["app/(tabs)/settings/privacy.tsx", "app/(tabs)/settings/reminders.tsx"]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /showAlert\(\s*"/, `${file} has raw alert copy`);
  }

  const privacySource = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  for (const label of [
    "Go back",
    "Privacy & Data",
    "Analytics opt-out",
    "Stops product analytics events on this device.",
    "Crash reporting opt-out",
    "Stops crash reports from being sent from this device.",
    "View my data export",
    "Privacy policy",
    "Account deletion page",
    "Request account deletion",
    "Optional note",
    "Confirm password",
    "Request deletion",
    "Data export",
    "Close data export",
    "Could not export data",
    "Confirm it's you",
    "Could not delete account",
    "Password required",
    "Delete account?",
  ]) {
    assert.match(privacySource, new RegExp(`t\\("${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.notEqual(translate("hi", label), label);
  }

  const remindersSource = readFileSync("app/(tabs)/settings/reminders.tsx", "utf8");
  for (const label of [
    "Go back",
    "Reminders",
    "Enable notifications",
    "Allow notifications to receive habit reminders.",
    "Allow",
    "Notifications are disabled",
    "No reminder time set",
    "Could not update reminders",
  ]) {
    assert.match(
      remindersSource,
      new RegExp(`t\\("${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run Hindi copy avoids English fragments on onboarding-critical screens", () => {
  for (const [label, forbiddenFragments] of [
    ["Target must be a positive number.", ["positive number"]],
    ["Amount in {unit}", ["amount"]],
    ["8+ chars, mixed case + number", ["mixed case", "number"]],
    [
      "Use at least 8 characters with uppercase, lowercase, and a number.",
      ["uppercase", "lowercase", "number"],
    ],
    ["New password (8+ chars, mixed case + number)", ["mixed case", "number"]],
    ["Notifications blocked — enable in Settings.", ["blocked", "Settings"]],
    ["Allow notifications for habit reminders.", ["Habit reminders", "notifications allow"]],
    ["STEP {current} OF {total}", ["Step", "of"]],
    ["Build routine", ["Routine"]],
    ["Pick any goals that matter this week.", ["week", "goals"]],
    ["Movement goals should feel doable from day one.", ["Movement goals", "doable"]],
  ]) {
    const translated = translate("hi", label);
    for (const fragment of forbiddenFragments) {
      assert.doesNotMatch(
        translated,
        new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `${label} leaks English fragment "${fragment}" into Hindi`,
      );
    }
  }
});

test("treatment quick-start copy has Hindi translations", () => {
  for (const label of [
    "Preparing your routine...",
    "Choose one goal for your quick start.",
    "Daily context",
    "What does a typical day look like?",
    "Biggest constraint",
    "What most often gets in the way?",
    "Not enough time",
    "My days already feel full",
    "Low energy",
    "I often feel drained",
    "High stress",
    "I need a calmer starting point",
    "Poor sleep",
    "Rest makes routines harder",
    "Staying consistent",
    "I struggle to keep habits going",
    "Choose a constraint",
    "Pick the biggest blocker so I can keep your routine realistic.",
    "Personalize targets",
    "Optional — add fitness, body, steps, and water details.",
    "Add another suggestion",
    "Hide extra suggestions",
    "Routine couldn't be created",
    "We couldn't create any habits. Review your suggestions and try again.",
    "Some habits couldn't be created",
    "{created} of {total} habits were created. You can continue with those.",
    "Routine creation stopped",
    "We couldn't finish creating your routine. Review your suggestions and try again.",
  ]) {
    assert.notEqual(translate("hi", label), label, `missing Hindi treatment copy: ${label}`);
  }
});

test("first-run wizard touch targets expose web accessibility roles", () => {
  const wizardSource = readFileSync("app/habits/wizard.tsx", "utf8");
  const source = `${wizardSource}\n${readFileSync("components/first-log-flow.tsx", "utf8")}`;
  const touchTargets = wizardSource.match(/<TouchableOpacity\b/g) ?? [];
  const roles = wizardSource.match(/accessibilityRole=/g) ?? [];
  assert.equal(roles.length, touchTargets.length, "wizard has an unroled touch target");
  const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const label of [
    "Go back",
    "Select {label}",
    "Add {label}",
    "Remove {label}",
    "Create routine",
    "Enable reminders",
    "Complete",
    "Log {amount} {unit}",
    "Skip for now",
  ]) {
    assert.match(source, new RegExp(`"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }

  for (const label of [
    "Let's log your first habit together",
    "Tap below to log {amount} {unit} for {name}. That's your first step.",
    "First log: +{amount} {unit}",
    "Daily goal: {target} {unit}",
  ]) {
    assert.match(source, new RegExp(`"${escapeRegex(label)}"`));
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run wizard primary actions use text loading states", () => {
  const source = [
    readFileSync("app/habits/wizard.tsx", "utf8"),
    readFileSync("components/first-log-flow.tsx", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /ActivityIndicator/);
  assert.match(source, /disabled=\{creating\}/);
  assert.doesNotMatch(source, /disabled=\{(?:busy|completing)/);
  for (const label of ["Creating routine...", "Enabling...", "Completing...", "Logging..."]) {
    assert.match(source, new RegExp(`"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }
});

test("wizard routine creation synchronously rejects duplicate activation and always unlocks", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  assert.match(source, /const creatingRef = useRef\(false\)/);
  assert.match(
    source,
    /async function createRoutine\(\) \{\s*if \(creatingRef\.current\) return;\s*creatingRef\.current = true;/,
  );
  assert.match(source, /finally \{\s*creatingRef\.current = false;\s*setCreating\(false\);\s*\}/);
});

test("first-run wizard next button validates each step before advancing", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  assert.match(source, /function handleNextStep\(\)/);
  assert.match(source, /answers\.goals\.length === 0[\s\S]*showAlert\(t\("Choose a goal"\)/);
  assert.match(source, /stepIndex === STEPS\.length - 1 \? buildRoutine\(\) : handleNextStep\(\)/);
  assert.doesNotMatch(source, /stepIndex === STEPS\.length - 1 \? buildRoutine\(\) : setStepIndex/);
});

test("first-run wizard keeps its assigned control or treatment flow stable", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  assert.match(source, /const wizardModeRef = useRef<"control" \| "treatment" \| null>\(null\)/);
  assert.match(source, /if \(activation\.ready && wizardModeRef\.current === null\)/);
  assert.match(source, /const isTreatment = wizardModeRef\.current === "treatment"/);
});

test("first-run manual habit creation touch targets expose web accessibility roles", () => {
  for (const file of [
    "app/habits/new.tsx",
    "components/habit-form.tsx",
    "components/habit-catalog-picker.tsx",
    "components/habit-validation-modal.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  const routeSource = readFileSync("app/habits/new.tsx", "utf8");
  assert.match(routeSource, /"Go back"/);
  assert.notEqual(translate("hi", "Go back"), "Go back");

  const formSource = readFileSync("components/habit-form.tsx", "utf8");
  const pickerSource = readFileSync("components/habit-catalog-picker.tsx", "utf8");
  const inputRulesSource = readFileSync("lib/habits/input-rules.ts", "utf8");
  const manualCreationSource = `${formSource}\n${pickerSource}\n${inputRulesSource}`;
  for (const label of [
    "Select {label}",
    "Select color {label}",
    "Remove {label}",
    "Smart metric: {label}",
  ]) {
    assert.match(formSource, new RegExp(`"${label.replace(/[{}]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }

  for (const [label, forbiddenFragments] of [
    ["Use a valid 24-hour time, for example 08:30.", ["24-hour time"]],
    ["Add at least one reminder time or turn reminders off.", ["reminder time", "reminders"]],
    ["Use valid 24-hour reminder times.", ["24-hour reminder times"]],
    ["Choose valid reminder days.", ["reminder days"]],
    ["{litres} l will be saved as {millilitres} ml.", ["save"]],
    ["Water volume is saved in ml.", ["save"]],
    ["Store as {unit}", ["save"]],
    ["One smart reminder per day{suffix}.", ["smart reminder"]],
    ["Up to {count} smart reminders per day{suffix}.", ["smart reminders"]],
    ["CUSTOM OVERRIDE TIMES (optional)", ["override"]],
    ["Or build a custom habit.", ["custom habit"]],
    ["Build custom habit", ["Custom habit"]],
  ]) {
    assert.match(manualCreationSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const translated = translate("hi", label);
    for (const fragment of forbiddenFragments) {
      assert.doesNotMatch(
        translated,
        new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        `${label} leaks English fragment "${fragment}" into Hindi`,
      );
    }
  }

  assert.match(pickerSource, /"Choose template: \{label\}"/);
  assert.notEqual(translate("hi", "Choose template: {label}"), "Choose template: {label}");

  const validationSource = readFileSync("components/habit-validation-modal.tsx", "utf8");
  for (const label of [
    "Policy concern",
    "Health concern",
    "Unrealistic target",
    "We can't track this habit",
    "Let's double-check this habit",
    "This habit isn't something we can help you track.",
    "This habit looks unusual. Are you sure you want to continue?",
    "Suggested",
    "Tap to use these values",
    "Continue anyway",
  ]) {
    assert.match(validationSource, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run manual habit form primary action uses text loading state", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  assert.doesNotMatch(source, /ActivityIndicator/);
  assert.doesNotMatch(source, /disabled=\{loading \|\| !name\.trim\(\)\}/);
  assert.match(source, /if \(loading\) return;/);
  assert.match(source, /loading \? t\("Saving\.\.\."\) : t\(submitLabel\)/);
});

test("first-run dashboard touch targets expose web accessibility roles", () => {
  for (const file of ["app/(tabs)/index.tsx", "components/notification-permission-card.tsx"]) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  const source = readFileSync("app/(tabs)/index.tsx", "utf8");
  for (const label of ["Add habit", "Dismiss welcome"]) {
    assert.match(source, new RegExp(`t\\("${label}"\\)`));
    assert.notEqual(translate("hi", label), label);
  }

  const notificationSource = readFileSync("components/notification-permission-card.tsx", "utf8");
  for (const label of [
    "Get habit reminders on iPhone",
    "Tap Share → Add to Home Screen, then open Lagan from your home screen to enable notifications.",
    "Notifications are off — turn them on to get habit reminders.",
  ]) {
    assert.match(
      notificationSource,
      new RegExp(`t\\(\\s*"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
    );
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run habit detail and log prompt touch targets expose web accessibility roles", () => {
  for (const file of [
    "app/habits/[id]/index.tsx",
    "app/habits/[id]/edit.tsx",
    "components/log-prompt.tsx",
  ]) {
    const source = readFileSync(file, "utf8");
    const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
    const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
    assert.equal(roles.length, touchTargets.length, `${file} has an unroled touch target`);
  }

  const detailSource = readFileSync("app/habits/[id]/index.tsx", "utf8");
  for (const label of [
    "Go back",
    "Edit habit",
    "Delete habit",
    "day streak",
    "total logs",
    "THIS WEEK",
    "COMPLETION",
    "Current Streak",
    "Longest streak: {count} days",
    "Total",
    "Avg per log",
    "Recent History",
    "Yesterday",
    "No logs yet",
    "This week will fill in as you log this habit.",
    "Log a few days to see patterns.",
    "Log {value}",
    "Log custom amount",
    "Mark as done today",
    "Mark as undone",
    "Mark {name} as done today",
    "Mark {name} as undone",
  ]) {
    assert.match(detailSource, new RegExp(`t\\("${label.replace(/[{}]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }
  assert.match(detailSource, /isQuantityHabit\(habit\)[\s\S]*t\("Log custom amount"\)/);
  assert.match(detailSource, /t\(progress\.label\)/);
  assert.match(detailSource, /longestStreakFor\(habit, completions\)/);
  for (const label of ["Done today", "Not logged yet"]) {
    assert.notEqual(translate("hi", label), label);
  }
  for (const label of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    assert.notEqual(translate("hi", label), label);
  }

  const promptSource = readFileSync("components/log-prompt.tsx", "utf8");
  for (const label of ["Close log prompt", "Dismiss log prompt", "Log {value}", "Mark all done"]) {
    assert.match(promptSource, new RegExp(`t\\("${label.replace(/[{}]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }

  const editSource = readFileSync("app/habits/[id]/edit.tsx", "utf8");
  assert.match(editSource, /accessibilityLabel=\{t\("Go back"\)\}/);
  assert.match(editSource, /if \(!habit\)[\s\S]*accessibilityLabel=\{t\("Go back"\)\}/);
});

test("first-run habit detail does not overlay a floating log button on bottom actions", () => {
  const source = readFileSync("app/habits/[id]/index.tsx", "utf8");
  assert.doesNotMatch(source, /LogEntryFab/);
  assert.match(source, /setShowLogPrompt\(true\)/);
});

test("first-run coach card action targets expose web accessibility roles", () => {
  const source = readFileSync("components/coach-card.tsx", "utf8");
  const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
  const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
  assert.equal(roles.length, touchTargets.length, "coach card has an unroled touch target");

  for (const label of ["AI Coach", "Open habit"]) {
    assert.match(source, new RegExp(`t\\("${label}"\\)`));
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run habit cards expose localized accessible action labels", () => {
  const source = readFileSync("components/habit-card.tsx", "utf8");
  const touchTargets = source.match(/<TouchableOpacity\b/g) ?? [];
  const roles = source.match(/<TouchableOpacity\b[\s\S]*?accessibilityRole=/g) ?? [];
  assert.equal(roles.length, touchTargets.length, "habit card has an unroled touch target");

  for (const label of ["Open {name} details", "Mark {name} done", "Mark {name} not done"]) {
    assert.match(source, new RegExp(`t\\("${label.replace(/[{}]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label);
  }
  assert.match(source, /toggleAccessibilityLabel\?: string/);
  assert.match(source, /toggleAccessibilityLabel \?\?/);
  assert.match(source, /progress\s*\?\s*t\(progress\.label\)/);
  for (const label of ["Done today", "Not logged yet"]) {
    assert.notEqual(translate("hi", label), label);
  }
});

test("first-run dashboard labels quantity habit card actions as logging progress", () => {
  const source = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(source, /isQuantityHabit\(habit\)[\s\S]*t\("Log progress for \{name\}"/);
  assert.match(source, /toggleAccessibilityLabel=\{/);
  assert.notEqual(
    translate("hi", "Log progress for {name}", { name: "Water" }),
    "Log progress for Water",
  );
});

test("first-run dashboard greets users before prompting for notifications", () => {
  const source = readFileSync("app/(tabs)/index.tsx", "utf8");
  const greetingIndex = source.indexOf('t("Hey, {name}"');
  const notificationIndex = source.indexOf("<NotificationPermissionCard");

  assert.notEqual(greetingIndex, -1);
  assert.notEqual(notificationIndex, -1);
  assert.ok(
    greetingIndex < notificationIndex,
    "notification permission prompt should not be the first dashboard content",
  );
});

test("first-run dashboard uses a neutral greeting before the user sets a profile name", () => {
  assert.equal(
    dashboardDisplayName({
      profileDisplayName: null,
      fullName: null,
      email: "first-user-signup-smoke@example.invalid",
    }),
    "there",
  );
  assert.equal(
    dashboardDisplayName({
      profileDisplayName: "Ravi",
      fullName: "Ignored Name",
      email: "ravi@example.com",
    }),
    "Ravi",
  );
  assert.equal(
    dashboardDisplayName({
      profileDisplayName: "",
      fullName: "Ravi Kumar",
      email: "ravi@example.com",
    }),
    "Ravi Kumar",
  );
});

test("first-run habit cards render local visual surfaces without image decoding", () => {
  const source = readFileSync("components/habit-card.tsx", "utf8");
  assert.doesNotMatch(source, /ImageBackground/);
  assert.doesNotMatch(source, /getHabitImageForHabit/);
  assert.match(source, /getHabitVisualForHabit/);
});

test("first-run catalog thumbnails render local visual surfaces without image decoding", () => {
  const source = readFileSync("components/habit-catalog-picker.tsx", "utf8");
  assert.doesNotMatch(source, /\bImage\b/);
  assert.doesNotMatch(source, /getHabitImage/);
  assert.match(source, /getHabitVisual/);
});

test("first-run habit detail renders local visual surfaces without image decoding", () => {
  const source = readFileSync("app/habits/[id]/index.tsx", "utf8");
  assert.doesNotMatch(source, /ImageBackground/);
  assert.doesNotMatch(source, /getHabitImageForHabit/);
  assert.match(source, /getHabitVisualForHabit/);
  assert.match(source, /ProgressRing/);
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

test("tabs layout waits for the session and activation assignment before mounting protected tabs", () => {
  const source = readFileSync("app/(tabs)/_layout.tsx", "utf8");
  assert.match(source, /getCurrentSession/);
  assert.match(source, /useActivation/);
  assert.match(source, /Redirect/);
  assert.match(source, /if \(!sessionChecked \|\| !activation\.ready\) return null;/);
  assert.match(source, /if \(!hasSession\) return <Redirect href="\/login" \/>;/);
});

test("new habit screen waits for a session before mounting the habit form", () => {
  const source = readFileSync("app/habits/new.tsx", "utf8");
  assert.match(source, /getCurrentSession/);
  assert.match(source, /Redirect/);
  assert.match(source, /if \(!sessionChecked\) return null;/);
  assert.match(source, /if \(!hasSession\) return <Redirect href="\/login" \/>;/);
  assert.match(source, /<HabitForm\b/);
});

test("first-run wizard exit persists onboarding completion before returning home", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  const exitHandler = source.match(
    /async function handleExitWizard\(\)[\s\S]*?router\.replace\("\/\?newUser=1"\);[\s\S]*?\n  \}/,
  );

  assert.ok(exitHandler, "expected a dedicated wizard exit handler");
  assert.match(exitHandler[0], /completeCurrentUserOnboarding\(\)/);
  assert.match(
    source,
    /stepIndex === 0 \? handleExitWizard\(\) : setStepIndex\(\(value\) => value - 1\)/,
  );
  assert.match(
    source,
    /<FirstLogFlow[\s\S]*onFinished=\{\(\) => router\.replace\("\/\?newUser=1"\)\}/,
  );
});

test("empty dashboard manual habit creation persists onboarding completion", () => {
  const source = readFileSync("app/(tabs)/index.tsx", "utf8");
  const manualHandler = source.match(
    /async function handleChooseManualHabit\(\)[\s\S]*?router\.push\("\/habits\/new"\);[\s\S]*?\n  \}/,
  );

  assert.ok(manualHandler, "expected a manual habit creation handler");
  assert.match(manualHandler[0], /completeCurrentUserOnboarding\(\)/);
  assert.match(source, /onPress=\{handleChooseManualHabit\}/);
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
    "Track steps automatically with the app",
    "Automatic step tracking works in the Lagan iOS and Android app. Steps synced there appear here too — or log steps manually.",
    "Get the app",
    "Automatic sleep sync works in the Lagan iOS and Android app. Sleep synced there shows up here.",
    "Automatic sleep sync works in the Lagan iOS and Android app. You can still log sleep manually on web.",
    "Auto-sync needs the Lagan mobile app. On web, log steps manually.",
    "Auto-sync needs the Lagan mobile app. Synced sleep still shows here.",
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

  const otpUrl = authCallbackUrlFromParams("/auth/callback", {
    token_hash: "hashed-token",
    type: "recovery",
  });
  assert.equal(otpUrl, "/auth/callback?token_hash=hashed-token&type=recovery");
});

test("auth callback parser ignores unbound bearer tokens from query and fragment params", () => {
  const source = readFileSync("lib/auth/auth-redirect.ts", "utf8");

  assert.match(source, /code: firstParam\(allParams\.code\)/);
  assert.match(source, /tokenHash: firstParam\(allParams\.token_hash\)/);
  assert.doesNotMatch(source, /access_token|refresh_token|accessToken|refreshToken/);
});

test("auth callback completion paths do not install sessions from parsed bearer tokens", () => {
  const callbackScreen = readFileSync("app/auth/callback.tsx", "utf8");
  const nativeActions = readFileSync("lib/data/actions.ts", "utf8");

  assert.doesNotMatch(callbackScreen, /parsed\.accessToken|parsed\.refreshToken|setSession\(/);
  assert.doesNotMatch(nativeActions, /parsed\.accessToken|parsed\.refreshToken|setSession\(/);
  assert.match(callbackScreen, /supabase\.auth\.verifyOtp/);
  assert.match(callbackScreen, /isAppEmailOtpType\(parsed\.type\)/);
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

test("app date helpers validate and shift calendar date keys", () => {
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

test("completion period rules keep old undo available but reject future undo", () => {
  const now = new Date(2026, 4, 31, 12, 0);
  assert.equal(
    validateCompletionPeriod("2026-01-01", {
      now,
      operation: "undo",
      existingCompletion: true,
    }).ok,
    true,
  );
  assert.equal(
    validateCompletionPeriod("2026-06-01", {
      now,
      operation: "undo",
      existingCompletion: true,
    }).ok,
    false,
  );
});

test("habit input rules normalize names and reject active duplicates", () => {
  const existing = [
    { id: "h1", name: "Drink Water", archived_at: null },
    { id: "h2", name: "Archived Habit", archived_at: "2026-05-01T00:00:00Z" },
  ];

  assert.equal(normalizeHabitName("  Drink   Water  "), "Drink Water");
  assert.equal(validateHabitInput({ name: "   ", metricType: "boolean", target: null }).ok, false);
  assert.equal(
    validateHabitInput({
      name: "x".repeat(HABIT_NAME_MAX_LENGTH + 1),
      metricType: "boolean",
      target: null,
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

test("habit input rules bound targets and preserve decimal-capable logs", () => {
  assert.equal(validateHabitInput({ name: "Walk", metricType: "steps", target: null }).ok, false);
  assert.equal(validateHabitInput({ name: "Walk", metricType: "steps", target: 50001 }).ok, false);
  assert.equal(validateHabitInput({ name: "Walk", metricType: "steps", target: 10000 }).ok, true);
  assert.deepEqual(validateCompletionValue(10, { metricType: "minutes", target: 30 }), {
    ok: true,
    value: 10,
  });
  assert.equal(validateLogValueForHabit(31, { metricType: "minutes", target: 30 }).ok, false);
  assert.deepEqual(validateLogValueForHabit(0.5, { metricType: "distance_km", target: 5 }), {
    ok: true,
    value: 0.5,
  });
  assert.equal(validateLogValueForHabit(0.5, { metricType: "steps", target: 10000 }).ok, false);
});

test("schedule rules reject contradictions and normalize valid values", () => {
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

  assert.deepEqual(
    normalizeReminderSchedule({
      remindersEnabled: true,
      reminderStrategy: "manual",
      reminderTimes: ["08:30", "08:30", "20:00"],
      reminderDays: [5, 1, 1],
      reminderIntervalMinutes: null,
    }),
    {
      ok: true,
      data: {
        remindersEnabled: true,
        reminderTimes: ["08:30", "20:00"],
        reminderDays: [1, 5],
        reminderIntervalMinutes: null,
      },
    },
  );
});

test("data export is versioned, deterministic, and reports integrity issues", () => {
  const exported = buildDataExport({
    exportedAt: "2026-05-31T10:00:00.000Z",
    user: { id: "u1", email: "a@example.com" },
    profile: null,
    habits: [{ id: "h1", name: "Read", created_at: "2026-05-01T00:00:00.000Z" }],
    completions: [
      {
        id: "c2",
        habit_id: "missing",
        completed_on: "2026-05-31",
        created_at: "2026-05-31T08:00:00.000Z",
      },
      {
        id: "c1",
        habit_id: "h1",
        completed_on: "2026-05-31",
        created_at: "2026-05-31T07:00:00.000Z",
      },
      {
        id: "c3",
        habit_id: "h1",
        completed_on: "2026-05-31",
        created_at: "2026-05-31T09:00:00.000Z",
      },
    ],
    sleepEntries: [],
    feedback: [],
  });

  assert.equal(exported.schema_version, 1);
  assert.deepEqual(exported.integrity.counts, {
    profile: 0,
    habits: 1,
    completions: 3,
    sleep_entries: 0,
    feedback: 0,
  });
  assert.deepEqual(exported.integrity.duplicate_completion_periods, [
    {
      habit_id: "h1",
      completed_on: "2026-05-31",
      completion_ids: ["c1", "c3"],
    },
  ]);
  assert.deepEqual(exported.integrity.orphan_completion_ids, ["c2"]);
  assert.deepEqual(
    exported.completions.map((completion) => completion.id),
    ["c3", "c2", "c1"],
  );
});

test("data export sorts tied id-less rows by canonical content", () => {
  const exported = buildDataExport({
    exportedAt: "2026-05-31T10:00:00.000Z",
    user: { id: "u1", email: null },
    profile: null,
    habits: [
      { name: "Zulu", created_at: "2026-05-01T00:00:00.000Z" },
      { name: "Alpha", created_at: "2026-05-01T00:00:00.000Z" },
    ],
    completions: [],
    sleepEntries: [],
    feedback: [],
  });
  assert.deepEqual(
    exported.habits.map((habit) => habit.name),
    ["Alpha", "Zulu"],
  );
});

test("privacy export pagination probes past exact pages and advances by rows returned", async () => {
  const exportModule = await import("../lib/utils/paginated-select.ts");
  assert.equal(typeof exportModule.collectExportPages, "function");

  const exactRows = ["a", "b", "c", "d"];
  const exactCalls = [];
  const exact = await exportModule.collectExportPages(async (from, to) => {
    exactCalls.push([from, to]);
    return { data: exactRows.slice(from, to + 1), error: null };
  }, 2);
  assert.deepEqual(exact, { data: exactRows, error: null });
  assert.deepEqual(exactCalls, [
    [0, 1],
    [2, 3],
    [4, 5],
  ]);

  const cappedRows = [1, 2, 3, 4, 5];
  const cappedCalls = [];
  const capped = await exportModule.collectExportPages(async (from, to) => {
    cappedCalls.push([from, to]);
    return { data: cappedRows.slice(from, Math.min(from + 2, to + 1)), error: null };
  }, 4);
  assert.deepEqual(capped, { data: cappedRows, error: null });
  assert.deepEqual(
    cappedCalls.map(([from]) => from),
    [0, 2, 4, 5],
  );
});

test("privacy export pagination rejects returned and thrown page errors without partial data", async () => {
  const { collectExportPages } = await import("../lib/utils/paginated-select.ts");
  assert.equal(typeof collectExportPages, "function");
  const returnedError = { message: "page two failed" };
  let returnedCalls = 0;
  const returned = await collectExportPages(async () => {
    returnedCalls++;
    return returnedCalls === 1
      ? { data: [{ id: "first" }], error: null }
      : { data: null, error: returnedError };
  }, 1);
  assert.deepEqual(returned, { data: null, error: returnedError });
  assert.equal(returnedCalls, 2);

  const thrownError = new Error("transport failed");
  let thrownCalls = 0;
  const thrown = await collectExportPages(async () => {
    thrownCalls++;
    if (thrownCalls === 2) throw thrownError;
    return { data: [{ id: "first" }], error: null };
  }, 1);
  assert.deepEqual(thrown, { data: null, error: thrownError });
  assert.equal(thrownCalls, 2);
});

test("privacy export fails query errors instead of returning partial data", () => {
  const source = readFileSync("lib/utils/privacy.ts", "utf8");
  assert.match(source, /profileResult/);
  assert.match(source, /habitResult/);
  assert.match(source, /completionResult/);
  assert.match(source, /if \(result\.error\)/);
  assert.match(source, /buildDataExport/);
  assert.match(source, /fetchAllOwnedRows/);
  assert.match(source, /\.eq\("user_id", userId\)/);
  assert.match(source, /\.order\("id", \{ ascending: true \}\)/);
  assert.match(source, /\.range\(from, to\)/);
});

test("current app surfaces explain every core no-data state", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboard, /Build your first routine/);
  assert.match(dashboard, /Choose manually/);

  const detail = readFileSync("app/habits/[id]/index.tsx", "utf8");
  assert.match(detail, /No logs yet/);
  assert.match(detail, /This week will fill in as you log this habit/);
  assert.match(detail, /Log a few days to see patterns/);

  const achievements = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.match(achievements, /No badges earned yet/);

  const privacy = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacy, /Includes integrity checks for counts, duplicates, and orphaned logs/);
});

test("validation, export integrity, and no-data copy is localized in Hindi", () => {
  for (const label of [
    "Habit name is required.",
    "A habit with this name already exists.",
    "Target is above the allowed maximum.",
    "This week will fill in as you log this habit.",
    "Log a few days to see patterns.",
    "No badges earned yet.",
    "Includes integrity checks for counts, duplicates, and orphaned logs.",
    "Some changes didn't sync",
    "A previous offline change didn't sync.",
    "Review the affected habit and save or delete it again.",
    "Review habit",
    "Dismiss",
    "Dismissing this notice will not apply the change.",
  ]) {
    assert.notEqual(translate("hi", label), label, `Missing Hindi translation for ${label}`);
  }
});

test("habit mutation queue persists and merges idempotent patches by habit", async () => {
  const memory = new Map();
  const storage = {
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
  };
  const queue = createHabitMutationQueueStore(storage);

  await queue.enqueue({
    id: "op-1",
    kind: "update",
    habitId: "h1",
    userId: "u1",
    payload: { name: "Read", reminder_times: ["08:00"] },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  await queue.enqueue({
    id: "op-2",
    kind: "update",
    habitId: "h1",
    userId: "u1",
    payload: { reminder_times: ["09:00"] },
    queuedAt: "2026-07-11T10:01:00.000Z",
  });

  const reloaded = createHabitMutationQueueStore(storage);
  assert.deepEqual(await reloaded.read(), [
    {
      id: "op-2",
      kind: "update",
      habitId: "h1",
      userId: "u1",
      payload: { name: "Read", reminder_times: ["09:00"] },
      queuedAt: "2026-07-11T10:01:00.000Z",
    },
  ]);
});

test("habit archive remains terminal when compacted with an existing update", async () => {
  let raw = null;
  const queue = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  await queue.enqueue({
    id: "update",
    kind: "update",
    habitId: "h1",
    userId: "u1",
    payload: { name: "Read daily" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  await queue.enqueue({
    id: "archive",
    kind: "archive",
    habitId: "h1",
    userId: "u1",
    payload: { archived_at: "2026-07-11T10:02:00.000Z", reminders_enabled: false },
    queuedAt: "2026-07-11T10:02:00.000Z",
  });

  const [operation] = await queue.read();
  assert.equal(operation.kind, "archive");
  assert.deepEqual(operation.payload, {
    name: "Read daily",
    archived_at: "2026-07-11T10:02:00.000Z",
    reminders_enabled: false,
  });
});

test("confirmed habit supersession is scoped and preserves a concurrent replacement", async () => {
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  const operation = (id, userId, habitId, payload = { reminders_enabled: true }) => ({
    id,
    kind: "update",
    habitId,
    userId,
    payload,
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  await store.enqueue(operation("failed-target", "user-1", "habit-1"));
  await store.settleRejected("failed-target", {
    reason: "rejected",
    failedAt: "2026-07-11T10:01:00.000Z",
  });
  await store.enqueue(
    operation("old-target", "user-1", "habit-1", {
      name: "Read offline",
      reminders_enabled: false,
    }),
  );
  await store.enqueue(operation("old-target", "user-1", "habit-2"));
  await store.enqueue(operation("old-target", "user-2", "habit-1"));

  const boundary = await store.captureSupersessionBoundary("user-1", "habit-1");
  assert.deepEqual(
    (await store.read()).map(({ id }) => id),
    ["old-target", "old-target", "old-target"],
    "capturing the boundary must not mutate the journal before server success",
  );

  await store.enqueue(operation("new-target", "user-1", "habit-1", { reminders_enabled: false }));
  await store.settleSuperseded(
    boundary,
    { name: "Read online", reminders_enabled: true },
    { resolveFailures: true },
  );

  assert.deepEqual(
    (await store.read()).map(({ userId, habitId, id, payload }) => [userId, habitId, id, payload]),
    [
      ["user-1", "habit-2", "old-target", { reminders_enabled: true }],
      ["user-2", "habit-1", "old-target", { reminders_enabled: true }],
      ["user-1", "habit-1", "new-target", { reminders_enabled: false }],
    ],
  );
  assert.deepEqual(await store.readFailures("user-1", "habit-1"), []);

  const replacementBoundary = await store.captureSupersessionBoundary("user-1", "habit-1");
  await store.settleSuperseded(replacementBoundary, { reminders_enabled: false });
  assert.deepEqual(
    (await store.read()).map(({ userId, habitId, id }) => [userId, habitId, id]),
    [
      ["user-1", "habit-2", "old-target"],
      ["user-2", "habit-1", "old-target"],
    ],
  );
});

test("a confirmed reminder write keeps non-overlapping queued habit fields", async () => {
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  await store.enqueue({
    id: "failed",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Earlier name" },
    queuedAt: "2026-07-11T09:00:00.000Z",
  });
  await store.settleRejected("failed", {
    reason: "rejected",
    failedAt: "2026-07-11T09:05:00.000Z",
  });
  await store.enqueue({
    id: "pending-full-edit",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: {
      name: "Offline name",
      reminders_enabled: false,
      reminder_times: ["08:00"],
    },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  const boundary = await store.captureSupersessionBoundary("user-1", "habit-1");

  await store.settleSuperseded(boundary, {
    reminders_enabled: true,
    reminder_times: ["09:00"],
  });

  assert.deepEqual(await store.read(), [
    {
      id: "pending-full-edit",
      kind: "update",
      habitId: "habit-1",
      userId: "user-1",
      payload: { name: "Offline name" },
      queuedAt: "2026-07-11T10:00:00.000Z",
    },
  ]);
  assert.equal(
    (await store.readFailures("user-1", "habit-1"))[0]?.operationId,
    "failed",
    "a reminder-only success must not dismiss an unrelated full-edit failure",
  );
});

test("habit supersession keeps the journal intact when settlement storage fails", async () => {
  let raw = null;
  let rejectWrites = false;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = value;
    },
    async removeItem() {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = null;
    },
  });
  await store.enqueue({
    id: "pending",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { reminders_enabled: true },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });
  const boundary = await store.captureSupersessionBoundary("user-1", "habit-1");

  rejectWrites = true;
  await assert.rejects(
    store.settleSuperseded(boundary, { reminders_enabled: false }),
    /storage unavailable/,
  );
  rejectWrites = false;

  assert.deepEqual(
    (await store.read()).map(({ id }) => id),
    ["pending"],
  );
});

test("duplicate merges wait for an in-flight habit replay before writing", async () => {
  let coordinatorModule = null;
  try {
    coordinatorModule = await import("../lib/data/habit-mutation-write-coordinator.ts");
  } catch {
    // The assertion below keeps the first TDD failure focused on the missing
    // coordinator instead of aborting the whole test module during import.
  }
  assert.equal(
    typeof coordinatorModule?.createHabitMutationWriteCoordinator,
    "function",
    "habit replay and direct merges need one shared network-write coordinator",
  );

  const runExclusive = coordinatorModule.createHabitMutationWriteCoordinator();
  const { reconcileHabitMutationQueue } = await import("../lib/data/habit-mutation-queue-store.ts");
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  await store.enqueue({
    id: "offline-edit",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Offline name" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  let markReplayStarted;
  const replayStarted = new Promise((resolve) => {
    markReplayStarted = resolve;
  });
  let releaseReplay;
  const replayReleased = new Promise((resolve) => {
    releaseReplay = resolve;
  });
  const serverState = { name: "Stored name" };
  const commitOrder = [];

  const flush = runExclusive(() =>
    reconcileHabitMutationQueue({
      store,
      userId: "user-1",
      async send(operation) {
        markReplayStarted();
        await replayReleased;
        Object.assign(serverState, operation.payload);
        commitOrder.push("replay");
        return { ok: true };
      },
    }),
  );
  await replayStarted;

  let mergeStarted = false;
  const merge = runExclusive(async () => {
    mergeStarted = true;
    const boundary = await store.captureSupersessionBoundary("user-1", "habit-1");
    Object.assign(serverState, { name: "Merged name" });
    commitOrder.push("merge");
    await store.settleSuperseded(boundary, { name: "Merged name" });
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mergeStarted, false, "merge must wait while an older replay can still commit");

  releaseReplay();
  await Promise.all([flush, merge]);

  assert.deepEqual(commitOrder, ["replay", "merge"]);
  assert.deepEqual(serverState, { name: "Merged name" });
  assert.deepEqual(await store.read(), []);
});

test("habit replay and duplicate merge use the same write coordinator", () => {
  const queueSource = readFileSync("lib/data/habit-mutation-queue.ts", "utf8");
  assert.match(
    queueSource,
    /runHabitMutationWriteExclusive\(runFlush\)/,
    "the coordinator must cover the replay read, send, and settlement transaction",
  );

  const actionsSource = readFileSync("lib/data/actions.ts", "utf8");
  const mergeStart = actionsSource.indexOf(
    "return runHabitMutationWriteExclusive(async (): Promise<HabitCreateResult> => {",
  );
  const mergeEnd = actionsSource.indexOf("export async function updateHabitFull", mergeStart);
  const mergeSource = actionsSource.slice(mergeStart, mergeEnd);
  assert.match(
    mergeSource,
    /runHabitMutationWriteExclusive[\s\S]*listPendingHabitMutations[\s\S]*scoreHabitSimilarity[\s\S]*enqueueHabitMutation[\s\S]*\.update\(staged\.payload\)[\s\S]*settleConfirmedQueuedMutation/,
    "the coordinator must cover effective ranking, durable staging, server write, and settlement",
  );
});

test("habit mutation journal migrates legacy queues and persists acknowledged failures", async () => {
  const queueModule = await import("../lib/data/habit-mutation-queue-store.ts");
  assert.equal(typeof queueModule.reconcileHabitMutationQueue, "function");
  assert.equal(typeof queueModule.HABIT_MUTATION_JOURNAL_STORAGE_KEY, "string");

  const legacy = {
    id: "legacy-op",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { name: "Read daily" },
    queuedAt: "2026-07-11T10:00:00.000Z",
  };
  const memory = new Map([
    [queueModule.HABIT_MUTATION_JOURNAL_STORAGE_KEY, JSON.stringify([legacy])],
  ]);
  const store = createHabitMutationQueueStore({
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
  });

  assert.deepEqual(await store.read(), [legacy]);
  const failure = await store.settleRejected("legacy-op", {
    reason: "rejected",
    code: "42501",
    failedAt: "2026-07-11T10:05:00.000Z",
  });
  assert.equal(failure?.operationId, "legacy-op");
  assert.equal("payload" in failure, false);
  assert.deepEqual(await store.read(), []);
  assert.deepEqual(await store.readFailures("other-user"), []);
  assert.equal((await store.readFailures("user-1")).length, 1);

  await store.acknowledgeFailures("other-user", [failure.id]);
  assert.equal((await store.readFailures("user-1")).length, 1);
  await store.acknowledgeFailures("user-1", [failure.id]);
  assert.deepEqual(await store.readFailures("user-1"), []);
});

test("habit mutation failures are bounded and queue overflow becomes visible", async () => {
  const queueModule = await import("../lib/data/habit-mutation-queue-store.ts");
  const memory = new Map();
  const store = createHabitMutationQueueStore({
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
  });

  for (let index = 0; index <= 100; index++) {
    await store.enqueue({
      id: `overflow-${index}`,
      kind: "update",
      habitId: `habit-${index}`,
      userId: "user-1",
      payload: { reminders_enabled: index % 2 === 0 },
      queuedAt: `2026-07-11T10:${String(index % 60).padStart(2, "0")}:00.000Z`,
    });
  }
  assert.equal((await store.read()).length, 100);
  assert.equal((await store.readFailures("user-1"))[0]?.reason, "queue_full");

  for (let index = 0; index < queueModule.MAX_HABIT_RECONCILIATION_FAILURES + 5; index++) {
    const operation = {
      id: `rejected-${index}`,
      kind: "update",
      habitId: `rejected-habit-${index}`,
      userId: "user-1",
      payload: { reminders_enabled: true },
      queuedAt: "2026-07-11T11:00:00.000Z",
    };
    await store.enqueue(operation);
    await store.settleRejected(operation.id, {
      reason: "rejected",
      code: "23514",
      failedAt: "2026-07-11T11:01:00.000Z",
    });
  }
  assert.equal(
    (await store.readFailures("user-1")).length,
    queueModule.MAX_HABIT_RECONCILIATION_FAILURES,
  );
});

test("habit mutation stays pending when its failure record cannot be persisted", async () => {
  let raw = null;
  let rejectWrites = false;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = value;
    },
    async removeItem() {
      if (rejectWrites) throw new Error("storage unavailable");
      raw = null;
    },
  });
  await store.enqueue({
    id: "pending-until-recorded",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { reminders_enabled: true },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  rejectWrites = true;
  await assert.rejects(
    store.settleRejected("pending-until-recorded", {
      reason: "rejected",
      failedAt: "2026-07-11T10:05:00.000Z",
    }),
    /storage unavailable/,
  );
  rejectWrites = false;
  assert.deepEqual(
    (await store.read()).map((operation) => operation.id),
    ["pending-until-recorded"],
  );
  assert.deepEqual(await store.readFailures("user-1"), []);
});

test("habit mutation journal keeps only the newest failure per user and habit", async () => {
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  for (const id of ["old-failure", "new-failure"]) {
    await store.enqueue({
      id,
      kind: "update",
      habitId: "habit-1",
      userId: "user-1",
      payload: { reminders_enabled: true },
      queuedAt: "2026-07-11T10:00:00.000Z",
    });
    await store.settleRejected(id, {
      reason: "rejected",
      failedAt: "2026-07-11T10:05:00.000Z",
    });
  }
  assert.deepEqual(
    (await store.readFailures("user-1")).map((failure) => failure.operationId),
    ["new-failure"],
  );
});

test("permanent habit rejection is quarantined while later mutations continue", async () => {
  const { reconcileHabitMutationQueue } = await import("../lib/data/habit-mutation-queue-store.ts");
  const memory = new Map();
  const store = createHabitMutationQueueStore({
    async getItem(key) {
      return memory.get(key) ?? null;
    },
    async setItem(key, value) {
      memory.set(key, value);
    },
    async removeItem(key) {
      memory.delete(key);
    },
  });
  for (const operation of [
    { id: "reject-me", habitId: "habit-1" },
    { id: "save-me", habitId: "habit-2" },
  ]) {
    await store.enqueue({
      ...operation,
      kind: "update",
      userId: "user-1",
      payload: { reminders_enabled: true },
      queuedAt: "2026-07-11T10:00:00.000Z",
    });
  }

  const sent = [];
  const result = await reconcileHabitMutationQueue({
    store,
    userId: "user-1",
    failedAt: () => "2026-07-11T10:05:00.000Z",
    async send(operation) {
      sent.push(operation.id);
      return operation.id === "reject-me"
        ? { ok: false, retry: false, reason: "rejected", code: "42501" }
        : { ok: true };
    },
  });
  assert.deepEqual(sent, ["reject-me", "save-me"]);
  assert.deepEqual(
    result.succeeded.map((operation) => operation.id),
    ["save-me"],
  );
  assert.deepEqual(
    result.rejected.map((failure) => failure.operationId),
    ["reject-me"],
  );
  assert.deepEqual(await store.read(), []);
  assert.equal((await store.readFailures("user-1")).length, 1);
});

test("concurrent replacement suppresses stale failures and remains replayable", async () => {
  const { reconcileHabitMutationQueue } = await import("../lib/data/habit-mutation-queue-store.ts");
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  await store.enqueue({
    id: "old",
    kind: "update",
    habitId: "habit-1",
    userId: "user-1",
    payload: { reminders_enabled: false },
    queuedAt: "2026-07-11T10:00:00.000Z",
  });

  const sent = [];
  await reconcileHabitMutationQueue({
    store,
    userId: "user-1",
    failedAt: () => "2026-07-11T10:05:00.000Z",
    async send(operation) {
      sent.push(operation.id);
      if (operation.id === "old") {
        await store.enqueue({
          id: "new",
          kind: "update",
          habitId: "habit-1",
          userId: "user-1",
          payload: { reminders_enabled: true },
          queuedAt: "2026-07-11T10:04:00.000Z",
        });
        return { ok: false, retry: false, reason: "rejected", code: "42501" };
      }
      return { ok: true };
    },
  });
  assert.deepEqual(sent, ["old", "new"]);
  assert.deepEqual(await store.read(), []);
  assert.deepEqual(await store.readFailures("user-1"), []);
});

test("retryable habit failures stop replay without dropping later mutations", async () => {
  const { reconcileHabitMutationQueue } = await import("../lib/data/habit-mutation-queue-store.ts");
  let raw = null;
  const store = createHabitMutationQueueStore({
    async getItem() {
      return raw;
    },
    async setItem(_key, value) {
      raw = value;
    },
    async removeItem() {
      raw = null;
    },
  });
  for (const id of ["offline", "later"]) {
    await store.enqueue({
      id,
      kind: "update",
      habitId: id,
      userId: "user-1",
      payload: { reminders_enabled: true },
      queuedAt: "2026-07-11T10:00:00.000Z",
    });
  }
  const sent = [];
  await reconcileHabitMutationQueue({
    store,
    userId: "user-1",
    async send(operation) {
      sent.push(operation.id);
      return { ok: false, retry: true };
    },
  });
  assert.deepEqual(sent, ["offline"]);
  assert.deepEqual(
    (await store.read()).map((operation) => operation.id),
    ["offline", "later"],
  );
  assert.deepEqual(await store.readFailures("user-1"), []);
});

test("habit reconciliation failures are visible and dismissible on sync paths", () => {
  for (const path of [
    "app/(tabs)/index.tsx",
    "app/habits/[id]/edit.tsx",
    "app/habits/[id]/index.tsx",
    "app/(tabs)/settings/reminders.tsx",
  ]) {
    assert.match(readFileSync(path, "utf8"), /HabitSyncIssueBanner/, path);
  }
  const queueSource = readFileSync("lib/data/habit-mutation-queue.ts", "utf8");
  assert.match(queueSource, /listHabitReconciliationFailures/);
  assert.match(queueSource, /acknowledgeHabitReconciliationFailures/);
  assert.match(queueSource, /\.select\("id"\)[\s\S]*\.maybeSingle\(\)/);
  assert.match(queueSource, /reason: "not_found"/);

  const banner = readFileSync("components/habit-sync-issue-banner.tsx", "utf8");
  assert.match(banner, /accessibilityRole="alert"/);
  assert.match(banner, /acknowledgeHabitReconciliationFailures/);
  assert.match(banner, /reviewableHabitIds/);
  assert.match(banner, /Review habit/);
  assert.match(banner, /Dismiss/);

  assert.match(readFileSync("app/(tabs)/index.tsx", "utf8"), /reviewableHabitIds/);
  assert.match(readFileSync("app/(tabs)/settings/reminders.tsx", "utf8"), /reviewableHabitIds/);
});

test("habit actions stage exact absolute patches before direct writes", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actions, /enqueueHabitMutation/);
  assert.match(actions, /flushPendingHabitMutations/);
  assert.match(actions, /settleConfirmedQueuedMutation/);
  assert.match(actions, /isRetryableHabitMutationError/);
  assert.match(actions, /kind: "increment_once"/);
  assert.equal(
    (actions.match(/await enqueueHabitMutation\(\{/g) ?? []).length,
    4,
    "merge, save, reminder, and archive writes must durably stage before sending",
  );
  assert.equal(
    (actions.match(/await settleConfirmedQueuedMutation\(/g) ?? []).length,
    4,
    "only confirmed merge, save, reminder, and archive writes may settle staged operations",
  );
  assert.equal(
    (actions.match(/await flushPendingHabitMutations\(\)/g) ?? []).length,
    3,
    "queued habit patches must settle before a newer direct update",
  );

  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboard, /flushPendingHabitMutations/);
});

test("offline edits may reach the idempotent update queue without a duplicate-name read", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actions, /currentHabitId && isNetworkFailure\(error\)/);
  assert.match(actions, /activeHabits[^=]*= \[\]/);
});

test("habit form validation errors are accessible beyond color", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(source, /accessibilityRole="alert"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.match(source, /alert-circle-outline/);
  assert.match(source, /Error: \{message\}/);
});

test("habit form and actions share normalized habit and schedule rules", () => {
  const formSource = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(formSource, /validateHabitInput/);
  assert.match(formSource, /normalizeReminderSchedule/);

  const actionSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionSource, /validateHabitMutationInput/);
  assert.match(actionSource, /validateHabitInput/);
  assert.match(actionSource, /normalizeReminderSchedule/);
});

test("completion actions enforce date periods without replacing exact-once queueing", () => {
  const source = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(source, /validateCompletionPeriod/);
  assert.match(source, /validateCompletionValue/);
  assert.equal(
    (source.match(/validateCompletionIncrement\(value \?\? 1, habit\)/g) ?? []).length,
    2,
    "regular and exact-once increments must share metric-aware validation",
  );
  assert.match(source, /completedOn = localDateKey\(\)/);
  assert.match(source, /p_completed_on: completedOn/);
  assert.match(source, /kind: "increment_once"/);
  assert.match(source, /operationId/);
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

test("habit streak integration applies reminder days and the documented display grace", async () => {
  const streakModule = await import("../lib/coach/streak.ts");
  assert.equal(typeof streakModule.habitStreakFromDates, "function");

  const scheduledDates = ["2026-06-05", "2026-06-03", "2026-06-01"];
  assert.equal(
    streakModule.habitStreakFromDates(
      scheduledDates,
      [1, 3, 5],
      new Date(2026, 5, 7, 12, 0), // Sunday is not scheduled.
    ),
    3,
  );

  const dailyDates = ["2026-05-30", "2026-05-29"];
  assert.equal(
    streakModule.habitStreakFromDates(dailyDates, [0, 1, 2, 3, 4, 5, 6], new Date(2026, 4, 31, 8)),
    2,
  );
  assert.equal(
    streakModule.habitStreakFromDates(dailyDates, [0, 1, 2, 3, 4, 5, 6], new Date(2026, 4, 31, 12)),
    0,
  );

  const habitsSource = readFileSync("lib/data/habits.ts", "utf8");
  const remindersSource = readFileSync("lib/data/reminders.ts", "utf8");
  assert.match(
    habitsSource,
    /habitStreakFromDates\(completedDatesForHabit\(habit, completionRows\), habit\.reminder_days\)/,
  );
  assert.match(
    habitsSource,
    /habitStreakFromDates\([\s\S]*?completedDatesForHabit\(habit, completions\),[\s\S]*?habit\.reminder_days,[\s\S]*?from/,
  );
  assert.match(
    remindersSource,
    /habitStreakFromDates\(\[\.\.\.completedDates\], habit\.reminder_days, now\)/,
  );
});

test("scheduled streak skips unscheduled days and breaks on a missed scheduled day", () => {
  const from = new Date(2026, 5, 5, 12, 0); // Friday
  assert.equal(
    streakForSchedule(["2026-06-05", "2026-06-03", "2026-06-01"], {
      from,
      scheduledDays: [1, 3, 5],
    }),
    3,
  );
  assert.equal(
    streakForSchedule(["2026-06-05", "2026-06-01"], {
      from,
      scheduledDays: [1, 3, 5],
    }),
    1,
  );
});

test("scheduled streak grace cutoff displays yesterday only before cutoff", () => {
  const dates = ["2026-05-30", "2026-05-29"];
  assert.equal(
    streakForSchedule(dates, {
      from: new Date(2026, 4, 31, 8, 0),
      graceCutoffHour: 10,
    }),
    2,
  );
  assert.equal(
    streakForSchedule(dates, {
      from: new Date(2026, 4, 31, 12, 0),
      graceCutoffHour: 10,
    }),
    0,
  );
});

test("backfilled completion restores a scheduled streak", () => {
  const from = new Date(2026, 5, 5, 12, 0);
  assert.equal(
    streakForSchedule(["2026-06-05", "2026-06-01"], {
      from,
      scheduledDays: [1, 3, 5],
    }),
    1,
  );
  assert.equal(
    streakForSchedule(["2026-06-05", "2026-06-03", "2026-06-01"], {
      from,
      scheduledDays: [1, 3, 5],
    }),
    3,
  );
});

test("longestStreakFromDates finds the longest run anywhere in history", () => {
  assert.equal(longestStreakFromDates([]), 0);
  assert.equal(longestStreakFromDates(["2026-06-01"]), 1);
  // A 3-day run in the past beats a 2-day run ending today.
  assert.equal(
    longestStreakFromDates(["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-10", "2026-06-11"]),
    3,
  );
  // Duplicates collapse, unsorted input is fine.
  assert.equal(longestStreakFromDates(["2026-06-02", "2026-06-01", "2026-06-02"]), 2);
  // Runs spanning a month boundary count as consecutive.
  assert.equal(longestStreakFromDates(["2026-06-30", "2026-07-01", "2026-07-02"]), 3);
});

test("reminderTimeFor accepts only zero-padded HH:MM reminder values", () => {
  assert.equal(reminderTimeFor({ reminder_times: ["07:45"], reminder_time: null }), "07:45");
  // First reminder of the day wins; legacy single column is the fallback.
  assert.equal(
    reminderTimeFor({ reminder_times: ["08:15", "20:00"], reminder_time: "06:00" }),
    "08:15",
  );
  assert.equal(reminderTimeFor({ reminder_times: null, reminder_time: "21:30" }), "21:30");
  // A legacy "HH:MM:SS" time-column value is normalized.
  assert.equal(reminderTimeFor({ reminder_times: null, reminder_time: "07:45:00" }), "07:45");
  assert.equal(reminderTimeFor({ reminder_times: null, reminder_time: null }), null);
  assert.equal(reminderTimeFor({ reminder_times: [], reminder_time: "7:45" }), null);
  assert.equal(reminderTimeFor({ reminder_times: ["25:00"], reminder_time: null }), null);
});

test("orderHabitsForTimeline sorts timed habits first and keeps untimed order", () => {
  const habits = [
    { id: "a", reminder_times: null, reminder_time: null },
    { id: "b", reminder_times: ["21:00"], reminder_time: null },
    { id: "c", reminder_times: ["07:30"], reminder_time: null },
    { id: "d", reminder_times: null, reminder_time: null },
  ];
  const entries = orderHabitsForTimeline(habits);
  assert.deepEqual(
    entries.map((entry) => [entry.habit.id, entry.time]),
    [
      ["c", "07:30"],
      ["b", "21:00"],
      ["a", null],
      ["d", null],
    ],
  );
});

test("nowMarkerIndex slots after the last passed reminder and hides without timed habits", () => {
  const entries = [{ time: "07:30" }, { time: "21:00" }, { time: null }];
  assert.equal(nowMarkerIndex(entries, "06:00"), 0);
  assert.equal(nowMarkerIndex(entries, "08:18"), 1);
  assert.equal(nowMarkerIndex(entries, "21:00"), 2);
  assert.equal(nowMarkerIndex(entries, "23:59"), 2);
  assert.equal(nowMarkerIndex([{ time: null }, { time: null }], "12:00"), null);
  assert.equal(nowMarkerIndex([], "12:00"), null);
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

test("first-run habit visuals do not depend on remote image hosts", () => {
  const source = readFileSync("lib/data/habit-images.ts", "utf8");
  assert.doesNotMatch(source, /https?:\/\//);

  for (const habit of [
    { habit_type: "water_intake", name: "Drink Water", icon: "water", unit: "ml" },
    { habit_type: "custom", name: "Focus Session", icon: "timer", unit: "min" },
    { habit_type: "walk", name: "Walk", icon: "walk", unit: "steps" },
    { habit_type: "workout", name: "Workout", icon: "dumbbell", unit: "min" },
  ]) {
    const image = getHabitImageForHabit(habit);
    assert.doesNotMatch(image, /^https?:\/\//, `${habit.name} uses a remote image URL`);
  }
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

test("suggested check-ins use positive default chunks and clamp to remaining targets", () => {
  assert.equal(typeof habitIntelligence.suggestedCheckInForHabit, "function");
  const habit = {
    id: "h1",
    name: "Drink Water",
    description: null,
    icon: "water_drop",
    target: 1000,
    unit: "ml",
    default_log_value: 250,
  };

  assert.deepEqual(
    habitIntelligence.suggestedCheckInForHabit(habit, progressForHabit(habit, null)),
    {
      value: 250,
      unit: "ml",
      remainingBefore: 1000,
      remainingAfter: 750,
      completesGoal: false,
      label: "250 ml",
    },
  );
  assert.deepEqual(
    habitIntelligence.suggestedCheckInForHabit(habit, progressForHabit(habit, { value: 900 })),
    {
      value: 100,
      unit: "ml",
      remainingBefore: 100,
      remainingAfter: 0,
      completesGoal: true,
      label: "100 ml",
    },
  );
  assert.equal(
    habitIntelligence.suggestedCheckInForHabit(habit, progressForHabit(habit, { value: 1000 })),
    null,
  );

  assert.equal(
    habitIntelligence.suggestedCheckInForHabit(
      { ...habit, default_log_value: 0 },
      progressForHabit(habit, null),
    ),
    null,
  );
  assert.equal(
    habitIntelligence.suggestedCheckInForHabit(
      { ...habit, target: null },
      progressForHabit({ ...habit, target: null }, null),
    ),
    null,
  );
});

test("completed-day helpers ignore partial target rows and credit targetless rows", () => {
  assert.equal(typeof habitIntelligence.isHabitCompletionDone, "function");
  assert.equal(typeof habitIntelligence.completedDatesForHabit, "function");
  const targetHabit = {
    id: "water",
    name: "Drink Water",
    description: null,
    icon: "water_drop",
    target: 1000,
    unit: "ml",
  };
  const completions = [
    { habit_id: "water", completed_on: "2026-05-10", value: 250 },
    { habit_id: "water", completed_on: "2026-05-11", value: 1000 },
    { habit_id: "other", completed_on: "2026-05-12", value: 1 },
  ];

  assert.equal(habitIntelligence.isHabitCompletionDone(targetHabit, completions[0]), false);
  assert.equal(habitIntelligence.isHabitCompletionDone(targetHabit, completions[1]), true);
  assert.deepEqual(habitIntelligence.completedDatesForHabit(targetHabit, completions), [
    "2026-05-11",
  ]);
  assert.equal(
    habitIntelligence.isHabitCompletionDone({ ...targetHabit, target: null }, { value: null }),
    true,
  );
  assert.equal(
    habitIntelligence.isHabitCompletionDone({ ...targetHabit, target: 0 }, { value: 0 }),
    true,
  );
});

test("completion value payload stores absolute values", () => {
  assert.deepEqual(
    buildCompletionValuePayload("habit-1", "user-1", "2026-05-14", 1234.9, " synced "),
    {
      habit_id: "habit-1",
      user_id: "user-1",
      completed_on: "2026-05-14",
      value: 1234.9,
      note: "synced",
    },
  );
  assert.throws(
    () => buildCompletionValuePayload("habit-1", "user-1", "2026-05-14", 0),
    /positive number/,
  );
});

test("completion replay rejects corrupted non-positive values without throwing", () => {
  const source = readFileSync("lib/data/completion-queue.ts", "utf8");
  assert.match(source, /!Number\.isFinite\(value\) \|\| value <= 0/);
  assert.match(source, /Invalid queued completion value/);
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

test("step sync identity suppresses snapshot reload loops but changes at midnight", () => {
  const today = stepSyncIdentity("habit:steps:8000", "2026-05-14");
  assert.equal(shouldStartAutomaticStepSync(null, today), true);
  assert.equal(shouldStartAutomaticStepSync(today, today), false);
  assert.equal(
    shouldStartAutomaticStepSync(today, stepSyncIdentity("habit:steps:8000", "2026-05-15")),
    true,
  );
});

test("watched steps remain monotonic and require a fresh snapshot after midnight", () => {
  assert.deepEqual(
    resolveWatchedStepTotal({
      sessionDate: "2026-05-14",
      currentDate: "2026-05-14",
      baseline: 4000,
      lastTotal: 4250,
      sessionSteps: 500,
    }),
    { kind: "updated", total: 4500 },
  );
  assert.deepEqual(
    resolveWatchedStepTotal({
      sessionDate: "2026-05-14",
      currentDate: "2026-05-14",
      baseline: 4000,
      lastTotal: 4500,
      sessionSteps: 100,
    }),
    { kind: "unchanged", total: 4500 },
  );
  assert.deepEqual(
    resolveWatchedStepTotal({
      sessionDate: "2026-05-14",
      currentDate: "2026-05-15",
      baseline: 4000,
      lastTotal: 4500,
      sessionSteps: 600,
    }),
    { kind: "rollover" },
  );
  assert.deepEqual(
    resolveWatchedStepTotal({
      sessionDate: "2026-05-14",
      currentDate: "2026-05-14",
      baseline: 0,
      lastTotal: 0,
      sessionSteps: 0,
    }),
    { kind: "unchanged", total: 0 },
  );
});

test("dashboard step coordinator guards sync and clears revoked permission state", () => {
  const source = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(source, /if \(stepSyncInFlightRef\.current\) return false/);
  assert.match(source, /permission !== "granted"[\s\S]*?clearStepTrackingSession\(\)/);
  assert.match(source, /if \(!snapshot\.canWatch\)[\s\S]*?removeStepWatcher\(\)/);
  assert.match(source, /stepTrackingIdentityRef\.current = identity/);
  assert.match(source, /syncStepHabit\(habit, false, true, true\)/);
  assert.match(
    source,
    /const onRefresh = useCallback\([\s\S]*?await syncStepHabit\(stepHabit, false, true\)/,
  );
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
  assert.equal(normalized?.stageMinutes?.core, 90);
  assert.equal(normalized?.stageMinutes?.deep, 120);
  assert.equal(normalized?.stageMinutes?.awake, 270);
});

test("health connect sleep normalization maps every stage constant", () => {
  const start = new Date("2026-05-13T22:00:00.000Z");
  const stages = Array.from({ length: 8 }, (_, stage) => ({
    startTime: new Date(start.getTime() + stage * 10 * 60000).toISOString(),
    endTime: new Date(start.getTime() + (stage + 1) * 10 * 60000).toISOString(),
    stage,
  }));
  const normalized = normalizeHealthConnectSleepSessions([
    { startTime: stages[0].startTime, endTime: stages[7].endTime, stages },
  ]);

  assert.deepEqual(normalized?.stageMinutes, {
    awake: 20,
    asleep: 10,
    outOfBed: 10,
    core: 10,
    deep: 10,
    rem: 10,
  });
});

test("health connect sleep uses aggregate duration and deduplicates raw sessions", () => {
  const sessions = [
    { startTime: "2026-05-13T22:00:00.000Z", endTime: "2026-05-14T06:00:00.000Z" },
    { startTime: "2026-05-13T23:00:00.000Z", endTime: "2026-05-14T07:00:00.000Z" },
  ];
  const fallback = normalizeHealthConnectSleepSessions(sessions);
  const aggregate = normalizeHealthConnectSleepSessions(sessions, {
    canonicalDurationSeconds: 8 * 60 * 60,
    sourceOrigins: ["watch.app", "phone.app", "watch.app"],
  });

  assert.equal(fallback?.durationMinutes, 540);
  assert.equal(aggregate?.durationMinutes, 480);
  assert.deepEqual(aggregate?.sourceMetadata, {
    recordCount: 2,
    durationStrategy: "healthConnectAggregate",
    sourceOrigins: ["phone.app", "watch.app"],
    stageDataAmbiguous: false,
  });
});

test("sleep stage normalization merges duplicates and drops conflicting detail", () => {
  const duplicateCore = {
    startTime: "2026-05-13T22:00:00.000Z",
    endTime: "2026-05-14T06:00:00.000Z",
    stage: 4,
  };
  const deduped = normalizeHealthConnectSleepSessions([
    {
      startTime: duplicateCore.startTime,
      endTime: duplicateCore.endTime,
      stages: [duplicateCore, duplicateCore],
    },
  ]);
  const ambiguous = normalizeHealthConnectSleepSessions([
    {
      startTime: duplicateCore.startTime,
      endTime: duplicateCore.endTime,
      stages: [duplicateCore, { ...duplicateCore, stage: 5 }],
    },
  ]);

  assert.deepEqual(deduped?.stageMinutes, { core: 480 });
  assert.equal(deduped?.sourceMetadata.stageDataAmbiguous, false);
  assert.equal(ambiguous?.stageMinutes, null);
  assert.equal(ambiguous?.sourceMetadata.stageDataAmbiguous, true);
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

test("healthkit duration merges duplicate sources and rejects conflicting stages", () => {
  const core = {
    startDate: "2026-05-13T22:30:00.000Z",
    endDate: "2026-05-14T06:30:00.000Z",
    value: 3,
    sourceRevision: { source: { bundleIdentifier: "watch.app" } },
  };
  const duplicate = {
    ...core,
    sourceRevision: { source: { bundleIdentifier: "sleep.app" } },
  };
  const deduped = normalizeHealthKitSleepSamples([core, duplicate]);
  const ambiguous = normalizeHealthKitSleepSamples([core, { ...duplicate, value: 4 }]);

  assert.equal(deduped?.durationMinutes, 480);
  assert.deepEqual(deduped?.stageMinutes, { core: 480 });
  assert.deepEqual(deduped?.sourceMetadata.sourceOrigins, ["sleep.app", "watch.app"]);
  assert.equal(ambiguous?.durationMinutes, 480);
  assert.equal(ambiguous?.stageMinutes, null);
  assert.equal(ambiguous?.sourceMetadata.stageDataAmbiguous, true);
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
  assert.equal(buildSleepCompletionValue(455), 7.6);
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

test("bundling caps and deduplicates active reminder arrays", () => {
  const merged = mergeHabitReminders(
    {
      enabled: true,
      times: ["05:00", "05:00", "04:00", "03:00", "02:00", "01:00"],
      days: [6, 6, 5, 4, 3, 2, 1, 0],
    },
    {
      enabled: true,
      times: ["00:00", "06:00", "07:00", "08:00", "09:00", "10:00"],
      days: [0, 1, 2, 3, 4, 5, 6],
    },
  );

  assert.deepEqual(merged.times, [
    "00:00",
    "01:00",
    "02:00",
    "03:00",
    "04:00",
    "05:00",
    "06:00",
    "07:00",
  ]);
  assert.deepEqual(merged.days, [0, 1, 2, 3, 4, 5, 6]);
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

test("smart-reminders context sanitizer bounds progress before Gemini input", async () => {
  const { sanitizeSmartReminderContexts } =
    await import("../supabase/functions/_shared/smart-reminder-input.ts");
  const context = {
    habitId: "water-1",
    habitName: "Drink water",
    habitType: "water_intake",
    metricType: "volume_ml",
    strategy: "interval",
    intervalMinutes: 120,
    target: 2000,
    unit: "ml",
    progress: {
      current: 250,
      target: 2000,
      ratio: 0.125,
      label: "250 / 2000 ml",
      nested: { ignored: "x".repeat(1000) },
    },
    completions: [{ completedOn: "2026-05-08", createdAt: "2026-05-08T10:00:00.000Z", value: 250 }],
    manualTimes: ["10:00", "10:00", "not-a-time"],
    reminderDays: [1, 1, 2, 9],
    streak: 2,
    typicalHour: 10,
    currentTime: "09:15",
  };

  const sanitized = sanitizeSmartReminderContexts([context]);
  assert.equal(sanitized?.length, 1);
  assert.deepEqual(sanitized?.[0].progress, {
    current: 250,
    target: 2000,
    ratio: 0.125,
    label: "250 / 2000 ml",
  });
  assert.deepEqual(sanitized?.[0].manualTimes, ["10:00"]);
  assert.deepEqual(sanitized?.[0].reminderDays, [1, 2]);
  const controlSanitized = sanitizeSmartReminderContexts([
    { ...context, habitName: "Drink\u0000water", unit: "m\u0007l" },
  ]);
  assert.equal(controlSanitized?.[0].habitName, "Drink water");
  assert.equal(controlSanitized?.[0].unit, "m l");
  assert.equal(
    sanitizeSmartReminderContexts([
      { ...context, progress: { ...context.progress, label: "x".repeat(121) } },
    ]),
    null,
  );
});

test("smart-reminders sanitizes contexts before quota and Gemini input", () => {
  const source = readFileSync("supabase/functions/smart-reminders/index.ts", "utf8");
  const sanitizeIndex = source.indexOf(
    "const contexts = sanitizeSmartReminderContexts(body.contexts)",
  );
  const quotaIndex = source.indexOf('enforceAiQuota(admin, user.id, "smart-reminders")');
  const geminiIndex = source.indexOf("const response = await generateContent(");

  assert.match(
    source,
    /import \{ sanitizeSmartReminderContexts \} from "\.\.\/_shared\/smart-reminder-input\.ts"/,
  );
  assert.ok(sanitizeIndex >= 0, "expected context sanitization");
  assert.ok(quotaIndex > sanitizeIndex, "contexts must be sanitized before quota consumption");
  assert.ok(geminiIndex > sanitizeIndex, "contexts must be sanitized before Gemini input");
  assert.match(source, /contexts,/);
  assert.doesNotMatch(source, /progress: isRecord\(item\.progress\) \? item\.progress : \{\}/);
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

const treatmentAnswers = (patch = {}) => ({
  goals: ["energy"],
  lifestyle: "office",
  sleep: "okay",
  workload: "normal",
  stress: "medium",
  fitnessLevel: "beginner",
  age: null,
  heightCm: null,
  weightKg: null,
  stepsBaseline: null,
  waterBaseline: null,
  constraint: "energy",
  ...patch,
});

test("treatment quick start exposes the exact constraint priorities and overlays", async () => {
  const { QUICK_START_CONSTRAINT_PRIORITIES, applyQuickStartConstraint } =
    await import("../lib/coach/treatment-quick-start.ts");

  assert.deepEqual(QUICK_START_CONSTRAINT_PRIORITIES, {
    time: ["posture", "meditate", "water"],
    energy: ["water", "walk", "sleep"],
    stress: ["meditate", "walk", "sleep"],
    sleep: ["sleep", "screen-limit", "meditate"],
    consistency: ["water", "walk", "read"],
  });
  assert.equal(applyQuickStartConstraint(treatmentAnswers(), "time").workload, "high");
  assert.equal(applyQuickStartConstraint(treatmentAnswers(), "stress").stress, "high");
  assert.equal(applyQuickStartConstraint(treatmentAnswers(), "sleep").sleep, "poor");
  assert.deepEqual(applyQuickStartConstraint(treatmentAnswers(), "energy"), treatmentAnswers());
  assert.deepEqual(
    applyQuickStartConstraint(treatmentAnswers(), "consistency"),
    treatmentAnswers(),
  );
});

test("treatment recommendations order goal then constraint then context and preselect two", async () => {
  const { buildTreatmentRecommendations } = await import("../lib/coach/treatment-quick-start.ts");

  const ordered = buildTreatmentRecommendations(
    treatmentAnswers({ goals: ["learning"], constraint: "time", lifestyle: "office" }),
  );
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["read", "revision", "focus", "posture", "meditate"],
  );
  assert.deepEqual(
    ordered.map((item) => item.selected),
    [true, true, false, false, false],
  );

  const deduped = buildTreatmentRecommendations(treatmentAnswers());
  assert.ok(deduped.length >= 3 && deduped.length <= 5);
  assert.equal(deduped.filter((item) => item.selected).length, 2);
  assert.equal(new Set(deduped.map((item) => item.id)).size, deduped.length);
  const nonCustomTypes = deduped
    .filter((item) => item.habitType !== "custom")
    .map((item) => item.habitType);
  assert.equal(new Set(nonCustomTypes).size, nonCustomTypes.length);
  assert.deepEqual(
    deduped.map((item) => item.id),
    ["water", "walk", "sleep", "posture"],
  );
});

test("collapsed treatment review keeps the first two cards visible after selection changes", async () => {
  const { buildTreatmentRecommendations, getVisibleTreatmentRecommendations } =
    await import("../lib/coach/treatment-quick-start.ts");
  const recommendations = buildTreatmentRecommendations(treatmentAnswers()).map((item, index) => ({
    ...item,
    selected: index === 2,
  }));

  assert.deepEqual(
    getVisibleTreatmentRecommendations(recommendations, false).map((item) => item.id),
    recommendations.slice(0, 2).map((item) => item.id),
  );
  assert.deepEqual(
    getVisibleTreatmentRecommendations(recommendations, true).map((item) => item.id),
    recommendations.map((item) => item.id),
  );
});

test("treatment caps every constrained metric and never logs above a positive target", async () => {
  const { QUICK_START_TARGET_CAPS, applyTreatmentConstraintCaps, clampDefaultLogValuesToTargets } =
    await import("../lib/coach/treatment-quick-start.ts");

  assert.deepEqual(Object.keys(QUICK_START_TARGET_CAPS), [
    "time",
    "energy",
    "stress",
    "consistency",
  ]);

  for (const [constraint, caps] of Object.entries(QUICK_START_TARGET_CAPS)) {
    for (const [metricType, cap] of Object.entries(caps)) {
      const capped = applyTreatmentConstraintCaps(
        [
          {
            ...recommendation(`${constraint}-${metricType}`, "custom"),
            metricType,
            target: cap * 2,
            defaultLogValue: cap * 3,
          },
        ],
        constraint,
      )[0];
      assert.equal(capped.target, cap, `${constraint}/${metricType} target cap`);
      assert.equal(capped.defaultLogValue, cap, `${constraint}/${metricType} default log cap`);
    }
  }

  const sleepUncapped = applyTreatmentConstraintCaps(
    [{ ...recommendation("Sleep", "sleep"), metricType: "hours", target: 9, defaultLogValue: 12 }],
    "sleep",
  )[0];
  assert.equal(sleepUncapped.target, 9);
  assert.equal(sleepUncapped.defaultLogValue, 9);

  const explicitEdit = clampDefaultLogValuesToTargets([
    { ...recommendation("Edited target", "custom"), target: 7, defaultLogValue: 50 },
  ])[0];
  assert.equal(explicitEdit.target, 7);
  assert.equal(explicitEdit.defaultLogValue, 7);
});

test("treatment AI normalization fills 3-5 unique suggestions and selects exactly two", async () => {
  const { buildTreatmentRecommendations, normalizeTreatmentRecommendations } =
    await import("../lib/coach/treatment-quick-start.ts");
  const timeAnswers = treatmentAnswers({ constraint: "time" });
  const fallback = buildTreatmentRecommendations(timeAnswers);
  const ai = [
    {
      ...fallback[0],
      id: "ai-water",
      name: "Gentle hydration",
      target: 9000,
      defaultLogValue: 12000,
      selected: false,
    },
    { ...fallback[1], id: "ai-walk", name: "Gentle walk", selected: false },
  ];
  const normalized = normalizeTreatmentRecommendations(ai, fallback, timeAnswers);

  assert.ok(normalized.length >= 3 && normalized.length <= 5);
  assert.equal(normalized.filter((item) => item.selected).length, 2);
  assert.deepEqual(
    normalized.map((item) => item.selected),
    normalized.map((_, index) => index < 2),
  );
  assert.equal(
    new Set(
      normalized.map((item) =>
        item.habitType === "custom" ? `custom:${item.id}` : item.habitType,
      ),
    ).size,
    normalized.length,
  );
  assert.ok(
    normalized.every(
      (item) =>
        item.target == null ||
        item.target <= 0 ||
        item.defaultLogValue == null ||
        item.defaultLogValue <= item.target,
    ),
  );
  assert.ok((normalized.find((item) => item.id === "ai-water")?.target ?? Infinity) <= 1500);

  const customAnswers = treatmentAnswers({ goals: ["learning"], constraint: "time" });
  const customFallback = buildTreatmentRecommendations(customAnswers);
  const customSeed = customFallback.find((item) => item.habitType === "custom");
  assert.ok(customSeed);
  const customDeduped = normalizeTreatmentRecommendations(
    [
      { ...customSeed, id: "ai-custom-one", name: "  Gentle Reset  " },
      { ...customSeed, id: "ai-custom-two", name: "gentle reset" },
    ],
    customFallback,
    customAnswers,
  );
  assert.equal(
    customDeduped.filter((item) => item.name.trim().toLowerCase() === "gentle reset").length,
    1,
  );

  const sparse = normalizeTreatmentRecommendations([fallback[0]], [fallback[0]], timeAnswers);
  assert.ok(sparse.length >= 3 && sparse.length <= 5);
  assert.equal(sparse.filter((item) => item.selected).length, 2);
});

test("treatment AI replacement guard rejects stale or interacted reviews", async () => {
  const { shouldApplyTreatmentAiResult } = await import("../lib/coach/treatment-quick-start.ts");
  const current = {
    reviewActive: true,
    requestId: 3,
    currentRequestId: 3,
    interactionVersion: 4,
    currentInteractionVersion: 4,
  };
  assert.equal(shouldApplyTreatmentAiResult(current), true);
  assert.equal(shouldApplyTreatmentAiResult({ ...current, reviewActive: false }), false);
  assert.equal(shouldApplyTreatmentAiResult({ ...current, currentRequestId: 5 }), false);
  assert.equal(shouldApplyTreatmentAiResult({ ...current, currentInteractionVersion: 5 }), false);
});

test("treatment create outcomes distinguish auth, zero, mixed, and complete saves", async () => {
  const { classifyTreatmentCreateOutcome } = await import("../lib/coach/treatment-quick-start.ts");
  assert.deepEqual(classifyTreatmentCreateOutcome(true, [], 2), {
    status: "signed_out",
    successfulCount: 0,
    totalCount: 2,
    failedIndices: [],
  });
  assert.equal(
    classifyTreatmentCreateOutcome(true, [{ ok: true, id: "ignored" }], 1).status,
    "signed_out",
  );
  assert.deepEqual(
    classifyTreatmentCreateOutcome(
      false,
      [
        { ok: false, id: null },
        { ok: false, id: null },
      ],
      2,
    ),
    {
      status: "none_created",
      successfulCount: 0,
      totalCount: 2,
      failedIndices: [0, 1],
    },
  );
  assert.deepEqual(
    classifyTreatmentCreateOutcome(
      false,
      [
        { ok: true, id: "created" },
        { ok: false, id: null },
        { ok: true, id: "merged" },
      ],
      3,
    ),
    {
      status: "partially_created",
      successfulCount: 2,
      totalCount: 3,
      failedIndices: [1],
    },
  );
  assert.equal(
    classifyTreatmentCreateOutcome(
      false,
      [
        { ok: true, id: "created" },
        { ok: true, id: "merged" },
      ],
      2,
    ).status,
    "all_created",
  );
  assert.deepEqual(classifyTreatmentCreateOutcome(false, [{ ok: true, id: null }], 2), {
    status: "none_created",
    successfulCount: 0,
    totalCount: 2,
    failedIndices: [0, 1],
  });
});

async function loadRoutineCreateContract() {
  const module = await import("../lib/habits/routine-create.ts").catch(() => null);
  assert.ok(module, "expected the routine create sequence contract");
  return module;
}

function routineSuccess(id) {
  return { ok: true, id, habit: { id } };
}

test("routine creation retains positional successes around a thrown network failure", async () => {
  const { runRoutineCreateSequence } = await loadRoutineCreateContract();
  const calls = [];
  const outcome = await runRoutineCreateSequence(["first", "offline", "third"], async (item) => {
    calls.push(item);
    if (item === "offline") throw new TypeError("Failed to fetch");
    return routineSuccess(item);
  });

  assert.deepEqual(calls, ["first", "offline", "third"]);
  assert.equal(outcome.authLost, false);
  assert.equal(outcome.results.length, 3);
  assert.equal(outcome.results[0].id, "first");
  assert.equal(outcome.results[1].ok, false);
  assert.equal(outcome.results[1].failureKind, "network");
  assert.equal(outcome.results[2].id, "third");
});

test("routine creation stops after auth loss while retaining earlier results", async () => {
  const { runRoutineCreateSequence } = await loadRoutineCreateContract();
  const calls = [];
  const authError = Object.assign(new Error("JWT expired"), {
    code: "PGRST301",
    status: 401,
  });
  const outcome = await runRoutineCreateSequence(["first", "auth", "never"], async (item) => {
    calls.push(item);
    if (item === "auth") throw authError;
    return routineSuccess(item);
  });

  assert.deepEqual(calls, ["first", "auth"]);
  assert.equal(outcome.authLost, true);
  assert.equal(outcome.results.length, 2);
  assert.equal(outcome.results[0].id, "first");
  assert.equal(outcome.results[1].failureKind, "auth");
});

test("routine validation exceptions are categorized without erasing later successes", async () => {
  const { createHabitFailure, runRoutineCreateSequence } = await loadRoutineCreateContract();
  const outcome = await runRoutineCreateSequence(["invalid", "valid"], async (item) => {
    if (item === "invalid") {
      return createHabitFailure(new Error("validator unavailable"), "validation");
    }
    return routineSuccess(item);
  });

  assert.equal(outcome.authLost, false);
  assert.equal(outcome.results[0].failureKind, "validation");
  assert.equal(outcome.results[1].id, "valid");
});

test("zero-success routine failures preserve network validation and save categories", async () => {
  const { createHabitFailure, routineZeroSuccessCategory } = await loadRoutineCreateContract();
  assert.equal(
    routineZeroSuccessCategory([createHabitFailure(new Error("Failed to fetch"))]),
    "network",
  );
  assert.equal(
    routineZeroSuccessCategory([
      createHabitFailure(new Error("validator unavailable"), "validation"),
    ]),
    "validation",
  );
  assert.equal(
    routineZeroSuccessCategory([createHabitFailure(new Error("constraint rejected"))]),
    "save_failed",
  );
  assert.equal(
    routineZeroSuccessCategory([
      createHabitFailure(new Error("validator unavailable"), "validation"),
      createHabitFailure(new Error("Network request failed")),
    ]),
    "network",
  );
});

test("habit mutations return authoritative rows through the resilient routine sequence", () => {
  const source = readFileSync("lib/data/actions.ts", "utf8");
  const routineBlock =
    source.match(/export async function createRoutineHabits[\s\S]*?(?=\nasync function)/)?.[0] ??
    "";
  const createBlock =
    source.match(/async function createHabitForUser[\s\S]*?(?=\nexport async function)/)?.[0] ?? "";

  assert.match(source, /runRoutineCreateSequence/);
  assert.match(routineBlock, /authLost/);
  assert.match(createBlock, /\.select\("\*"\)\s*\.single\(\)/);
  assert.match(createBlock, /habit:/);
  assert.match(createBlock, /createHabitFailure/);
});

test("wizard blocks auth loss with accurate retained-success analytics", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  const signedOutIndex = source.indexOf("if (signedOut)");
  const successfulCountIndex = source.indexOf("const successfulCount");
  assert.ok(successfulCountIndex >= 0 && successfulCountIndex < signedOutIndex);
  const signedOutBlock = source.slice(
    signedOutIndex,
    source.indexOf("const failures", signedOutIndex),
  );
  assert.match(signedOutBlock, /created:\s*successfulCount/);
  assert.match(signedOutBlock, /failed:\s*selected\.length - successfulCount/);
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
    metricType: habitType === "water_intake" ? "volume_ml" : "boolean",
    visualType: habitType === "water_intake" ? "water_bottle" : "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: null,
    defaultLogValue: habitType === "water_intake" ? 250 : null,
    remindersEnabled: false,
    reminderTimes: [],
    reminderDays: [0, 1, 2, 3, 4, 5, 6],
    mergeSimilar: true,
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
  assert.equal(created[0].metricType, "volume_ml");
  assert.equal(created[0].defaultLogValue, 250);
  assert.equal(created[1].name, "Sleep");
});

test("buildCreatedHabits drops ok results without an id and handles empty input", () => {
  assert.deepEqual(buildCreatedHabits([], []), []);
  assert.deepEqual(
    buildCreatedHabits([recommendation("Walk", "walk")], [{ ok: true, id: null }]),
    [],
  );
});

test("buildCreatedHabits uses authoritative merged metadata for confirmation and first log", () => {
  const selected = [recommendation("Drink Water", "water_intake")];
  const authoritative = {
    id: "existing-water",
    name: "Hydration",
    icon: "cup-water",
    color: "secondary",
    unit: "l",
    target: 3,
    habit_type: "water_intake",
    metric_type: "volume_ml",
    visual_type: "water_bottle",
    reminder_strategy: "interval",
    reminder_interval_minutes: 90,
    default_log_value: 300,
  };

  const [created] = buildCreatedHabits(selected, [
    { ok: true, id: authoritative.id, merged: true, habit: authoritative },
  ]);

  assert.deepEqual(created, {
    id: "existing-water",
    name: "Hydration",
    icon: "cup-water",
    color: "secondary",
    unit: "ml",
    target: 3000,
    habitType: "water_intake",
    metricType: "volume_ml",
    defaultLogValue: 300,
  });
  assert.deepEqual(getTutorialHabitAction(created), { kind: "log_progress", value: 300 });
});

async function loadFirstLogFlowContract() {
  const module = await import("../lib/coach/first-log-flow.ts").catch(() => null);
  assert.ok(module, "expected the shared first-log flow contract module");
  return module;
}

test("first-log flow orders tutorial, celebration, notification, and done", async () => {
  const { firstLogFlowReducer, initialFirstLogFlowState } = await loadFirstLogFlowContract();
  const started = firstLogFlowReducer(initialFirstLogFlowState, { type: "action_started" });
  assert.deepEqual(started, { phase: "tutorial", actionInFlight: true, error: null });

  const celebrated = firstLogFlowReducer(started, { type: "action_succeeded" });
  assert.deepEqual(celebrated, {
    phase: "celebration",
    actionInFlight: false,
    error: null,
  });

  const notification = firstLogFlowReducer(celebrated, {
    type: "celebration_continued",
    offerNotifications: true,
  });
  assert.equal(notification.phase, "notification");
  assert.equal(firstLogFlowReducer(notification, { type: "notification_resolved" }).phase, "done");
});

test("first-log failures stay retryable and skip or back never returns to tutorial", async () => {
  const { firstLogFlowReducer, initialFirstLogFlowState } = await loadFirstLogFlowContract();
  const failed = firstLogFlowReducer(
    firstLogFlowReducer(initialFirstLogFlowState, { type: "action_started" }),
    { type: "action_failed", error: "offline" },
  );
  assert.deepEqual(failed, {
    phase: "tutorial",
    actionInFlight: false,
    error: "offline",
  });
  assert.equal(
    firstLogFlowReducer(failed, { type: "action_started" }).actionInFlight,
    true,
    "a failed first action can be retried",
  );
  assert.equal(firstLogFlowReducer(initialFirstLogFlowState, { type: "skipped" }).phase, "done");

  const celebration = {
    phase: "celebration",
    actionInFlight: false,
    error: null,
  };
  assert.equal(firstLogFlowReducer(celebration, { type: "back_pressed" }).phase, "done");
  assert.equal(
    firstLogFlowReducer(celebration, {
      type: "celebration_continued",
      offerNotifications: false,
    }).phase,
    "done",
  );
});

test("first-log action guard rejects rapid duplicate activation synchronously", async () => {
  const { createFirstLogActionGuard } = await loadFirstLogFlowContract();
  const guard = createFirstLogActionGuard();
  assert.equal(guard.isInFlight(), false);
  assert.equal(guard.tryStart(), true);
  assert.equal(guard.isInFlight(), true);
  assert.equal(guard.tryStart(), false);
  guard.finish();
  assert.equal(guard.isInFlight(), false);
  assert.equal(guard.tryStart(), true);
});

test("first-step presentation preserves quantity and boolean tutorial actions", async () => {
  const { buildFirstStepPresentation } = await loadFirstLogFlowContract();
  assert.deepEqual(
    buildFirstStepPresentation({
      id: "water",
      name: "Drink Water",
      icon: "water_drop",
      color: "secondary",
      unit: "ml",
      target: 1500,
      habitType: "water_intake",
      metricType: "volume_ml",
      defaultLogValue: 250,
    }),
    {
      kind: "quantity",
      habitName: "Drink Water",
      amount: 250,
      unit: "ml",
      action: { kind: "log_progress", value: 250 },
    },
  );
  assert.deepEqual(
    buildFirstStepPresentation({
      id: "journal",
      name: "Journal",
      icon: "edit_note",
      color: "primary",
      unit: "",
      target: null,
      habitType: "journal",
      metricType: "boolean",
      defaultLogValue: null,
    }),
    {
      kind: "boolean",
      habitName: "Journal",
      action: { kind: "complete" },
    },
  );
});

test("notification offer is user-scoped, durable before display, and fail-safe", async () => {
  const {
    firstLogNotificationOfferKey,
    prepareFirstLogNotificationOffer,
    shouldOfferFirstLogNotification,
  } = await loadFirstLogFlowContract();
  assert.notEqual(firstLogNotificationOfferKey("user-a"), firstLogNotificationOfferKey("user-b"));
  assert.equal(shouldOfferFirstLogNotification("undetermined", false), true);
  assert.equal(shouldOfferFirstLogNotification("undetermined", true), false);
  assert.equal(shouldOfferFirstLogNotification("granted", false), false);
  assert.equal(shouldOfferFirstLogNotification("denied", false), false);

  const values = new Map();
  const dependencies = {
    getPermissionStatus: async () => "undetermined",
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => values.set(key, value),
  };
  assert.equal(await prepareFirstLogNotificationOffer("", dependencies), false);
  assert.equal(values.size, 0, "an unknown user must not write a shared marker");
  assert.equal(await prepareFirstLogNotificationOffer("user-a", dependencies), true);
  assert.equal(values.get(firstLogNotificationOfferKey("user-a")), "1");
  assert.equal(await prepareFirstLogNotificationOffer("user-a", dependencies), false);
  assert.equal(await prepareFirstLogNotificationOffer("user-b", dependencies), true);

  assert.equal(
    await prepareFirstLogNotificationOffer("user-c", {
      ...dependencies,
      getPermissionStatus: async () => {
        throw new Error("permission unavailable");
      },
    }),
    false,
  );
  assert.equal(
    await prepareFirstLogNotificationOffer("user-d", {
      ...dependencies,
      setItem: async () => {
        throw new Error("storage unavailable");
      },
    }),
    false,
  );
});

test("shared first-log component owns guarded tutorial, celebration, and notification screens", () => {
  const path = "components/first-log-flow.tsx";
  assert.equal(existsSync(path), true, "expected a reusable FirstLogFlow component");
  const source = readFileSync(path, "utf8");
  assert.match(source, /export default function FirstLogFlow|export function FirstLogFlow/);
  assert.match(source, /createFirstLogActionGuard/);
  assert.match(source, /prepareFirstLogNotificationOffer/);
  assert.match(source, /logCompletion/);
  assert.match(source, /toggleHabit/);
  assert.match(source, /BackHandler\.addEventListener/);
  assert.match(source, /t\("First Step"\)/);
  assert.match(source, /phase === "tutorial"/);
  assert.match(source, /phase === "celebration"/);
  assert.match(source, /phase === "notification"/);
  assert.match(source, /disabled=\{state\.actionInFlight\}/);
  assert.match(
    source,
    /BackHandler\.addEventListener[\s\S]*?actionGuardRef\.current\.isInFlight\(\)/,
  );
  assert.match(source, /function handleSkip\(\)[\s\S]*?actionGuardRef\.current\.isInFlight\(\)/);
  assert.match(source, /accessibilityRole="summary"/);
  assert.match(source, /accessibilityLiveRegion="polite"/);
  assert.doesNotMatch(source, /useCelebrate|celebrate\(/);
});

test("first-step celebration copy is localized in Hindi", () => {
  for (const label of [
    "You logged {amount} {unit} for {name}.",
    "You completed {name}.",
    "Let's complete your first habit together",
    "Tap below to mark {name} complete. That's your first win.",
    "Could not complete habit",
    "Stay on track with reminders",
    "Allow notifications so we can nudge you at your reminder times. If several habits share a time, we'll bundle them into one reminder.",
  ]) {
    assert.notEqual(translate("hi", label), label);
  }
});

test("wizard confirmation enters the shared first-log flow before any notification offer", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  assert.match(source, /import FirstLogFlow from "@\/components\/first-log-flow"/);
  assert.match(source, /type PostCreatePhase = "confirm" \| "first_log" \| null/);
  assert.match(source, /onContinue=\{\(\) => setPostPhase\("first_log"\)\}/);
  assert.match(source, /<FirstLogFlow/);
  assert.match(source, /userId=\{firstLogUserId\}/);
  assert.doesNotMatch(source, /function NotificationPrimerScreen/);
  assert.doesNotMatch(source, /function TutorialScreen/);
  assert.doesNotMatch(source, /useCelebrate|celebrate\(/);
  assert.doesNotMatch(source, /setNeedsNotifPrimer|getPermissionStatus\(\)/);
});

test("manual post-create conversion prefers the authoritative habit and safely falls back", async () => {
  const module = await import("../lib/coach/post-onboarding.ts");
  assert.equal(
    typeof module.resolveManualCreatedHabit,
    "function",
    "expected a manual post-create conversion helper",
  );

  const fallback = {
    id: "created-id",
    name: "Draft reading",
    icon: "menu_book",
    color: "primary",
    unit: "pages",
    target: 10,
    habitType: "read",
    metricType: "pages",
    visualType: "reading_book",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 25,
  };
  const saved = {
    id: "merged-id",
    name: "Authoritative reading",
    icon: "edit_note",
    color: "secondary",
    unit: "pages",
    target: 12,
    habit_type: "read",
    metric_type: "pages",
    visual_type: "reading_book",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: 4,
  };

  assert.deepEqual(module.resolveManualCreatedHabit(saved, fallback), {
    id: "merged-id",
    name: "Authoritative reading",
    icon: "edit_note",
    color: "secondary",
    unit: "pages",
    target: 12,
    habitType: "read",
    metricType: "pages",
    defaultLogValue: 4,
  });

  const legacySaved = {
    ...saved,
    id: "legacy-id",
    name: "Drink Water",
    icon: "water_drop",
    color: "tertiary",
    unit: "ml",
    target: 1200,
    habit_type: null,
    metric_type: null,
    visual_type: null,
    reminder_strategy: null,
    reminder_interval_minutes: null,
    default_log_value: null,
  };
  const legacy = module.resolveManualCreatedHabit(legacySaved, fallback);
  assert.equal(legacy.habitType, "water_intake");
  assert.equal(legacy.metricType, "volume_ml");
  assert.equal(legacy.defaultLogValue, 250);

  const safeFallback = module.resolveManualCreatedHabit(null, fallback);
  assert.equal(safeFallback.id, "created-id");
  assert.equal(safeFallback.defaultLogValue, 10, "first log must never exceed the target");

  const normalizedFallback = module.resolveManualCreatedHabit(null, {
    ...fallback,
    name: "Drink Water",
    icon: "water_drop",
    unit: "l",
    target: 2,
    habitType: "water_intake",
    metricType: "volume_ml",
    defaultLogValue: 3000,
  });
  assert.equal(normalizedFallback.unit, "ml");
  assert.equal(normalizedFallback.target, 2000);
  assert.equal(normalizedFallback.defaultLogValue, 2000);

  const normalizedSaved = module.resolveManualCreatedHabit(
    {
      ...legacySaved,
      habit_type: "water_intake",
      metric_type: "volume_ml",
      unit: "l",
      target: 2,
      default_log_value: 250,
    },
    fallback,
  );
  assert.equal(normalizedSaved.unit, "ml");
  assert.equal(normalizedSaved.target, 2000);
  assert.equal(normalizedSaved.defaultLogValue, 250);
});

test("treatment habit form helpers clamp first logs and expand hidden invalid fields", async () => {
  const module = await import("../lib/habits/form-variant.ts");
  assert.equal(typeof module.clampDefaultLogValueToTarget, "function");
  assert.equal(typeof module.shouldExpandHabitFormAdvanced, "function");

  assert.equal(module.clampDefaultLogValueToTarget(25, 10), 10);
  assert.equal(module.clampDefaultLogValueToTarget(4, 10), 4);
  assert.equal(module.clampDefaultLogValueToTarget(null, 10), null);
  assert.equal(module.clampDefaultLogValueToTarget(4, null), 4);

  for (const issue of ["target", "reminders", "validation"]) {
    assert.equal(module.shouldExpandHabitFormAdvanced("treatment", issue), true);
    assert.equal(module.shouldExpandHabitFormAdvanced("standard", issue), false);
  }
  assert.equal(module.shouldExpandHabitFormAdvanced("treatment", "basic"), false);
});

test("manual habit creation freezes activation mode and treatment enters the shared first-log flow", () => {
  const source = readFileSync("app/habits/new.tsx", "utf8");
  assert.match(source, /import FirstLogFlow from "@\/components\/first-log-flow"/);
  assert.match(source, /const manualModeRef = useRef<"control" \| "treatment" \| null>\(null\)/);
  assert.match(source, /if \(activation\.ready && manualModeRef\.current === null\)/);
  assert.match(source, /const isTreatment = manualModeRef\.current === "treatment"/);
  assert.match(source, /variant=\{isTreatment \? "treatment" : "standard"\}/);
  assert.doesNotMatch(source, /getHabit\(/);
  assert.match(source, /resolveManualCreatedHabit\(result\.habit/);
  assert.match(source, /resolveManualCreatedHabit/);
  assert.match(source, /<FirstLogFlow/);
  assert.match(source, /if \(!isTreatment\) \{[\s\S]*?router\.replace\("\/"\)/);
});

test("treatment manual form keeps basics visible and advanced options accessible", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(source, /variant\?: HabitFormVariant/);
  assert.match(source, /const isTreatment = variant === "treatment" && !initial/);
  assert.match(source, /const \[advancedExpanded, setAdvancedExpanded\] = useState\(false\)/);
  assert.match(source, /accessibilityState=\{\{ expanded: advancedExpanded \}\}/);
  assert.match(source, /aria-expanded=\{advancedExpanded\}/);
  assert.match(source, /shouldExpandHabitFormAdvanced\("treatment", "target"\)/);
  assert.match(source, /shouldExpandHabitFormAdvanced\("treatment", "reminders"\)/);
  assert.match(source, /shouldExpandHabitFormAdvanced\("treatment", "validation"\)/);
  assert.match(source, /const submittingRef = useRef\(false\)/);
  assert.match(source, /disabled=\{!name\.trim\(\) \|\| loading\}/);
  assert.match(source, /defaultLogValue: isTreatment[\s\S]*?clampDefaultLogValueToTarget/);
});

test("treatment manual form summary and advanced controls are localized in Hindi", () => {
  const source = readFileSync("components/habit-form.tsx", "utf8");
  for (const label of [
    "Target: {target} {unit}",
    "No target",
    "Reminders: off",
    "Reminders: {count}",
    "Advanced",
    "Show advanced habit options",
    "Hide advanced habit options",
  ]) {
    assert.match(source, new RegExp(`"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.notEqual(translate("hi", label), label, `missing Hindi treatment copy: ${label}`);
  }
});

test("first-run smoke suite covers both control and treatment manual creation", () => {
  const treatmentPath = "scripts/first-run/treatment-manual-habit-smoke.cjs";
  assert.equal(existsSync(treatmentPath), true, "expected a treatment manual-create smoke");
  const suite = readFileSync("scripts/first-run/all-smokes.cjs", "utf8");
  assert.match(suite, /manual-habit-smoke\.cjs/);
  assert.match(suite, /treatment-manual-habit-smoke\.cjs/);

  const source = readFileSync(treatmentPath, "utf8");
  for (const proof of [
    "Show advanced habit options",
    "Saving...",
    "Let's log your first habit together",
    "First Step",
    "Maybe later",
  ]) {
    assert.match(source, new RegExp(proof.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /button\.click\(\);\s*button\.click\(\);/);
  assert.match(source, /for \(const label of advancedLabels\)/);
  assert.match(source, /storedMarker !== "1"/);
  assert.match(source, /rpc\/get_completion_stats/);
  assert.match(source, /total_completions:\s*credited \? 1 : 0/);
  assert.match(source, /completion_dates:\s*credited \? \[today\] : \[\]/);

  const postCreateSource = readFileSync("scripts/first-run/post-create-smoke.cjs", "utf8");
  assert.match(postCreateSource, /actionButton[\s\S]*?button\.click\(\);\s*button\.click\(\);/);
  assert.match(postCreateSource, /getByText\("First Step", \{ exact: true \}\)/);
});

test("pickTutorialHabit prefers the water habit, else first, else null", () => {
  const water = { id: "w", name: "Drink Water", habitType: "water_intake" };
  const walk = { id: "k", name: "Walk", habitType: "walk" };
  assert.equal(pickTutorialHabit([walk, water]).id, "w"); // water preferred even when not first
  assert.equal(pickTutorialHabit([walk]).id, "k"); // falls back to the first created habit
  assert.equal(pickTutorialHabit([]), null); // null only when nothing was created
});

test("getTutorialHabitAction logs a realistic first amount for quantity habits", () => {
  assert.deepEqual(
    getTutorialHabitAction({
      id: "water",
      name: "Drink Water",
      icon: "water_drop",
      color: "primary",
      unit: "ml",
      target: 1500,
      habitType: "water_intake",
      metricType: "volume_ml",
      defaultLogValue: 250,
    }),
    { kind: "log_progress", value: 250 },
  );

  assert.deepEqual(
    getTutorialHabitAction({
      id: "read",
      name: "Read",
      icon: "book",
      color: "secondary",
      unit: "pages",
      target: 20,
      habitType: "read",
      metricType: "pages",
      defaultLogValue: 100,
    }),
    { kind: "log_progress", value: 20 },
  );

  assert.deepEqual(
    getTutorialHabitAction({
      id: "journal",
      name: "Journal",
      icon: "book",
      color: "tertiary",
      unit: "",
      target: null,
      habitType: "journal",
      metricType: "boolean",
      defaultLogValue: null,
    }),
    { kind: "complete" },
  );
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

test("routine builder sizes water target from body weight (~33 ml/kg)", () => {
  const base = {
    goals: ["health"],
    lifestyle: "home",
    sleep: "okay",
    workload: "normal",
    stress: "low",
    fitnessLevel: "beginner",
  };
  const light = buildRoutineRecommendations({ ...base, weightKg: 50 }).find(
    (h) => h.habitType === "water_intake",
  );
  const heavy = buildRoutineRecommendations({ ...base, weightKg: 90 }).find(
    (h) => h.habitType === "water_intake",
  );
  // 50 kg → ~1650 ml; 90 kg → ~2950 ml. Heavier person gets a larger target.
  assert.ok(light && light.target >= 1500 && light.target <= 1800);
  assert.ok(heavy && heavy.target >= 2800 && heavy.target <= 3100);
  assert.ok(heavy.target > light.target);
});

test("routine builder ramps water up from a low current baseline, not to the full ideal", () => {
  const routine = buildRoutineRecommendations({
    goals: ["health"],
    lifestyle: "home",
    sleep: "okay",
    workload: "normal",
    stress: "low",
    fitnessLevel: "beginner",
    weightKg: 90, // ideal ~2950 ml
    waterBaseline: "low", // currently ~500 ml
  });
  const water = routine.find((h) => h.habitType === "water_intake");
  // Starts near baseline + one step (~1000 ml), far below the 2950 ml ideal.
  assert.ok(water && water.target <= 1200);
});

test("routine builder makes step target age-aware and never a blanket 10k", () => {
  const base = {
    goals: ["fitness"],
    lifestyle: "active",
    sleep: "good",
    workload: "normal",
    stress: "low",
    fitnessLevel: "advanced",
  };
  const younger = buildRoutineRecommendations({ ...base, age: 30 }).find(
    (h) => h.habitType === "walk",
  );
  const older = buildRoutineRecommendations({ ...base, age: 70 }).find(
    (h) => h.habitType === "walk",
  );
  assert.ok(younger && younger.target <= 10000);
  // 70-year-old advanced walker is capped well below the 10k marketing number.
  assert.ok(older && older.target <= 8000 && older.target < younger.target);
});

test("routine builder ramps steps up from current activity baseline", () => {
  const routine = buildRoutineRecommendations({
    goals: ["fitness"],
    lifestyle: "active",
    sleep: "good",
    workload: "normal",
    stress: "low",
    fitnessLevel: "advanced", // ideal ceiling ~10k
    stepsBaseline: "low", // currently ~2500 steps
  });
  const walk = routine.find((h) => h.habitType === "walk");
  // Starts near baseline + one step (~4000), not the 10k ceiling.
  assert.ok(walk && walk.target <= 4500);
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

test("habit-routine answer sanitizer accepts only bounded wizard answers", async () => {
  const { sanitizeRoutineAnswers } = await import("../supabase/functions/_shared/routine-input.ts");
  const valid = {
    goals: [" focus ", "energy"],
    lifestyle: "office",
    sleep: "okay",
    workload: "high",
    stress: "medium",
    fitnessLevel: "beginner",
    age: 34,
    heightCm: 175,
    weightKg: 70,
    stepsBaseline: "low",
    waterBaseline: "some",
  };

  assert.deepEqual(sanitizeRoutineAnswers(valid), {
    ...valid,
    goals: ["focus", "energy"],
  });
  assert.deepEqual(sanitizeRoutineAnswers({ ...valid, goals: ["Sleep\u0000better"] })?.goals, [
    "Sleep better",
  ]);
  assert.equal(sanitizeRoutineAnswers({ ...valid, goals: Array(6).fill("fitness") }), null);
  assert.equal(sanitizeRoutineAnswers({ ...valid, goals: ["x".repeat(49)] }), null);
  assert.equal(sanitizeRoutineAnswers({ ...valid, lifestyle: "other" }), null);
  assert.equal(sanitizeRoutineAnswers({ ...valid, extra: "not allowed" }), null);
});

test("habit-routine sanitizes answers before quota and Gemini input", () => {
  const source = readFileSync("supabase/functions/habit-routine/index.ts", "utf8");
  const sanitizeIndex = source.indexOf(
    "const sanitizedAnswers = sanitizeRoutineAnswers(body.answers)",
  );
  const quotaIndex = source.indexOf('enforceAiQuota(admin, user.id, "habit-routine")');
  const geminiIndex = source.indexOf("generateContent(GEMINI_ROUTINE_MODEL");

  assert.match(
    source,
    /import \{ sanitizeRoutineAnswers \} from "\.\.\/_shared\/routine-input\.ts"/,
  );
  assert.ok(sanitizeIndex >= 0, "expected answer sanitization");
  assert.ok(quotaIndex > sanitizeIndex, "answers must be sanitized before quota consumption");
  assert.ok(geminiIndex > sanitizeIndex, "answers must be sanitized before Gemini input");
  assert.match(source, /answers: sanitizedAnswers/);
  assert.doesNotMatch(source, /answers: body\.answers/);
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
  assert.equal(signal?.suggestedValue, 250);
  assert.match(signal?.message ?? "", /only completed 30%/i);
});

test("client and server coach streak signals ignore partial target days", () => {
  const now = new Date(2026, 4, 14, 9, 0);
  const partialHistory = [
    {
      habit_id: coachHabit.id,
      completed_on: "2026-05-13",
      created_at: "2026-05-13T09:00:00",
      value: 250,
    },
    {
      habit_id: coachHabit.id,
      completed_on: "2026-05-12",
      created_at: "2026-05-12T09:00:00",
      value: 500,
    },
  ];

  const clientSignals = buildCoachSignals({
    habits: [coachHabit],
    completions: partialHistory,
    now,
    tone: "friendly",
  });
  const serverSignals = portSignalsFor([coachHabit], partialHistory, now, "friendly");

  assert.equal(
    clientSignals.some((signal) => signal.kind === "streak_risk"),
    false,
  );
  assert.equal(
    serverSignals.some((signal) => signal.kind === "streak_risk"),
    false,
  );
});

test("partial coach actions use neutral target-progress copy with client/server parity", () => {
  const forbiddenClaim =
    /\b(?:complete(?:s|d)?|counts?|alive)\b|protect[^.]*streak|keep[^.]*streak/i;
  const tones = ["friendly", "motivational", "calm", "strict", "military"];

  for (const kind of ["streak_risk", "easy_alternative"]) {
    for (const tone of tones) {
      const signal = {
        kind,
        priority: 70,
        habitId: coachHabit.id,
        habitName: coachHabit.name,
        suggestedAction: "log_value",
        suggestedValue: 250,
        tone,
        unit: coachHabit.unit,
      };
      const clientMessage = formatCoachMessage(signal);
      const serverMessage = formatCoachMessagePort(signal);

      assert.equal(serverMessage, clientMessage, `${kind}/${tone} copy must stay in parity`);
      assert.doesNotMatch(clientMessage, forbiddenClaim, `${kind}/${tone} must not promise credit`);
      assert.match(clientMessage, /progress|target|step|log/i);
    }
  }
});

test("generated partial coach copy cannot reintroduce completion or streak-credit claims", async () => {
  assert.equal(typeof clientCoach.coachMessageIsSafeForSignal, "function");
  assert.equal(typeof serverCoach.coachMessageIsSafeForSignal, "function");
  const baseSignal = {
    kind: "streak_risk",
    priority: 70,
    habitId: coachHabit.id,
    habitName: coachHabit.name,
    message: "Move Drink Water closer to today's target. Log 250 ml for Drink Water.",
    suggestedAction: "log_value",
    suggestedValue: 250,
    tone: "friendly",
    unit: coachHabit.unit,
  };
  const unsafeMessages = [
    "Log 250 ml to keep your streak alive.",
    "This smaller step will finish the habit.",
    "Log 250 ml and you're done for today.",
    "This will reach today's target.",
    "Your streak is safe after this log.",
  ];
  for (const kind of ["streak_risk", "easy_alternative", "behind_progress"]) {
    const signal = { ...baseSignal, kind };
    for (const unsafe of unsafeMessages) {
      assert.equal(clientCoach.coachMessageIsSafeForSignal(signal, unsafe), false);
      assert.equal(serverCoach.coachMessageIsSafeForSignal(signal, unsafe), false);
    }
  }

  const behindProgressSignal = {
    ...baseSignal,
    kind: "behind_progress",
    message: "You've only completed 25% of Drink Water today. Log 250 ml so you don't fall behind.",
  };
  assert.equal(
    await resolveCoachMessage(behindProgressSignal, {
      enabled: true,
      invoke: async () => unsafeMessages[0],
    }),
    behindProgressSignal.message,
  );

  const cachedAt = new Date(2026, 6, 11, 12, 0).getTime();
  const cacheKey = coachMessageCacheKey(behindProgressSignal, new Date(cachedAt));
  const cache = new Map([[cacheKey, JSON.stringify({ message: unsafeMessages[0], cachedAt })]]);
  const storage = {
    getItem: async (key) => cache.get(key) ?? null,
    setItem: async (key, value) => void cache.set(key, value),
  };
  let cacheRefreshCalls = 0;
  assert.equal(
    await resolveCoachMessage(behindProgressSignal, {
      enabled: true,
      now: new Date(cachedAt + 1_000),
      storage,
      invoke: async () => {
        cacheRefreshCalls++;
        return null;
      },
    }),
    behindProgressSignal.message,
  );
  assert.equal(
    await resolveCoachMessage(behindProgressSignal, {
      enabled: true,
      now: new Date(cachedAt + 2_000),
      storage,
      invoke: async () => {
        cacheRefreshCalls++;
        return null;
      },
    }),
    behindProgressSignal.message,
  );
  assert.equal(cacheRefreshCalls, 1, "the trusted negative fallback must suppress reinvocation");

  const inApp = readFileSync("supabase/functions/coach-message/index.ts", "utf8");
  const push = readFileSync("supabase/functions/coach-push/index.ts", "utf8");
  for (const source of [inApp, push]) {
    assert.match(source, /coachMessageIsSafeForSignal/);
    assert.match(source, /partial[\s\S]*?streak[\s\S]*?completion/i);
  }
});

test("new suggested native check-ins use exact-once logging and completion-aware history", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  const detail = readFileSync("app/habits/[id]/index.tsx", "utf8");
  const habitsData = readFileSync("lib/data/habits.ts", "utf8");
  const reminders = readFileSync("lib/data/reminders.ts", "utf8");
  const reminderSync = readFileSync("lib/data/reminder-sync.ts", "utf8");
  const logPrompt = readFileSync("components/log-prompt.tsx", "utf8");
  const detailSmoke = readFileSync("scripts/first-run/detail-log-smoke.cjs", "utf8");

  for (const source of [dashboard, detail]) {
    assert.match(source, /import \* as Crypto from "expo-crypto"/);
    assert.match(source, /logCompletionOnce/);
    assert.match(source, /Crypto\.randomUUID\(\)/);
    assert.match(source, /suggestedCheckInForHabit/);
  }
  assert.match(habitsData, /completedDatesForHabit/);
  assert.match(habitsData, /isHabitCompletionDone/);
  assert.match(reminders, /completedDatesForHabit/);
  assert.match(reminders, /suggestedCheckInForHabit/);
  assert.match(reminderSync, /suggestion\?: CheckInSuggestion/);
  assert.match(logPrompt, /suggestedCheckInForHabit/);
  assert.match(logPrompt, /else if \(base > 0\)/);
  assert.doesNotMatch(logPrompt, /base > 0 && target == null/);
  assert.match(logPrompt, /Math\.min\(base, remaining\)/);
  assert.match(logPrompt, /Math\.min\(base \* 2, remaining\)/);
  assert.match(detailSmoke, /rpc\/log_habit_completion_once/);
  assert.match(detailSmoke, /p_operation_id/);
  assert.match(detailSmoke, /incrementReceipts/);
  assert.match(detailSmoke, /rpc\/get_completion_stats/);
});

test("manual and quick-chip prompt increments share a stable exact-once operation", async () => {
  const prompt = readFileSync("components/log-prompt.tsx", "utf8");
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  const detail = readFileSync("app/habits/[id]/index.tsx", "utf8");

  assert.ok(existsSync("lib/data/completion-submission-operation.ts"));
  const { operationForCompletionSubmission } =
    await import("../lib/data/completion-submission-operation.ts");
  let createdIds = 0;
  const createId = () => `operation-${++createdIds}`;
  const firstOperation = operationForCompletionSubmission(
    null,
    { habitId: "habit-1", value: 25, note: "steady" },
    createId,
  );
  const retryOperation = operationForCompletionSubmission(
    firstOperation,
    { habitId: "habit-1", value: 25, note: "steady" },
    createId,
  );
  const changedOperation = operationForCompletionSubmission(
    retryOperation,
    { habitId: "habit-1", value: 50, note: "steady" },
    createId,
  );
  assert.equal(retryOperation.id, firstOperation.id);
  assert.notEqual(changedOperation.id, firstOperation.id);
  assert.equal(createdIds, 2);

  assert.match(prompt, /import \* as Crypto from "expo-crypto"/);
  assert.match(prompt, /const submittingRef = useRef\(false\)/);
  assert.match(prompt, /if \(submittingRef\.current\) return/);
  assert.match(prompt, /submittingRef\.current = true/);
  assert.match(prompt, /operationForCompletionSubmission\(/);
  assert.match(prompt, /Crypto\.randomUUID/);
  assert.match(prompt, /const operationId = operation\.id/);
  assert.match(prompt, /pendingOperationRef/);
  assert.match(prompt, /onSubmit\(amount, note, operationId\)/);
  assert.match(prompt, /onPress=\{\(\) => submitValue\(chip\.value\)\}/);
  assert.match(prompt, /await submitValue\(amount\)/);
  assert.match(prompt, /submittingRef\.current = false/);
  assert.match(prompt, /handleMarkAllDone[\s\S]*?pendingOperationRef\.current = null/);
  assert.match(prompt, /user-selected fallback controls, not canonical suggestions/i);
  assert.match(prompt, /target\s*\?\s*target \/ 4/);
  assert.match(prompt, /Math\.min\(base \* 2, suggestion\.remainingBefore\)/);

  const dashboardManual =
    dashboard.match(/async function handleLogSheetSubmit[\s\S]*?\n  \}/)?.[0] ?? "";
  const dashboardSleep =
    dashboard.match(/async function handleSleepCoachLog[\s\S]*?\n  \}/)?.[0] ?? "";
  const detailManual = detail.match(/async function handleLog[\s\S]*?\n  \}/)?.[0] ?? "";
  for (const handler of [dashboardManual, dashboardSleep, detailManual]) {
    assert.match(handler, /operationId: string/);
    assert.match(handler, /logCompletionOnce\([\s\S]*?operationId[\s\S]*?value/);
    assert.doesNotMatch(handler, /\blogCompletion\(/);
  }
  assert.match(
    dashboard,
    /visible=\{sleepLogHabit !== null\}[\s\S]*?currentValue=\{\s*sleepLogHabit \? \(data\?\.todayProgress\.get\(sleepLogHabit\.id\)\?\.current \?\? 0\) : 0\s*\}[\s\S]*?onSubmit=\{handleSleepCoachLog\}/,
  );
  assert.match(
    dashboardSleep,
    /const wasDone = data\?\.completedToday\.has\(sleepLogHabit\.id\) \?\? false/,
  );
  assert.match(
    dashboardSleep,
    /const prevValue = data\?\.todayProgress\.get\(sleepLogHabit\.id\)\?\.current \?\? 0/,
  );
  assert.match(
    dashboardSleep,
    /const target = sleepLogHabit\.target != null \? Number\(sleepLogHabit\.target\) : null/,
  );
  assert.match(
    dashboardSleep,
    /const nowDone = target != null && target > 0 \? prevValue \+ value >= target : true/,
  );
  assert.match(
    dashboardSleep,
    /if \(!wasDone && nowDone\) \{[\s\S]*?celebrate\(\)[\s\S]*?recordCompletionAndMaybeReview\(\)/,
  );
  assert.match(dashboardSleep, /if \(!result\.queued\) load\(\{ force: true \}\)/);
  assert.match(dashboard, /handleMarkAllDone[\s\S]*?toggleHabit\(/);
  assert.match(detail, /handleMarkAllDone[\s\S]*?toggleHabit\(/);
});

test("suggested native check-ins reject rapid duplicate taps and keep queued detail progress", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  const detail = readFileSync("app/habits/[id]/index.tsx", "utf8");

  assert.match(dashboard, /checkInFlightRef\s*=\s*useRef\(new Set<string>\(\)\)/);
  assert.match(dashboard, /checkInFlightRef\.current\.has\(habitId\)/);
  assert.match(dashboard, /checkInFlightRef\.current\.add\(habitId\)/);
  assert.match(dashboard, /checkInFlightRef\.current\.delete\(habitId\)/);
  assert.match(dashboard, /checkInFlightRef\.current\.has\(signal\.habitId\)/);
  assert.match(dashboard, /checkInFlightRef\.current\.delete\(signal\.habitId\)/);
  assert.doesNotMatch(dashboard, /setData\(previous\)/);
  assert.doesNotMatch(dashboard, /completedToday:\s*previous/);
  assert.match(dashboard, /if \(!result\.ok\)[\s\S]*?setData\(\(current\)[\s\S]*?todayProgress/);
  assert.match(
    dashboard,
    /const liveSuggestion[\s\S]*?suggestedCheckInForHabit\(habit, liveProgress\)/,
  );
  assert.match(dashboard, /handleCoachAction[\s\S]*?setData\(\(currentData\)[\s\S]*?todayProgress/);

  assert.match(detail, /quickLogInFlightRef\s*=\s*useRef\(false\)/);
  assert.match(detail, /if \(quickLogInFlightRef\.current\) return/);
  assert.match(detail, /setQuickLogging\(true\)/);
  assert.match(detail, /setCompletions\(\(current\)/);
  assert.match(detail, /currentValue \+ checkInSuggestion\.value/);
  assert.match(detail, /const liveSuggestion[\s\S]*?suggestedCheckInForHabit\(habit, progress\)/);
  assert.match(detail, /currentValue \+ liveSuggestion\.value/);
  assert.match(detail, /disabled=\{doneToday \|\| quickLogging\}/);
  assert.match(
    detail,
    /handleInsightAction[\s\S]*?if \(quickLogInFlightRef\.current\) return[\s\S]*?Logged from AI coach/,
  );
  assert.match(
    detail,
    /handleInsightAction[\s\S]*?findIndex\(\(completion\) => completion\.completed_on === today\)[\s\S]*?optimistic-/,
  );
});

test("AI coach card only shows secondary Open when primary logs progress", () => {
  const cardSource = readFileSync("components/coach-card.tsx", "utf8");
  const primaryLabelIndex = cardSource.indexOf("const actionLabel = coachActionLabel(signal, t);");
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

test("coach bot button always responds: free users get the Pro upsell", () => {
  const dashboardSource = readFileSync("app/(tabs)/index.tsx", "utf8");
  const handlerBlock =
    dashboardSource.match(/function handleCoachButtonPress\(\)[\s\S]*?\n  \}/)?.[0] ?? "";

  // With a live signal the button still toggles the card.
  assert.match(handlerBlock, /setCoachCardOverride\(coachCardVisible \? "hidden" : "shown"\)/);
  // Free users are told the coach is a Pro feature with a route to /pro.
  assert.match(handlerBlock, /AI Coach is a Pro feature/);
  assert.match(handlerBlock, /router\.push\("\/pro"/);
  // Pro users with nothing to act on get feedback instead of a dead tap.
  assert.match(handlerBlock, /All caught up/);
  assert.match(dashboardSource, /onPress=\{handleCoachButtonPress\}/);

  // Deliberately opening the card resurfaces the Pro upsell pill.
  assert.match(
    dashboardSource,
    /upsellDismissed=\{coachHintDismissed && coachCardOverride !== "shown"\}/,
  );
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

test("web push reminder cron normalizes subscription timezones before local calculations", () => {
  const source = readFileSync("supabase/functions/web-push-reminders/index.ts", "utf8");

  assert.match(source, /import \{ normalizeTimeZone \} from "\.\.\/_shared\/timezone\.ts"/);
  assert.match(source, /const timezone = normalizeTimeZone\(sub\.timezone\)/);
  assert.match(source, /localMinuteOfDay\(now, timezone\)/);
  assert.match(source, /localDayOfWeek\(now, timezone\)/);
  assert.match(source, /localDateString\(now, timezone\)/);
});

test("server coach signal time context falls back to UTC for invalid subscription timezones", () => {
  const now = new Date("2026-05-14T16:30:00.000Z");
  const local = localTimeContext(now, "Not/AZone");

  assert.deepEqual(local, {
    todayKey: "2026-05-14",
    hour: 16,
    minute: 30,
    dayOfWeek: 4,
    timezone: "UTC",
  });
});

test("web push endpoint validation allows only known HTTPS push providers", async () => {
  const { isAllowedWebPushEndpoint } =
    await import("../supabase/functions/_shared/web-push-endpoint.ts");

  assert.equal(isAllowedWebPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(
    isAllowedWebPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"),
    true,
  );
  assert.equal(isAllowedWebPushEndpoint("https://web.push.apple.com/Qabc"), true);
  assert.equal(isAllowedWebPushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x"), true);

  assert.equal(isAllowedWebPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"), false);
  assert.equal(isAllowedWebPushEndpoint("https://example.com/push"), false);
  assert.equal(isAllowedWebPushEndpoint("https://localhost/push"), false);
  assert.equal(isAllowedWebPushEndpoint("https://127.0.0.1/push"), false);
  assert.equal(isAllowedWebPushEndpoint("https://10.0.0.5/push"), false);
  assert.equal(isAllowedWebPushEndpoint("https://169.254.169.254/latest/meta-data"), false);
  assert.equal(isAllowedWebPushEndpoint("https://[::1]/push"), false);
});

test("web push workers validate stored endpoints before sending notifications", () => {
  const reminderSource = readFileSync("supabase/functions/web-push-reminders/index.ts", "utf8");
  const coachSource = readFileSync("supabase/functions/coach-push/index.ts", "utf8");

  for (const source of [reminderSource, coachSource]) {
    assert.match(
      source,
      /import \{ isAllowedWebPushEndpoint \} from "\.\.\/_shared\/web-push-endpoint\.ts"/,
    );
    const validationIndex = source.indexOf("isAllowedWebPushEndpoint(sub.endpoint)");
    const sendIndex = source.indexOf("webPush.sendNotification");
    assert.ok(validationIndex >= 0, "worker should validate each stored endpoint");
    assert.ok(sendIndex > validationIndex, "endpoint validation must happen before send");
    assert.match(source, /\.from\("web_push_subscriptions"\)\.delete\(\)\.eq\("id", sub\.id\)/);
  }
});

test("web push endpoint hardening migration constrains new subscription endpoints", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_web_push_endpoint_hardening.sql"),
  );
  assert.ok(migrationName, "expected a web push endpoint hardening migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /web_push_subscriptions_endpoint_allowed/i);
  assert.match(sql, /fcm\\.googleapis\\.com/i);
  assert.match(sql, /updates\\.push\\.services\\.mozilla\\.com/i);
  assert.match(sql, /web\\.push\\.apple\\.com/i);
  assert.match(sql, /notify\\.windows\\.com/i);
  assert.match(sql, /not valid/i);
});

test("web push reminder cron bounds reminder arrays before per-reminder database work", () => {
  const source = readFileSync("supabase/functions/web-push-reminders/index.ts", "utf8");
  const timesIndex = source.indexOf("normalizeReminderTimes(habit.reminder_times)");
  const daysIndex = source.indexOf("normalizeReminderDays(habit.reminder_days)");
  const dedupeIndex = source.indexOf('from("web_push_sends")');

  assert.ok(timesIndex >= 0, "expected reminder_times normalization");
  assert.ok(daysIndex >= 0, "expected reminder_days normalization");
  assert.ok(dedupeIndex > timesIndex, "normalization must happen before per-reminder DB work");
  assert.match(source, /MAX_REMINDER_TIMES_PER_HABIT = 8/);
});

test("reminder array hardening migration enforces bounded unique times and days", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_reminder_array_hardening.sql"),
  );
  assert.ok(migrationName, "expected a reminder array hardening migration");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /valid_reminder_times/i);
  assert.match(sql, /valid_reminder_days/i);
  assert.match(sql, /cardinality\(times\) <= 8/i);
  assert.match(sql, /cardinality\(days\) <= 7/i);
  assert.match(sql, /count\(distinct value\)/i);
  assert.match(sql, /not valid/i);
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
  const insertIndex = source.indexOf(".insert({", capIndex);
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

test("AI coach v2 cache keys refresh after material progress, date, or fallback changes", () => {
  const base = {
    kind: "behind_progress",
    habitId: "habit-1",
    tone: "friendly",
    suggestedValue: 500,
    progressPct: 24,
    message: "Drink 500 ml now.",
  };
  const morning = new Date(2026, 4, 14, 9, 0);
  const original = coachMessageCacheKey(base, morning);
  assert.match(original, /^habbit:coach-message:v2:2026-05-14:/);
  assert.notEqual(original, coachMessageCacheKey({ ...base, progressPct: 76 }, morning));
  assert.notEqual(
    original,
    coachMessageCacheKey({ ...base, message: "Have some water." }, morning),
  );
  assert.notEqual(original, coachMessageCacheKey(base, new Date(2026, 4, 15, 9, 0)));
});

test("revoking AI access bumps the shared cache epoch and bypasses cached coach output", async () => {
  const { bumpAiCacheEpoch } = await import("../lib/coach/ai-cache-epoch.ts");
  const signal = {
    kind: "encouragement",
    priority: 10,
    habitId: "habit-epoch",
    habitName: "Read",
    tone: "friendly",
    suggestedAction: "open_habit",
    message: "Read one page now.",
  };
  const cache = new Map();
  const storage = {
    getItem: async (key) => cache.get(key) ?? null,
    setItem: async (key, value) => void cache.set(key, value),
  };
  let calls = 0;
  const invoke = async () => `Generated coach line ${++calls}.`;
  const now = new Date(2026, 4, 14, 12, 0);
  await resolveCoachMessage(signal, { enabled: true, storage, now, invoke });
  await resolveCoachMessage(signal, { enabled: true, storage, now, invoke });
  assert.equal(calls, 1);
  await bumpAiCacheEpoch(storage);
  await resolveCoachMessage(signal, { enabled: true, storage, now, invoke });
  assert.equal(calls, 2);
});

test("AI access UI records versioned adult attestation, syncs timezone, and supports revocation", () => {
  const access = readFileSync("lib/services/ai-access.ts", "utf8");
  const privacy = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  const root = readFileSync("app/_layout.tsx", "utf8");
  assert.match(
    access,
    /eligible[\s\S]*attestation_required[\s\S]*feature_disabled[\s\S]*provider_unconfirmed/,
  );
  assert.match(access, /AI_DISCLOSURE_VERSION/);
  assert.match(access, /rpc\("set_ai_access_attestation"/);
  assert.match(access, /rpc\("set_profile_time_zone"/);
  assert.match(root, /syncProfileTimeZone/);
  assert.match(access, /bumpAiCacheEpoch/);
  assert.match(access, /clearHabitValidationRemoteState/);
  assert.match(privacy, /I confirm I am 18 or older/);
  assert.match(privacy, /Revoke AI access/);
  assert.match(privacy, /Google Gemini/);
});

test("signup, Terms, and Privacy disclose the adult-only revocable AI processing", () => {
  const login = readFileSync("app/login.tsx", "utf8");
  const terms = readFileSync("website/app/terms/page.tsx", "utf8");
  const privacy = readFileSync("website/app/privacy/page.tsx", "utf8");
  assert.match(login, /EXPO_PUBLIC_TERMS_URL/);
  assert.match(
    terms,
    /AI features are available only to users who attest that they are 18 or older/,
  );
  assert.match(privacy, /revoke AI access/);
  assert.match(privacy, /do not store your birth date/);
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
      coachMessageCacheKey(signal, new Date(cachedAt)),
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

const remoteValidationInput = {
  name: "Water",
  description: null,
  unit: "ml",
  target: 2000,
  habitType: "water_intake",
  metricType: "volume_ml",
};

test("remote habit validation caches definitive verdicts per fingerprint", async () => {
  clearHabitValidationRemoteState();
  const now = new Date(2026, 6, 6, 9, 0);
  let calls = 0;
  const invoke = async () => {
    calls++;
    return {
      status: "warn",
      category: "unhealthy",
      message: "That is a lot of water.",
      suggestion: { target: 2500 },
      source: "gemini",
    };
  };

  const first = await validateHabitRemote(remoteValidationInput, { invoke, now });
  const second = await validateHabitRemote(remoteValidationInput, {
    invoke,
    now: new Date(now.getTime() + 60_000),
  });
  assert.equal(first.status, "warn");
  assert.deepEqual(second, first);
  assert.equal(calls, 1);

  // A different fingerprint misses the cache.
  await validateHabitRemote({ ...remoteValidationInput, target: 3000 }, { invoke, now });
  assert.equal(calls, 2);

  // Expired entries are re-fetched.
  await validateHabitRemote(remoteValidationInput, {
    invoke,
    now: new Date(now.getTime() + 25 * 60 * 60 * 1000),
  });
  assert.equal(calls, 3);
  clearHabitValidationRemoteState();
});

test("remote habit validation fails open and cools down after provider failures", async () => {
  clearHabitValidationRemoteState();
  const now = new Date(2026, 6, 6, 9, 0);
  let calls = 0;
  const invoke = async () => {
    calls++;
    throw new Error("offline");
  };

  const first = await validateHabitRemote(remoteValidationInput, { invoke, now });
  assert.equal(first.status, "ok");
  assert.equal(first.source, "gemini_unavailable");
  assert.equal(calls, 1);

  // The cooldown suppresses further calls, even for other habits.
  const second = await validateHabitRemote(
    { ...remoteValidationInput, name: "Run" },
    { invoke, now: new Date(now.getTime() + 30_000) },
  );
  assert.equal(second.status, "ok");
  assert.equal(calls, 1);

  // After the cooldown expires, calls resume.
  await validateHabitRemote(remoteValidationInput, {
    invoke,
    now: new Date(now.getTime() + 3 * 60_000),
  });
  assert.equal(calls, 2);
  clearHabitValidationRemoteState();
});

test("remote habit validation never caches server-side gemini fail-opens", async () => {
  clearHabitValidationRemoteState();
  const now = new Date(2026, 6, 6, 9, 0);
  let calls = 0;
  const invoke = async () => {
    calls++;
    return {
      status: "ok",
      category: null,
      message: null,
      suggestion: null,
      source: "gemini_unavailable",
    };
  };

  const first = await validateHabitRemote(remoteValidationInput, { invoke, now });
  assert.equal(first.source, "gemini_unavailable");
  assert.equal(calls, 1);

  // The fail-open starts a cooldown instead of populating the cache.
  await validateHabitRemote(remoteValidationInput, {
    invoke,
    now: new Date(now.getTime() + 30_000),
  });
  assert.equal(calls, 1);

  // After the cooldown the same habit is retried rather than served from cache.
  await validateHabitRemote(remoteValidationInput, {
    invoke,
    now: new Date(now.getTime() + 3 * 60_000),
  });
  assert.equal(calls, 2);
  clearHabitValidationRemoteState();
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

test("weekly report excludes partial target rows from completion credit but keeps quantity totals", () => {
  const stats = buildWeeklyStats({
    habits: [
      reportHabit({
        id: "water",
        name: "Water",
        unit: "ml",
        target: 1000,
        metric_type: "volume_ml",
      }),
      reportHabit({ id: "journal", name: "Journal", metric_type: "boolean" }),
    ],
    completions: [
      { habit_id: "water", completed_on: "2026-06-01", value: 250 },
      { habit_id: "water", completed_on: "2026-06-02", value: 1000 },
      { habit_id: "journal", completed_on: "2026-06-02", value: 1 },
    ],
    lastWeekCompletions: 1,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  const water = stats.byHabit.find((habit) => habit.name === "Water");
  assert.equal(stats.totalCompletions, 2);
  assert.equal(stats.perfectDays, 1);
  assert.equal(stats.bestStreak, 1);
  assert.deepEqual(stats.trend, { lastWeekCompletions: 1, delta: 1 });
  assert.equal(water?.daysLogged, 1);
  assert.equal(water?.weeklyTotal, 1250);
  assert.equal(water?.dailyAverage, 625);
  assert.equal(water?.targetHitDays, 1);
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

test("weekly report scheduled days honor local creation and archive date keys", () => {
  assert.equal(
    scheduledDaysForHabit(
      reportHabit({ active_from: "2026-06-03", active_until: "2026-06-05" }),
      REPORT_WEEK_START,
      REPORT_FAR_FUTURE,
    ),
    3,
  );
});

test("weekly report perfect days use the habits scheduled on each individual day", () => {
  const stats = buildWeeklyStats({
    habits: [
      reportHabit({ id: "walk", name: "Walk" }),
      reportHabit({ id: "journal", name: "Journal", active_from: "2026-06-02" }),
    ],
    completions: [{ habit_id: "walk", completed_on: "2026-06-01", value: 1 }],
    lastWeekCompletions: 0,
    weekStartDate: REPORT_WEEK_START,
    today: REPORT_FAR_FUTURE,
  });

  assert.equal(stats.perfectDays, 1);
});

test("weekly report local-week helpers handle UTC extremes and DST without elapsed-day math", async () => {
  const statsModule = await import("../supabase/functions/progress-report/stats.ts");
  const instant = new Date("2026-06-08T09:30:00.000Z");
  assert.equal(statsModule.previousWeekStartForTimeZone(instant, "Pacific/Honolulu"), "2026-05-25");
  assert.equal(
    statsModule.previousWeekStartForTimeZone(instant, "Pacific/Kiritimati"),
    "2026-06-01",
  );
  assert.equal(
    statsModule.dateKeyInTimeZone(new Date("2026-03-08T09:30:00.000Z"), "America/Los_Angeles"),
    "2026-03-08",
  );
  assert.equal(
    statsModule.dateKeyInTimeZone(new Date("2026-03-08T10:30:00.000Z"), "America/Los_Angeles"),
    "2026-03-08",
  );
});

test("weekly AI insight rejects metrics, completion claims, and unknown habit identifiers", async () => {
  const statsModule = await import("../supabase/functions/progress-report/stats.ts");
  assert.deepEqual(
    statsModule.sanitizeQualitativeInsight(
      { encouragement: "steady", nextStep: "make_easy", habitId: "walk" },
      new Set(["walk"]),
    ),
    {
      encouragement: "A steady rhythm is taking shape.",
      nextStep: "Make the next action feel easy.",
      habitId: "walk",
    },
  );
  assert.equal(
    statsModule.sanitizeQualitativeInsight(
      { encouragement: "free-form", nextStep: "make_easy", habitId: "walk" },
      new Set(["walk"]),
    ),
    null,
  );
  assert.equal(
    statsModule.sanitizeQualitativeInsight(
      { encouragement: "steady", nextStep: "a-dozen-times", habitId: "walk" },
      new Set(["walk"]),
    ),
    null,
  );
  assert.equal(
    statsModule.sanitizeQualitativeInsight(
      { encouragement: "steady", nextStep: "several-rounds", habitId: "walk" },
      new Set(["walk"]),
    ),
    null,
  );
  assert.equal(
    statsModule.sanitizeQualitativeInsight(
      { encouragement: "steady", nextStep: "prepare", habitId: "unknown" },
      new Set(["walk"]),
    ),
    null,
  );
});

test("progress report Edge Function includes historical habits and stores AI prose separately", () => {
  const source = readFileSync("supabase/functions/progress-report/index.ts", "utf8");
  assert.match(source, /archived_at/);
  assert.match(source, /time_zone/);
  assert.match(source, /dateKeyInTimeZone/);
  assert.match(source, /summary_text:\s*fallbackSummary\(stats\)/);
  assert.match(source, /insight_text:/);
  assert.match(source, /sanitizeQualitativeInsight/);
});

test("progress report candidate RPC is service-only and selects missing local-week reports", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_ai_release_hardening.sql"),
  );
  assert.ok(migrationName);
  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /create or replace function public\.list_due_progress_report_candidates/i);
  assert.match(sql, /returns table[\s\S]*user_id[\s\S]*week_start[\s\S]*time_zone/i);
  assert.match(sql, /not exists[\s\S]*weekly_progress_reports/i);
  assert.match(sql, /date_trunc\('week',[\s\S]*time_zone/i);
  assert.match(
    sql,
    /revoke execute on function public\.list_due_progress_report_candidates[\s\S]*from public/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.list_due_progress_report_candidates[\s\S]*to service_role/i,
  );
  assert.match(sql, /0 \* \* \* \*/);
  assert.match(sql, /cron\.schedule/);
  assert.match(sql, /progress_report_url[\s\S]*progress_report_cron_secret/);
});

test("progress report cron repeatedly drains bounded candidate pages instead of a fixed profile slice", () => {
  const source = readFileSync("supabase/functions/progress-report/index.ts", "utf8");
  assert.match(source, /rpc\(\s*"list_due_progress_report_candidates"/);
  assert.match(source, /p_limit:\s*MAX_BATCH_USERS/);
  assert.match(source, /while \(!deadlineReached\)/);
  assert.match(
    source,
    /generateForUser\(\s*admin,\s*candidate\.user_id,\s*candidate\.week_start,\s*candidate\.time_zone,?\s*\)/,
  );
  assert.doesNotMatch(source, /\.from\("profiles"\)[\s\S]*\.limit\(MAX_BATCH_USERS\)/);
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

test("activation assignment is deterministic and honors rollout boundaries", async () => {
  const { activationBucket, assignActivationVariant } =
    await import("../lib/activation/contracts.ts");
  const firstUser = "00000000-0000-4000-8000-000000000001";
  const secondUser = "00000000-0000-4000-8000-000000000002";

  assert.equal(activationBucket(firstUser), 63);
  assert.equal(activationBucket(secondUser), 82);
  assert.equal(activationBucket("11111111-1111-4111-8111-111111111111"), 94);
  assert.equal(activationBucket(firstUser), activationBucket(firstUser));

  assert.deepEqual(assignActivationVariant(firstUser, { enabled: false, rolloutPercentage: 100 }), {
    variant: "control",
    bucket: 63,
    rolloutPercentage: 100,
  });
  assert.equal(
    assignActivationVariant(firstUser, { enabled: true, rolloutPercentage: 0 }).variant,
    "control",
  );
  assert.equal(
    assignActivationVariant(firstUser, { enabled: true, rolloutPercentage: 63 }).variant,
    "control",
    "the rollout comparison is strict: bucket === percentage stays control",
  );
  assert.equal(
    assignActivationVariant(firstUser, { enabled: true, rolloutPercentage: 64 }).variant,
    "activation_v2",
  );
  assert.equal(
    assignActivationVariant(secondUser, { enabled: true, rolloutPercentage: 100 }).variant,
    "activation_v2",
  );
});

test("activation stage is fail-open and an authoritative reconciliation clears optimism", async () => {
  const { resolveActivationStage, resolveStageWithOptimisticMarker } =
    await import("../lib/activation/contracts.ts");

  assert.deepEqual(resolveActivationStage(null, new Error("offline")), {
    stage: "engaged",
    authoritative: false,
  });
  assert.deepEqual(resolveActivationStage(null, null), {
    stage: "engaged",
    authoritative: false,
  });
  assert.equal(
    resolveActivationStage({ first_habit_logged_at: null, activation_engaged_at: null }, null)
      .stage,
    "pre_value",
  );
  assert.deepEqual(
    resolveActivationStage(
      { first_habit_logged_at: "2026-07-11T00:00:00Z", activation_engaged_at: null },
      null,
    ),
    { stage: "first_log", authoritative: true },
  );
  assert.deepEqual(
    resolveActivationStage(
      { first_habit_logged_at: null, activation_engaged_at: "2026-07-11T00:00:00Z" },
      null,
    ),
    { stage: "engaged", authoritative: true },
  );

  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "pre_value", authoritative: true },
      hasMarker: true,
      hasPendingPositive: true,
      reconcile: false,
    }),
    { stage: "first_log", clearMarker: false },
  );
  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "pre_value", authoritative: true },
      hasMarker: true,
      hasPendingPositive: true,
      reconcile: true,
    }),
    { stage: "pre_value", clearMarker: true },
  );
  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "engaged", authoritative: false },
      hasMarker: true,
      hasPendingPositive: false,
      reconcile: true,
    }),
    { stage: "engaged", clearMarker: false },
  );
  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "pre_value", authoritative: true },
      hasMarker: true,
      hasPendingPositive: false,
      reconcile: false,
    }),
    { stage: "pre_value", clearMarker: true },
  );
});

test("activation provider state resets per account and ignores stale loads", async () => {
  const { activationStateReducer, initialActivationProviderState } =
    await import("../lib/activation/state.ts");

  assert.equal(
    initialActivationProviderState.ready,
    false,
    "auth must be unresolved until the initial session lookup completes",
  );
  const signedOut = activationStateReducer(initialActivationProviderState, {
    type: "auth_changed",
    userId: null,
  });
  assert.equal(signedOut.ready, true, "a resolved signed-out session can render immediately");

  const signedIn = activationStateReducer(initialActivationProviderState, {
    type: "auth_changed",
    userId: "user-a",
  });
  assert.equal(signedIn.ready, false);
  assert.equal(signedIn.generation, 1);
  assert.strictEqual(
    activationStateReducer(signedIn, { type: "auth_changed", userId: "user-a" }),
    signedIn,
    "a token refresh for the same user must not reset visible state",
  );

  const optimisticBeforeLoad = activationStateReducer(signedIn, {
    type: "optimistic_first_log",
    userId: "user-a",
  });
  const loadedAfterEarlyCompletion = activationStateReducer(optimisticBeforeLoad, {
    type: "loaded",
    userId: "user-a",
    generation: signedIn.generation,
    assignment: { variant: "activation_v2", bucket: 2, rolloutPercentage: 100 },
    stage: "pre_value",
    authoritative: true,
  });
  assert.equal(
    loadedAfterEarlyCompletion.stage,
    "first_log",
    "a queued completion during initial loading must survive the stale pre-value snapshot",
  );
  assert.equal(loadedAfterEarlyCompletion.authoritative, false);

  const switched = activationStateReducer(signedIn, {
    type: "auth_changed",
    userId: "user-b",
  });
  const stale = activationStateReducer(switched, {
    type: "loaded",
    userId: "user-a",
    generation: signedIn.generation,
    assignment: { variant: "activation_v2", bucket: 2, rolloutPercentage: 100 },
    stage: "first_log",
    authoritative: true,
  });
  assert.strictEqual(stale, switched);

  const loaded = activationStateReducer(switched, {
    type: "loaded",
    userId: "user-b",
    generation: switched.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "pre_value",
    authoritative: true,
  });
  const optimistic = activationStateReducer(loaded, {
    type: "optimistic_first_log",
    userId: "user-b",
  });
  assert.equal(optimistic.stage, "first_log");
  assert.equal(optimistic.authoritative, false, "marker-derived first_log is optimistic");

  const failOpenEngaged = activationStateReducer(loaded, {
    type: "loaded",
    userId: "user-b",
    generation: loaded.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "engaged",
    authoritative: false,
  });
  assert.equal(failOpenEngaged.stage, "engaged");

  const recovered = activationStateReducer(failOpenEngaged, {
    type: "loaded",
    userId: "user-b",
    generation: failOpenEngaged.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "pre_value",
    authoritative: true,
  });
  assert.equal(
    recovered.stage,
    "pre_value",
    "fail-open engaged must recover after a successful authoritative read",
  );
  assert.equal(recovered.authoritative, true);

  const authoritativeEngaged = activationStateReducer(recovered, {
    type: "loaded",
    userId: "user-b",
    generation: recovered.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "engaged",
    authoritative: true,
  });
  assert.equal(authoritativeEngaged.authoritative, true);

  const transientError = activationStateReducer(authoritativeEngaged, {
    type: "loaded",
    userId: "user-b",
    generation: authoritativeEngaged.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "engaged",
    authoritative: false,
  });
  assert.equal(transientError.stage, "engaged");
  assert.equal(transientError.authoritative, true, "errors cannot erase engaged provenance");

  const stalePreValue = activationStateReducer(transientError, {
    type: "loaded",
    userId: "user-b",
    generation: transientError.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "pre_value",
    authoritative: true,
  });
  assert.equal(stalePreValue.stage, "engaged", "authoritative engagement is monotonic");
  assert.equal(stalePreValue.authoritative, true);

  const controlAfterEngaged = activationStateReducer(authoritativeEngaged, {
    type: "loaded",
    userId: "user-b",
    generation: authoritativeEngaged.generation,
    assignment: { variant: "control", bucket: 3, rolloutPercentage: 0 },
    stage: "engaged",
    authoritative: false,
  });
  assert.equal(
    controlAfterEngaged.authoritative,
    true,
    "a control assignment cannot erase a known engaged milestone",
  );
  const reEnrolledWithStalePreValue = activationStateReducer(controlAfterEngaged, {
    type: "loaded",
    userId: "user-b",
    generation: controlAfterEngaged.generation,
    assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
    stage: "pre_value",
    authoritative: true,
  });
  assert.equal(reEnrolledWithStalePreValue.stage, "engaged");
  assert.equal(reEnrolledWithStalePreValue.authoritative, true);

  const controlToTreatment = activationStateReducer(
    { ...authoritativeEngaged, variant: "control", authoritative: false },
    {
      type: "loaded",
      userId: "user-b",
      generation: authoritativeEngaged.generation,
      assignment: { variant: "activation_v2", bucket: 3, rolloutPercentage: 100 },
      stage: "pre_value",
      authoritative: true,
    },
  );
  assert.equal(controlToTreatment.stage, "pre_value", "newly enrolled control users may activate");
});

test("control assignments retain authoritative server activation milestones", async () => {
  const { activationStateReducer, initialActivationProviderState } =
    await import("../lib/activation/state.ts");
  const signedIn = activationStateReducer(initialActivationProviderState, {
    type: "auth_changed",
    userId: "control-user",
  });

  for (const stage of ["pre_value", "first_log", "engaged"]) {
    const loaded = activationStateReducer(signedIn, {
      type: "loaded",
      userId: "control-user",
      generation: signedIn.generation,
      assignment: { variant: "control", bucket: 14, rolloutPercentage: 0 },
      stage,
      authoritative: true,
    });
    assert.equal(loaded.variant, "control");
    assert.equal(loaded.stage, stage);
    assert.equal(loaded.authoritative, true);
  }
});

test("a control offline first log survives reload until authoritative reconciliation", async () => {
  const { resolveStageWithOptimisticMarker } = await import("../lib/activation/contracts.ts");
  const { activationStateReducer, initialActivationProviderState } =
    await import("../lib/activation/state.ts");
  const signedIn = activationStateReducer(initialActivationProviderState, {
    type: "auth_changed",
    userId: "offline-control",
  });
  const optimisticBeforeLoad = activationStateReducer(signedIn, {
    type: "optimistic_first_log",
    userId: "offline-control",
  });
  const loadedAfterEarlyCompletion = activationStateReducer(optimisticBeforeLoad, {
    type: "loaded",
    userId: "offline-control",
    generation: signedIn.generation,
    assignment: { variant: "control", bucket: 41, rolloutPercentage: 0 },
    stage: "pre_value",
    authoritative: true,
  });
  assert.equal(loadedAfterEarlyCompletion.stage, "first_log");
  assert.equal(loadedAfterEarlyCompletion.authoritative, false);

  const preValue = activationStateReducer(signedIn, {
    type: "loaded",
    userId: "offline-control",
    generation: signedIn.generation,
    assignment: { variant: "control", bucket: 41, rolloutPercentage: 0 },
    stage: "pre_value",
    authoritative: true,
  });
  const optimistic = activationStateReducer(preValue, {
    type: "optimistic_first_log",
    userId: "offline-control",
  });
  assert.equal(optimistic.stage, "first_log");
  assert.equal(optimistic.authoritative, false);

  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "pre_value", authoritative: true },
      hasMarker: true,
      hasPendingPositive: true,
      reconcile: false,
    }),
    { stage: "first_log", clearMarker: false },
    "a reload keeps the optimistic stage while the positive completion is queued",
  );
  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "first_log", authoritative: true },
      hasMarker: true,
      hasPendingPositive: false,
      reconcile: true,
    }),
    { stage: "first_log", clearMarker: true },
    "queue replay clears the marker only after the server milestone is authoritative",
  );
});

test("activation loads accept only the latest same-user request and optimism invalidates reads", async () => {
  const { createActivationLoadSequencer } = await import("../lib/activation/request-sequencer.ts");
  const sequencer = createActivationLoadSequencer();
  const older = sequencer.begin();
  const newer = sequencer.begin();
  assert.equal(sequencer.isCurrent(older), false);
  assert.equal(sequencer.isCurrent(newer), true);
  sequencer.invalidate();
  assert.equal(sequencer.isCurrent(newer), false);
});

test("activation auth bootstrap cannot overwrite a newer auth event or survive cleanup", async () => {
  const { createActivationAuthBootstrapGate } =
    await import("../lib/activation/auth-bootstrap-gate.ts");
  const eventFirst = createActivationAuthBootstrapGate();
  assert.equal(eventFirst.acceptBootstrap(), true);
  assert.equal(eventFirst.observeAuthEvent(), true);
  assert.equal(eventFirst.acceptBootstrap(), false);

  const cancelled = createActivationAuthBootstrapGate();
  cancelled.cancel();
  assert.equal(cancelled.acceptBootstrap(), false);
  assert.equal(cancelled.observeAuthEvent(), false);
});

test("foreign queue cleanup deduplicates prior owners and never clears the current user", async () => {
  const { foreignCompletionOwnerIds } =
    await import("../lib/activation/queue-marker-reconciliation.ts");
  assert.deepEqual(
    foreignCompletionOwnerIds(
      [{ userId: "user-a" }, { userId: "user-b" }, { userId: "user-a" }],
      "user-b",
    ),
    ["user-a"],
  );
});

test("completion queue storage serializes concurrent enqueues", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  const base = {
    kind: "complete",
    userId: "user-a",
    completedOn: "2026-07-11",
    queuedAt: "2026-07-11T00:00:00Z",
    value: 1,
  };

  await Promise.all([
    store.enqueue({ ...base, id: "old-a", habitId: "habit-a" }),
    store.enqueue({ ...base, id: "old-b", habitId: "habit-b" }),
  ]);

  assert.deepEqual(
    (await store.read()).map((operation) => operation.id),
    ["old-a", "old-b"],
  );
});

test("completion replay removal merges against concurrently enqueued operations by id", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  const oldOperation = {
    id: "old",
    kind: "complete",
    habitId: "habit-old",
    userId: "user-a",
    completedOn: "2026-07-11",
    value: 1,
    queuedAt: "2026-07-11T00:00:00Z",
  };
  const newOperation = {
    ...oldOperation,
    id: "new",
    habitId: "habit-new",
    queuedAt: "2026-07-11T00:01:00Z",
  };

  await store.enqueue(oldOperation);
  const replaySnapshot = await store.read();
  await store.enqueue(newOperation);
  await store.removeIds(replaySnapshot.map((operation) => operation.id));

  assert.deepEqual(
    (await store.read()).map((operation) => operation.id),
    ["new"],
  );
});

test("completion queue storage preserves absolute-write supersession", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  const complete = {
    id: "complete",
    kind: "complete",
    habitId: "habit-a",
    userId: "user-a",
    completedOn: "2026-07-11",
    value: 1,
    queuedAt: "2026-07-11T00:00:00Z",
  };
  await store.enqueue(complete);
  await store.enqueue({
    ...complete,
    id: "uncomplete",
    kind: "uncomplete",
    queuedAt: "2026-07-11T00:01:00Z",
  });

  assert.deepEqual(
    (await store.read()).map((operation) => operation.kind),
    ["uncomplete"],
  );
});

test("completion queue preserves idempotent increments as independent manual intent", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  const base = {
    habitId: "habit-a",
    userId: "user-a",
    completedOn: "2026-07-11",
    value: 20,
  };

  await store.enqueue({
    ...base,
    id: "legacy-increment",
    kind: "increment",
    queuedAt: "2026-07-11T00:00:00Z",
  });
  await store.enqueue({
    ...base,
    id: "idempotent-increment",
    kind: "increment_once",
    operationId: "30000000-0000-4000-8000-000000000001",
    queuedAt: "2026-07-11T00:01:00Z",
  });

  assert.deepEqual(
    (await store.read()).map((operation) => operation.id),
    ["legacy-increment", "idempotent-increment"],
  );
  assert.equal(await store.hasPendingPositive("user-a"), true);
});

test("a same-user pending positive completion preserves optimistic first-log state", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  await store.enqueue({
    id: "positive-a",
    kind: "complete",
    habitId: "habit-a",
    userId: "user-a",
    completedOn: "2026-07-11",
    value: 1,
    queuedAt: "2026-07-11T00:00:00Z",
  });

  assert.equal(await store.hasPendingPositive("user-a"), true);
});

test("an orphaned optimistic marker resolves back to authoritative pre-value", async () => {
  const { resolveStageWithOptimisticMarker } = await import("../lib/activation/contracts.ts");

  assert.deepEqual(
    resolveStageWithOptimisticMarker({
      remote: { stage: "pre_value", authoritative: true },
      hasMarker: true,
      hasPendingPositive: false,
      reconcile: false,
    }),
    { stage: "pre_value", clearMarker: true },
  );
});

test("another user's pending completion does not preserve optimistic first-log state", async () => {
  const { createCompletionQueueStore } = await import("../lib/data/completion-queue-store.ts");
  let raw = null;
  const store = createCompletionQueueStore({
    getItem: async () => raw,
    setItem: async (_key, value) => void (raw = value),
    removeItem: async () => void (raw = null),
  });
  await store.enqueue({
    id: "positive-b",
    kind: "increment",
    habitId: "habit-b",
    userId: "user-b",
    completedOn: "2026-07-11",
    queuedAt: "2026-07-11T00:00:00Z",
  });

  assert.equal(await store.hasPendingPositive("user-a"), false);
});

test("feature flag config cache stores successes only and supports forced refresh", async () => {
  const { createFeatureFlagConfigCache } = await import("../lib/activation/flag-config-cache.ts");
  let now = 1_000;
  let calls = 0;
  const cache = createFeatureFlagConfigCache({
    now: () => now,
    ttlMs: 300,
    load: async () => {
      calls += 1;
      return { enabled: true, rolloutPercentage: 25 };
    },
  });
  const fallback = { enabled: false, rolloutPercentage: 0 };
  assert.deepEqual(await cache.get("activation_v2", fallback), {
    enabled: true,
    rolloutPercentage: 25,
  });
  assert.deepEqual(await cache.get("activation_v2", fallback), {
    enabled: true,
    rolloutPercentage: 25,
  });
  assert.equal(calls, 1);
  await cache.get("activation_v2", fallback, { force: true });
  assert.equal(calls, 2);
  now += 301;
  await cache.get("activation_v2", fallback);
  assert.equal(calls, 3);

  let failedCalls = 0;
  const failing = createFeatureFlagConfigCache({
    load: async () => {
      failedCalls += 1;
      throw new Error("network");
    },
  });
  assert.deepEqual(await failing.get("activation_v2", fallback), fallback);
  assert.deepEqual(await failing.get("activation_v2", fallback), fallback);
  assert.equal(failedCalls, 2, "fallbacks must not be cached");

  let forcedCalls = 0;
  const forcedFailure = createFeatureFlagConfigCache({
    load: async () => {
      forcedCalls += 1;
      if (forcedCalls === 1) return { enabled: true, rolloutPercentage: 100 };
      throw new Error("network");
    },
  });
  assert.deepEqual(await forcedFailure.get("activation_v2", fallback), {
    enabled: true,
    rolloutPercentage: 100,
  });
  assert.deepEqual(await forcedFailure.get("activation_v2", fallback, { force: true }), fallback);
  assert.deepEqual(await forcedFailure.get("activation_v2", fallback), fallback);
  assert.equal(forcedCalls, 3, "a forced failure must retire the older successful config");

  let raceCalls = 0;
  let resolveOlder;
  let resolveNewer;
  const racing = createFeatureFlagConfigCache({
    load: () =>
      new Promise((resolve) => {
        raceCalls += 1;
        if (raceCalls === 1) resolveOlder = resolve;
        else resolveNewer = resolve;
      }),
  });
  const older = racing.get("activation_v2", fallback, { force: true });
  const newer = racing.get("activation_v2", fallback, { force: true });
  resolveNewer({ enabled: false, rolloutPercentage: 0 });
  await newer;
  resolveOlder({ enabled: true, rolloutPercentage: 100 });
  await older;
  assert.deepEqual(await racing.get("activation_v2", fallback), {
    enabled: false,
    rolloutPercentage: 0,
  });
  assert.equal(raceCalls, 2, "an older response must not overwrite the latest-started config");
});

test("optimistic first-log marker is persistent and user-scoped", async () => {
  const { createOptimisticFirstLogStore, optimisticFirstLogKey } =
    await import("../lib/activation/optimistic-marker.ts");
  const values = new Map();
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => void values.set(key, value),
    removeItem: async (key) => void values.delete(key),
  };
  const firstStore = createOptimisticFirstLogStore(storage);
  assert.equal(await firstStore.has("user-a"), false);
  await firstStore.mark("user-a");
  assert.equal(values.get(optimisticFirstLogKey("user-a")), "1");

  const reloadedStore = createOptimisticFirstLogStore(storage);
  assert.equal(await reloadedStore.has("user-a"), true);
  assert.equal(await reloadedStore.has("user-b"), false);
  await reloadedStore.clear("user-a");
  assert.equal(await firstStore.has("user-a"), false);
});

test("activation completion events distinguish optimism from queue settlement", async () => {
  const { createActivationCompletionEventBus } = await import("../lib/activation/events.ts");
  const bus = createActivationCompletionEventBus();
  const received = [];
  const unsubscribe = bus.subscribe((event) => received.push(event));
  bus.positiveCompletion("user-a", true);
  bus.queueSettled("user-a");
  unsubscribe();
  bus.positiveCompletion("user-a", false);
  assert.deepEqual(received, [
    { type: "positive_completion", userId: "user-a", queued: true },
    { type: "completion_queue_settled", userId: "user-a" },
  ]);
});

test("activation rollout migration is secure, bounded, and preserves service-role completions", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_activation_v2_rollout.sql"),
  );
  assert.ok(migrationName, "expected a CLI-generated activation_v2_rollout migration");
  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");

  assert.match(sql, /add column if not exists rollout_percentage integer not null default 100/i);
  assert.match(sql, /feature_flags_rollout_percentage_check/i);
  assert.match(sql, /check\s*\(rollout_percentage between 0 and 100\)/i);
  assert.match(sql, /'activation_v2'[\s\S]*false[\s\S]*0/i);
  assert.match(
    sql,
    /on conflict \(key\)[\s\S]*enabled\s*=\s*false[\s\S]*rollout_percentage\s*=\s*0/i,
  );
  assert.match(sql, /first_habit_logged_at timestamptz/i);
  assert.match(sql, /activation_engaged_at timestamptz/i);
  assert.match(sql, /row_number\(\) over \(partition by user_id order by created_at, id\)/i);
  assert.match(sql, /where value > 0/i);
  assert.match(sql, /where completion_rank = 1/i);
  assert.match(sql, /where completion_rank = 3/i);
  assert.match(sql, /coalesce\(p\.first_habit_logged_at, b\.first_habit_logged_at\)/i);
  assert.match(sql, /coalesce\(p\.activation_engaged_at, b\.activation_engaged_at\)/i);

  assert.match(sql, /create schema if not exists app_private/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(sql, /pg_catalog\.now\(\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /request\.jwt\.claim\.role/i);
  assert.match(sql, /service_role/i);
  assert.match(sql, /new\.user_id/i);
  assert.match(sql, /from public\.profiles[\s\S]*activation_engaged_at is null[\s\S]*for update/i);
  assert.match(sql, /from public\.habit_completions[\s\S]*value > 0[\s\S]*limit 3/i);
  assert.match(sql, /revoke all on schema app_private/i);
  assert.match(sql, /revoke all on function app_private\.update_activation_milestones\(\)/i);
  assert.match(
    sql,
    /after insert or update of value on public\.habit_completions[\s\S]*when \(new\.value > 0\)/i,
  );
  assert.doesNotMatch(sql, /after delete/i);

  const updateGrant =
    sql.match(/grant update \(([^)]*)\)\s+on table public\.profiles to authenticated/i)?.[1] ?? "";
  assert.doesNotMatch(updateGrant, /first_habit_logged_at|activation_engaged_at/i);
});

test("activation schema parity and pgTAP verification are source-controlled", () => {
  const adminSchema = readFileSync("supabase/admin_schema.sql", "utf8");
  assert.match(adminSchema, /rollout_percentage integer not null default 100/i);
  assert.match(adminSchema, /feature_flags_rollout_percentage_check/i);
  assert.match(adminSchema, /'activation_v2'[\s\S]*false[\s\S]*0/i);
  assert.match(adminSchema, /first_habit_logged_at timestamptz/i);
  assert.match(adminSchema, /activation_engaged_at timestamptz/i);

  assert.ok(
    existsSync("supabase/tests/database/activation_v2.test.sql"),
    "expected activation pgTAP verification",
  );
  const pgTap = readFileSync("supabase/tests/database/activation_v2.test.sql", "utf8");
  assert.match(pgTap, /select plan\(36\)/i);
  assert.match(pgTap, /prosecdef[\s\S]*pg_catalog\.pg_proc/i);
  assert.match(pgTap, /proconfig[\s\S]*array\['search_path=""'\]::text\[\]/i);
  assert.match(
    pgTap,
    /aclexplode\([\s\S]*nspacl[\s\S]*grantee\s*=\s*0[\s\S]*privilege_type\s*=\s*'USAGE'/i,
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(
      pgTap,
      new RegExp(`not\\s+has_schema_privilege\\(\\s*'${role}'[\\s\\S]*?'usage'`, "i"),
    );
    assert.match(
      pgTap,
      new RegExp(`not\\s+has_function_privilege\\(\\s*'${role}'[\\s\\S]*?'execute'`, "i"),
    );
  }
  assert.match(
    pgTap,
    /aclexplode\([\s\S]*proacl[\s\S]*grantee\s*=\s*0[\s\S]*privilege_type\s*=\s*'EXECUTE'/i,
  );
  assert.match(pgTap, /pg_trigger[\s\S]*not\s+t\.tgisinternal/i);
  assert.match(pgTap, /join pg_catalog\.pg_proc as p on p\.oid = t\.tgfoid/i);
  assert.match(pgTap, /tgtype[\s\S]*21::smallint/i);
  assert.match(pgTap, /tgattr[\s\S]*attname\s*=\s*'value'/i);
  assert.match(pgTap, /app_private\.update_activation_milestones/i);
  assert.match(pgTap, /tgenabled[\s\S]*'O'::"char"/i);
  assert.match(pgTap, /first positive completion/i);
  assert.match(pgTap, /third positive completion/i);
  assert.match(pgTap, /repeat same-row update does not reach engagement/i);
  assert.match(pgTap, /service.role upsert/i);
  assert.match(pgTap, /auth\.uid\(\)[\s\S]*null::uuid/i);
  assert.match(pgTap, /on conflict \(habit_id, completed_on\) do update/i);
  assert.match(
    pgTap,
    /values \('20000000-0000-4000-8000-000000000005'[^;]*,\s*null\);/i,
    "the service-role conflict row must satisfy completions_value_positive before upsert",
  );
  assert.match(
    pgTap,
    /throws_matching\([\s\S]*'20000000-0000-4000-8000-000000000006'[^$]*,\s*0\)\$\$[\s\S]*completions_value_positive/i,
  );
  assert.doesNotMatch(pgTap, /zero completion remains accepted/i);
  assert.match(pgTap, /null completion/i);
  assert.match(pgTap, /mismatched owner/i);
  assert.match(pgTap, /delete does not reverse/i);

  const dbTypes = readFileSync("types/db.ts", "utf8");
  assert.match(dbTypes, /first_habit_logged_at: string \| null/);
  assert.match(dbTypes, /activation_engaged_at: string \| null/);
});

test("activation provider loads fail-safe config and milestones at the app root", () => {
  assert.ok(existsSync("lib/services/activation.ts"), "expected activation data service");
  assert.ok(
    existsSync("components/activation-provider.tsx"),
    "expected the root activation provider",
  );

  const flags = readFileSync("lib/services/feature-flags.ts", "utf8");
  assert.match(flags, /export type \{ FeatureFlagConfig \}/);
  assert.match(flags, /createFeatureFlagConfigCache/);
  assert.match(flags, /select\("enabled, rollout_percentage"\)/);
  assert.match(flags, /export async function getFeatureFlagConfig/);
  assert.match(flags, /export async function getFeatureFlag\(/);
  assert.match(flags, /export function getAiSuggestionsEnabled/);

  const service = readFileSync("lib/services/activation.ts", "utf8");
  assert.match(service, /authoritative: boolean/);
  assert.match(service, /getFeatureFlagConfig\(\s*"activation_v2"/);
  assert.match(service, /assignActivationVariant/);
  assert.match(service, /from\("profiles"\)/);
  assert.match(service, /select\("first_habit_logged_at, activation_engaged_at"\)/);
  assert.match(service, /eq\("user_id", userId\)/);
  assert.match(service, /resolveStageWithOptimisticMarker/);
  assert.match(service, /remote\.authoritative && remote\.stage === "pre_value" && hasMarker/);
  assert.match(service, /completionQueueStore\.hasPendingPositive\(userId\)/);
  assert.match(
    service,
    /authoritative:\s*remote\.authoritative\s*&&\s*resolved\.stage\s*===\s*remote\.stage/,
  );
  assert.doesNotMatch(
    service,
    /if \(assignment\.variant === "control"\)/,
    "control and treatment must share durable optimistic milestone reconciliation",
  );
  const queueStoreService = readFileSync("lib/services/completion-queue-store.ts", "utf8");
  assert.doesNotMatch(queueStoreService, /from "\.\.\/data\/completion-queue"/);

  const provider = readFileSync("components/activation-provider.tsx", "utf8");
  const publicContext = provider.match(/type ActivationContextValue = \{[\s\S]*?\n\};/)?.[0] ?? "";
  assert.doesNotMatch(publicContext, /authoritative/);
  assert.match(provider, /ready: boolean/);
  assert.match(provider, /variant: ActivationVariant/);
  assert.match(provider, /stage: ActivationStage/);
  assert.match(provider, /bucket: number/);
  assert.match(provider, /refresh: \(\) => Promise<void>/);
  assert.match(provider, /onAuthStateChange/);
  assert.match(provider, /activationCompletionEvents\.subscribe/);
  assert.match(provider, /AppState\.addEventListener/);
  assert.match(provider, /FEATURE_FLAG_CACHE_TTL_MS/);
  assert.match(provider, /createActivationLoadSequencer/);
  assert.match(provider, /createActivationAuthBootstrapGate/);
  assert.match(provider, /loadSequencerRef\.current\.begin\(\)/);
  assert.match(provider, /loadSequencerRef\.current\.isCurrent\(requestId\)/);
  assert.match(provider, /loadSequencerRef\.current\.invalidate\(\)/);
  assert.match(provider, /authoritative:\s*snapshot\.authoritative/);

  const root = readFileSync("app/_layout.tsx", "utf8");
  assert.match(root, /<ActivationProvider>[\s\S]*<RootLayoutContent \/>/);
});

test("completion actions signal optimistic activation without duplicating database writes", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actions, /recordPositiveCompletion/);

  const logBlock =
    actions.match(/export async function logCompletion[\s\S]*?(?=\nexport async function)/)?.[0] ??
    "";
  assert.match(logBlock, /recordPositiveCompletion\(user\.id/);
  assert.equal((logBlock.match(/log_habit_completion/g) ?? []).length, 1);

  const raiseBlock =
    actions.match(
      /export async function raiseCompletionValue[\s\S]*?(?=\nexport async function)/,
    )?.[0] ?? "";
  assert.match(raiseBlock, /recordPositiveCompletion\(user\.id/);
  assert.equal((raiseBlock.match(/raise_habit_completion_value/g) ?? []).length, 1);

  const toggleBlock =
    actions.match(/export async function toggleHabit[\s\S]*?(?=\nexport async function)/)?.[0] ??
    "";
  assert.match(toggleBlock, /recordPositiveCompletion\(user\.id/);

  const queue = readFileSync("lib/data/completion-queue.ts", "utf8");
  assert.match(queue, /recordCompletionQueueSettled\(user\.id\)/);
  assert.match(queue, /networkBlocked/);
  assert.match(queue, /if \(settled && !networkBlocked\)/);
  assert.match(queue, /optimisticFirstLogStore\.clear\(userId\)/);

  const completionService = readFileSync("lib/services/activation-completion.ts", "utf8");
  assert.match(completionService, /optimisticFirstLogStore\.mark\(userId\)/);
  assert.match(completionService, /positiveCompletion\(userId, queued\)/);
  assert.match(completionService, /queueSettled\(userId\)/);
});

test("quantity first-log retries and queue replay share one database operation id", () => {
  const actions = readFileSync("lib/data/actions.ts", "utf8");
  const queue = readFileSync("lib/data/completion-queue.ts", "utf8");
  const queueTypes = readFileSync("lib/data/completion-queue-store.ts", "utf8");
  const flow = readFileSync("components/first-log-flow.tsx", "utf8");

  const onceBlock =
    actions.match(
      /export async function logCompletionOnce[\s\S]*?(?=\nexport async function)/,
    )?.[0] ?? "";
  assert.match(onceBlock, /log_habit_completion_once/);
  assert.match(onceBlock, /p_operation_id:\s*operationId/);
  assert.match(onceBlock, /kind:\s*"increment_once"/);
  assert.match(onceBlock, /operationId/);
  assert.equal(
    (onceBlock.match(/localDateKey\(\)/g) ?? []).length,
    1,
    "the initial call and queued replay must bind the same calendar date",
  );
  assert.match(onceBlock, /p_completed_on:\s*completedOn/);
  assert.match(onceBlock, /completedOn,/);
  assert.match(queueTypes, /kind:\s*"increment_once"/);
  assert.match(queueTypes, /operationId:\s*string/);
  assert.match(queue, /op\.kind === "increment_once"/);
  assert.match(queue, /log_habit_completion_once/);
  assert.match(queue, /p_operation_id:\s*op\.operationId/);
  assert.match(flow, /Crypto\.randomUUID\(\)/);
  assert.match(flow, /logCompletionOnce/);
  assert.match(flow, /firstLogOperationId/);
  assert.match(flow, /firstLogCompletedOn/);
  assert.match(flow, /logCompletionOnce\([\s\S]*firstLogCompletedOn/);
  assert.match(flow, /toggleHabit\([\s\S]*firstLogCompletedOn/);
});

test("completion increment idempotency migration is private, authenticated, and payload-bound", () => {
  const migrationName = readdirSync("supabase/migrations").find((name) =>
    name.endsWith("_completion_increment_idempotency.sql"),
  );
  assert.ok(migrationName, "expected an idempotent completion migration created by the CLI");

  const sql = readFileSync(`supabase/migrations/${migrationName}`, "utf8");
  assert.match(sql, /create table app_private\.completion_increment_receipts/i);
  assert.match(sql, /primary key \(user_id, operation_id\)/i);
  assert.match(
    sql,
    /foreign key \(habit_id, user_id\)[\s\S]*references public\.habits\(id, user_id\)/i,
  );
  assert.match(
    sql,
    /alter table app_private\.completion_increment_receipts enable row level security/i,
  );
  assert.match(
    sql,
    /revoke all on table app_private\.completion_increment_receipts[\s\S]*public, anon, authenticated, service_role/i,
  );
  assert.match(sql, /create function app_private\.log_habit_completion_once/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /from public\.habits[\s\S]*user_id = v_user_id/i);
  assert.match(sql, /on conflict \(user_id, operation_id\) do nothing/i);
  assert.match(sql, /is distinct from/i);
  assert.match(sql, /idempotency key reused with different payload/i);
  assert.match(
    sql,
    /on conflict \(habit_id, completed_on\) do update[\s\S]*coalesce\(public\.habit_completions\.value, 0\) \+ excluded\.value/i,
  );
  assert.match(sql, /create function public\.log_habit_completion_once/i);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/i);
  assert.doesNotMatch(sql, /grant usage on schema app_private to authenticated/i);
  assert.doesNotMatch(
    sql,
    /grant execute on function app_private\.log_habit_completion_once[\s\S]*to authenticated/i,
  );
  assert.match(
    sql,
    /revoke all on function public\.log_habit_completion_once[\s\S]*from public, anon, service_role/i,
  );
  assert.match(
    sql,
    /grant execute on function public\.log_habit_completion_once[\s\S]*to authenticated/i,
  );

  const pgTapPath = "supabase/tests/database/completion_increment_idempotency.test.sql";
  assert.ok(existsSync(pgTapPath), "expected database behavior verification");
  const pgTap = readFileSync(pgTapPath, "utf8");
  assert.match(pgTap, /same operation is a no-op/i);
  assert.match(pgTap, /different payload is rejected/i);
  assert.match(pgTap, /existing progress is incremented exactly once/i);
  assert.match(pgTap, /cross-owner habit is rejected/i);
});

test("admin activation rollout applies enabled and percentage atomically", () => {
  const actions = readFileSync("website/app/admin/system/actions.ts", "utf8");
  const rolloutAction =
    actions.match(
      /export async function updateFeatureFlagRollout[\s\S]*?(?=\nexport async function|$)/,
    )?.[0] ?? "";
  assert.match(rolloutAction, /key !== "activation_v2"/);
  assert.match(rolloutAction, /Number\.isInteger\(rolloutPercentage\)/);
  assert.match(rolloutAction, /rolloutPercentage < 0 \|\| rolloutPercentage > 100/);
  assert.match(
    rolloutAction,
    /update\(\{[\s\S]*enabled,[\s\S]*rollout_percentage: rolloutPercentage[\s\S]*\}\)/,
  );
  assert.match(rolloutAction, /select\("key"\)[\s\S]*maybeSingle\(\)/);
  assert.match(rolloutAction, /if \(!data\)/);
  assert.match(rolloutAction, /rolloutPercentage/);
  assert.match(rolloutAction, /revalidatePath\("\/admin\/system"\)/);
  assert.match(rolloutAction, /revalidatePath\("\/admin"\)/);

  const genericToggle =
    actions.match(
      /export async function toggleFeatureFlag[\s\S]*?(?=\nexport async function|$)/,
    )?.[0] ?? "";
  assert.match(genericToggle, /key === "activation_v2"/);

  assert.ok(
    existsSync("website/app/admin/system/ActivationRolloutControl.tsx"),
    "expected a dedicated activation rollout control",
  );
  const control = readFileSync("website/app/admin/system/ActivationRolloutControl.tsx", "utf8");
  assert.match(control, /type="range"/);
  assert.match(control, /type="number"/);
  assert.match(control, /min=\{0\}/);
  assert.match(control, /max=\{100\}/);
  assert.match(control, /step=\{1\}/);
  assert.match(control, /aria-label="Activation rollout percentage"/);
  assert.match(control, />\s*Apply rollout\s*</);

  const page = readFileSync("website/app/admin/system/page.tsx", "utf8");
  assert.match(page, /rollout_percentage: number/);
  assert.match(page, /const activationFlag = flags\.find/);
  assert.match(page, /<ActivationRolloutControl/);
});

await testChain;
