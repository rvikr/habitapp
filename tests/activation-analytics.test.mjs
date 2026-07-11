import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  activationAnalyticsProperties,
  buildActivationAnalyticsEvent,
  categorizeSignupFailure,
  createFirstLogAnalyticsGate,
  isSupabaseUuid,
  sanitizeAnalyticsPath,
  unassignedActivationAnalyticsContext,
} from "../lib/activation/analytics.ts";
import { createAnalyticsBuffer } from "../lib/services/analytics-buffer.ts";
import { translate } from "../lib/i18n/translations.ts";
import { resolveActivationAnalyticsContext } from "../lib/services/activation-analytics-context.ts";

const assigned = {
  variant: "activation_v2",
  bucket: 17,
  rolloutPercentage: 50,
  stage: "pre_value",
  platform: "android",
};

test("activation analytics emits a stable common cohort and platform schema", () => {
  assert.deepEqual(activationAnalyticsProperties(assigned), {
    activation_variant: "activation_v2",
    activation_bucket: 17,
    rollout_percentage: 50,
    activation_stage: "pre_value",
    platform: "android",
  });
  assert.deepEqual(
    activationAnalyticsProperties({
      variant: "unassigned",
      bucket: null,
      rolloutPercentage: null,
      stage: "unassigned",
      platform: "web",
    }),
    {
      activation_variant: "unassigned",
      activation_bucket: null,
      rollout_percentage: null,
      activation_stage: "unassigned",
      platform: "web",
    },
  );
  assert.deepEqual(unassignedActivationAnalyticsContext("ios"), {
    variant: "unassigned",
    bucket: null,
    rolloutPercentage: null,
    stage: "unassigned",
    platform: "ios",
  });
});

test("activation event builder keeps only explicit safe properties", () => {
  const event = buildActivationAnalyticsEvent("routine_created", assigned, {
    flow: "quick_start",
    requested_count: 3,
    created_count: 2,
    failed_count: 1,
    outcome: "partial",
    email: "private@example.com",
    habit_id: "habit-secret",
    habit_name: "Private habit",
    body_metrics: { weight: 72 },
    baseline: "low",
    answers: { constraint: "stress" },
  });

  assert.equal(event.name, "routine_created");
  assert.deepEqual(event.properties, {
    activation_variant: "activation_v2",
    activation_bucket: 17,
    rollout_percentage: 50,
    activation_stage: "pre_value",
    platform: "android",
    flow: "quick_start",
    requested_count: 3,
    created_count: 2,
    failed_count: 1,
    outcome: "partial",
  });
});

test("allowed analytics keys still reject unsafe or malformed values", () => {
  const event = buildActivationAnalyticsEvent(
    "routine_step_completed",
    {
      variant: "private@example.com",
      bucket: 101,
      rolloutPercentage: -1,
      stage: "habit-secret",
      platform: "private device name",
    },
    {
      flow: "private@example.com",
      step_id: "Drink Secret Water",
      step_index: -1,
      step_count: Number.NaN,
    },
  );

  assert.deepEqual(event.properties, {
    activation_variant: "unassigned",
    activation_bucket: null,
    rollout_percentage: null,
    activation_stage: "unassigned",
    platform: "unknown",
  });
  assert.deepEqual(
    buildActivationAnalyticsEvent("signup_failed", assigned, {
      method: "private@example.com",
      failure_category: "Jane's account failed",
      failure_stage: "raw provider response",
    }).properties,
    activationAnalyticsProperties(assigned),
  );
  assert.equal(
    "queued" in
      buildActivationAnalyticsEvent("first_habit_logged", assigned, { queued: "yes" }).properties,
    false,
  );
});

test("every approved funnel event uses the same common schema", () => {
  for (const name of [
    "activation_exposed",
    "signup_mode_opened",
    "signup_submitted",
    "signup_confirmed",
    "activation_entry",
    "routine_started",
    "routine_step_completed",
    "routine_created",
    "first_habit_logged",
    "notification_prompt_shown",
    "signup_failed",
    "routine_failed",
  ]) {
    const event = buildActivationAnalyticsEvent(name, assigned, {});
    assert.deepEqual(
      Object.keys(event.properties).slice(0, 5),
      [
        "activation_variant",
        "activation_bucket",
        "rollout_percentage",
        "activation_stage",
        "platform",
      ],
      `${name} lost the common activation schema`,
    );
  }
});

