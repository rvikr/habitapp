import assert from "node:assert/strict";
import test from "node:test";

import { createActivationAnalyticsLifecycle } from "../lib/activation/analytics-lifecycle.ts";

const control = { variant: "control", bucket: 84, rolloutPercentage: 10 };
const treatment = { variant: "activation_v2", bucket: 4, rolloutPercentage: 10 };

test("entry and exposure context is emitted once per authenticated generation", () => {
  const lifecycle = createActivationAnalyticsLifecycle("web");
  lifecycle.authChanged("user-a", 1);

  const initial = lifecycle.loaded("user-a", 1, control, "pre_value", true);
  assert.deepEqual(initial.entryContext, {
    variant: "control",
    bucket: 84,
    rolloutPercentage: 10,
    stage: "pre_value",
    platform: "web",
  });
  assert.equal(initial.firstLog, null);

  assert.equal(lifecycle.loaded("user-a", 1, control, "pre_value", true).entryContext, null);
  lifecycle.authChanged(null, 2);
  lifecycle.authChanged("user-a", 3);
  assert.equal(
    lifecycle.loaded("user-a", 3, control, "pre_value", true).entryContext?.stage,
    "pre_value",
  );
});

test("a positive completion advances analytics exactly once with post-transition stage", () => {
  const lifecycle = createActivationAnalyticsLifecycle("android");
  lifecycle.authChanged("user-a", 1);
  lifecycle.loaded("user-a", 1, treatment, "pre_value", true);

  assert.deepEqual(lifecycle.positiveCompletion("user-a", true), {
    context: {
      variant: "activation_v2",
      bucket: 4,
      rolloutPercentage: 10,
      stage: "first_log",
      platform: "android",
    },
    queued: true,
  });
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);
  assert.equal(lifecycle.loaded("user-a", 1, treatment, "first_log", true).firstLog, null);
});

test("existing server milestones and stale users never create first-log analytics", () => {
  const lifecycle = createActivationAnalyticsLifecycle("ios");
  lifecycle.authChanged("user-a", 1);
  lifecycle.loaded("user-a", 1, treatment, "first_log", true);
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);

  lifecycle.authChanged("user-b", 2);
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);
  assert.deepEqual(lifecycle.loaded("user-a", 1, control, "pre_value", true), {
    entryContext: null,
    firstLog: null,
  });
});

test("a completion arriving during bootstrap is reconciled against the loaded stage", () => {
  const lifecycle = createActivationAnalyticsLifecycle("web");
  lifecycle.authChanged("user-a", 1);
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);

  const loaded = lifecycle.loaded("user-a", 1, control, "pre_value", true);
  assert.deepEqual(loaded.firstLog, {
    context: {
      variant: "control",
      bucket: 84,
      rolloutPercentage: 10,
      stage: "first_log",
      platform: "web",
    },
    queued: false,
  });
});

test("a bootstrap completion survives an optimistic non-authoritative first-log snapshot", () => {
  const lifecycle = createActivationAnalyticsLifecycle("android");
  lifecycle.authChanged("user-a", 1);
  assert.equal(lifecycle.positiveCompletion("user-a", true), null);

  const loaded = lifecycle.loaded("user-a", 1, treatment, "first_log", false);
  assert.deepEqual(loaded.firstLog, {
    context: {
      variant: "activation_v2",
      bucket: 4,
      rolloutPercentage: 10,
      stage: "first_log",
      platform: "android",
    },
    queued: true,
  });
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);
});

test("a fail-open engaged read never poisons a later real first-log transition", () => {
  const lifecycle = createActivationAnalyticsLifecycle("web");
  lifecycle.authChanged("user-a", 1);
  lifecycle.loaded("user-a", 1, control, "engaged", false);

  lifecycle.loaded("user-a", 1, control, "pre_value", true);
  assert.equal(lifecycle.positiveCompletion("user-a", false)?.context.stage, "first_log");
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);
});

test("a completion during unknown provenance waits for authoritative reconciliation", () => {
  const lifecycle = createActivationAnalyticsLifecycle("android");
  lifecycle.authChanged("user-a", 1);
  lifecycle.loaded("user-a", 1, treatment, "engaged", false);
  assert.equal(lifecycle.positiveCompletion("user-a", true), null);

  const reconciled = lifecycle.loaded("user-a", 1, treatment, "first_log", true);
  assert.equal(reconciled.firstLog?.queued, true);
  assert.equal(reconciled.firstLog?.context.stage, "first_log");
  assert.equal(lifecycle.positiveCompletion("user-a", false), null);
});