test("screen analytics removes dynamic habit identifiers and query strings", () => {
  assert.equal(
    sanitizeAnalyticsPath("/habits/8abf7d52-7777-4d44-8d75-b744bc84b811/edit?from=home"),
    "/habits/[id]/edit",
  );
  assert.equal(sanitizeAnalyticsPath("/habits/manual-id"), "/habits/[id]");
  assert.equal(sanitizeAnalyticsPath("/habits/new"), "/habits/new");
  assert.equal(sanitizeAnalyticsPath("/habits/wizard"), "/habits/wizard");
});

test("authenticated analytics accepts Supabase UUIDs only", () => {
  assert.equal(isSupabaseUuid("8abf7d52-7777-4d44-8d75-b744bc84b811"), true);
  assert.equal(isSupabaseUuid("private@example.com"), false);
  assert.equal(isSupabaseUuid("habit-secret"), false);
  assert.equal(isSupabaseUuid(""), false);
});

test("signup errors are reduced to non-PII categories", () => {
  assert.equal(categorizeSignupFailure("Invalid email"), "invalid_email");
  assert.equal(categorizeSignupFailure("Password should contain uppercase"), "weak_password");
  assert.equal(categorizeSignupFailure("Passwords do not match"), "password_mismatch");
  assert.equal(categorizeSignupFailure("User already registered"), "duplicate_account");
  assert.equal(categorizeSignupFailure("Rate limit exceeded"), "rate_limited");
  assert.equal(categorizeSignupFailure("Signup is disabled"), "signup_disabled");
  assert.equal(categorizeSignupFailure("Confirmation link expired"), "confirmation_expired");
  assert.equal(categorizeSignupFailure("Network request failed"), "network");
  assert.equal(categorizeSignupFailure(new Error("provider rejected request")), "provider");
  assert.equal(categorizeSignupFailure(null), "unknown");
});

test("first-log analytics follows one monotonic milestone transition per user", () => {
  const gate = createFirstLogAnalyticsGate();
  gate.sync("user-a", "pre_value");
  assert.equal(gate.positiveCompletion("user-a"), true);
  assert.equal(gate.positiveCompletion("user-a"), false);
  gate.sync("user-a", "pre_value");
  assert.equal(gate.positiveCompletion("user-a"), false, "a stale refresh must not regress");
  gate.sync("user-a", "first_log");
  assert.equal(gate.positiveCompletion("user-a"), false, "queue reconciliation must not repeat");

  gate.sync("user-b", "first_log");
  assert.equal(gate.positiveCompletion("user-b"), false, "an existing milestone is not a new log");
  gate.sync("user-c", "engaged");
  assert.equal(gate.positiveCompletion("user-c"), false);
});

test("analytics buffer is bounded, ordered, and clears identity on reset", () => {
  const buffer = createAnalyticsBuffer(2);
  buffer.identify("8abf7d52-7777-4d44-8d75-b744bc84b811");
  buffer.enqueue("one", { order: 1 });
  buffer.enqueue("two", { order: 2 });
  buffer.enqueue("three", { order: 3 });
  assert.equal(buffer.identity(), "8abf7d52-7777-4d44-8d75-b744bc84b811");
  assert.deepEqual(buffer.drain(), [
    { event: "two", properties: { order: 2 } },
    { event: "three", properties: { order: 3 } },
  ]);
  assert.deepEqual(buffer.drain(), []);
  buffer.enqueue("four");
  buffer.reset();
  assert.equal(buffer.identity(), null);
  assert.deepEqual(buffer.drain(), []);
});

test("analytics service disables implicit URL capture and queues safe explicit events", () => {
  const source = readFileSync("lib/services/analytics.ts", "utf8");
  assert.match(source, /captureAppLifecycleEvents:\s*false/);
  assert.match(source, /identify:\s*\(distinctId: string\)/);
  assert.match(source, /export function identifyAnalytics/);
  assert.match(source, /isSupabaseUuid\(userId\)/);
  assert.match(source, /analyticsBuffer\.enqueue/);
  assert.match(source, /analyticsBuffer\.drain/);
  assert.match(source, /analyticsBuffer\.reset\(\)/);
  assert.match(source, /const currentIdentity = analyticsBuffer\.identity\(\)/);
  assert.match(source, /if \(currentIdentity\) analyticsBuffer\.identify\(currentIdentity\)/);
  assert.match(source, /export function trackActivationEvent/);
  assert.match(source, /buildActivationAnalyticsEvent/);
  const sdkImport = source.indexOf('await import("posthog-react-native")');
  const postImportOptOutGuard = source.indexOf("if (optedOut)", sdkImport);
  const clientConstruction = source.indexOf("client = new PostHog", sdkImport);
  assert.ok(sdkImport >= 0 && postImportOptOutGuard > sdkImport);
  assert.ok(
    postImportOptOutGuard < clientConstruction,
    "opt-out must be rechecked after the awaited SDK import and before client construction",
  );
});

test("root auth lifecycle identifies by UUID and sanitizes tracked routes", () => {
  const source = readFileSync("app/_layout.tsx", "utf8");
  assert.match(source, /identifyAnalytics\(session\.user\.id\)/);
  assert.match(source, /else\s*\{[\s\S]*?resetAnalytics\(\)/);
  assert.match(source, /screen:\s*sanitizeAnalyticsPath\(pathname\)/);
});

test("legacy habit analytics no longer sends habit identifiers", () => {
  const source = readFileSync("lib/data/actions.ts", "utf8");
  for (const call of source.match(/track\([\s\S]*?\);/g) ?? []) {
    assert.doesNotMatch(call, /habit_id/, `analytics call leaks an id: ${call}`);
  }
  assert.match(source, /track\("habit_completed", \{ queued: true \}\)/);
  assert.match(source, /track\("habit_progress_set", \{ queued: true \}\)/);
});

test("signup and callback screens emit privacy-safe funnel events", () => {
  const login = readFileSync("app/login.tsx", "utf8");
  for (const event of ["signup_mode_opened", "signup_submitted", "signup_failed"]) {
    assert.match(login, new RegExp(`trackActivationEvent\\(\\s*"${event}"`));
  }
  assert.match(login, /categorizeSignupFailure/);
  assert.doesNotMatch(login, /trackActivationEvent\([\s\S]{0,300}?\bemail\s*:/);

  const callback = readFileSync("app/auth/callback.tsx", "utf8");
  assert.match(callback, /trackActivationEvent\(\s*"signup_confirmed"/);
  assert.match(callback, /trackActivationEvent\(\s*"signup_failed"/);
  assert.match(callback, /identifyAnalytics\(userId\)/);
  assert.doesNotMatch(callback, /await trackSignupConfirmation/);
  assert.match(callback, /void trackSignupConfirmation[\s\S]*?\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(callback, /trackActivationEvent\([\s\S]{0,300}?\bemail\s*:/);
});

test("activation-adjacent first-run copy is localized in Hindi", () => {
  for (const label of [
    "Session expired — please sign in again.",
    "Targets are general wellness guidance, not medical advice.",
    "How much do you walk on a normal day?",
    "How much water do you drink now?",
    "Targets are general wellness guidance, not medical advice. Adjust any of them before creating your routine.",
    "Your routine is ready",
    "{count} habit, ready to go.",
    "{count} habits, ready to go.",
    "Age",
    "years",
    "e.g. 30",
    "Height",
    "cm",
    "e.g. 170",
    "Weight",
    "kg",
    "e.g. 70",
    "We use this only to set realistic water and step targets. Leave blank to use standard goals.",
    "Couldn't load your habits",
    "Check your connection and try again. Your data is safe.",
  ]) {
    assert.notEqual(translate("hi", label), label, `missing Hindi copy: ${label}`);
  }
});

test("authenticated event context resolves the server assignment without exposing the user id", async () => {
  const context = await resolveActivationAnalyticsContext(
    "8abf7d52-7777-4d44-8d75-b744bc84b811",
    "first_log",
    "android",
    async () => ({ variant: "control", bucket: 42, rolloutPercentage: 25 }),
  );
  assert.deepEqual(context, {
    variant: "control",
    bucket: 42,
    rolloutPercentage: 25,
    stage: "first_log",
    platform: "android",
  });
  assert.equal(JSON.stringify(context).includes("8abf7d52"), false);

  assert.deepEqual(await resolveActivationAnalyticsContext("", "pre_value", "web"), {
    variant: "unassigned",
    bucket: null,
    rolloutPercentage: null,
    stage: "unassigned",
    platform: "web",
  });
});

test("successful completion bookkeeping emits even when the durable marker cannot be stored", () => {
  const source = readFileSync("lib/services/activation-completion.ts", "utf8");
  assert.match(
    source,
    /try\s*\{\s*await optimisticFirstLogStore\.mark\(userId\);\s*\}\s*catch\s*\{[\s\S]*?\}\s*activationCompletionEvents\.positiveCompletion\(userId, queued\)/,
  );
});

test("control and treatment wizard paths share privacy-safe routine analytics", () => {
  const source = readFileSync("app/habits/wizard.tsx", "utf8");
  for (const event of [
    "routine_started",
    "routine_step_completed",
    "routine_created",
    "routine_failed",
  ]) {
    assert.match(source, new RegExp(`trackRoutineEvent\\(\\s*"${event}"`));
  }
  assert.match(source, /const routineFlow = isTreatment \? "quick_start" : "control"/);
  assert.match(
    source,
    /wizardAnalyticsContextRef\.current\s*=\s*\{\s*\.\.\.activation\.analyticsContext/,
  );
  assert.doesNotMatch(source, /resolveActivationAnalyticsContext/);
  assert.doesNotMatch(source, /routineAnalyticsContextRef/);
  assert.match(source, /routineStepsTrackedRef/);
  for (const forbidden of [
    "answers",
    "goals",
    "constraint",
    "habit_id",
    "habit_name",
    "body_metrics",
    "baseline",
  ]) {
    for (const call of source.match(/trackRoutineEvent\([\s\S]*?\);/g) ?? []) {
      assert.doesNotMatch(call, new RegExp(`\\b${forbidden}\\b`));
    }
  }
});

test("the shared first-log flow tracks only an actually displayed post-celebration prompt", () => {
  const source = readFileSync("components/first-log-flow.tsx", "utf8");
  const continuation =
    source.match(
      /async function handleCelebrationContinue[\s\S]*?(?=\n  function resolveNotification)/,
    )?.[0] ?? "";
  assert.match(continuation, /prepareFirstLogNotificationOffer/);
  assert.match(
    continuation,
    /if \(offerNotifications\)[\s\S]*?trackActivationEvent\([\s\S]*?"notification_prompt_shown"/,
  );
  assert.match(source, /const \{ analyticsContext \} = useActivation\(\)/);
  assert.doesNotMatch(source, /resolveActivationAnalyticsContext/);
  assert.match(continuation, /stage:\s*"first_log"/);
  assert.ok(
    continuation.indexOf('trackActivationEvent("notification_prompt_shown"') <
      continuation.indexOf('dispatch({ type: "celebration_continued"'),
    "prompt analytics must be captured before rendering the prompt",
  );
  assert.doesNotMatch(source, /trackActivationEvent\([\s\S]*?"first_habit_logged"/);
});

test("activation provider owns authenticated exposure, entry, and monotonic first-log analytics", () => {
  const source = readFileSync("components/activation-provider.tsx", "utf8");
  assert.match(source, /createActivationAnalyticsLifecycle/);
  assert.match(source, /identifyAnalytics\(userId\)/);
  assert.match(source, /trackActivationEvent\("activation_exposed"/);
  assert.match(source, /trackActivationEvent\("activation_entry"/);
  assert.match(source, /trackActivationEvent\("first_habit_logged"/);
  assert.match(source, /analyticsContext:\s*ActivationAnalyticsContext/);
  assert.match(source, /rolloutPercentage:\s*state\.rolloutPercentage/);
});

test("dashboard prompt reports visibility only after permission and marker checks", () => {
  const card = readFileSync("components/notification-permission-card.tsx", "utf8");
  assert.match(card, /onShown\?:\s*\(\) => void/);
  assert.match(card, /if \(!visible\)/);
  assert.match(card, /onShown\?\.\(\)/);

  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboard, /trackActivationEvent\(\s*"notification_prompt_shown"/);
  assert.match(dashboard, /surface:\s*"dashboard"/);
  assert.match(dashboard, /stage:\s*"first_log"/);
});
