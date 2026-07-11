import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("website habit rules match native target, increment, and completion-window bounds", async () => {
  let rules = null;
  try {
    rules = await import("../website/lib/habit-validation.ts");
  } catch {
    // The assertion below keeps the RED phase an intentional test failure.
  }

  assert.ok(rules, "website/lib/habit-validation.ts must provide shared web action rules");

  assert.deepEqual(rules.validateWebHabitTarget(10, "minutes"), { ok: true, value: 10 });
  assert.equal(rules.validateWebHabitTarget(2.5, "minutes").ok, false);
  assert.equal(rules.validateWebHabitTarget(1441, "minutes").ok, false);
  assert.equal(rules.defaultWebLogValue(10, "minutes"), 2);

  assert.deepEqual(rules.validateWebLogValue(2, { metricType: "minutes", target: 10 }), {
    ok: true,
    value: 2,
  });
  assert.equal(rules.validateWebLogValue(2.5, { metricType: "minutes", target: 10 }).ok, false);
  assert.deepEqual(rules.validateWebLogValue(2.5, { metricType: "distance_km", target: 10 }), {
    ok: true,
    value: 2.5,
  });

  assert.equal(
    rules.validateWebCompletionPeriod("2026-07-12", {
      todayKey: "2026-07-11",
      operation: "log",
    }).ok,
    false,
  );
  assert.equal(
    rules.validateWebCompletionPeriod("2026-07-03", {
      todayKey: "2026-07-11",
      operation: "log",
    }).ok,
    false,
  );
  assert.deepEqual(
    rules.validateWebCompletionPeriod("2026-07-04", {
      todayKey: "2026-07-11",
      operation: "log",
    }),
    { ok: true },
  );
  assert.deepEqual(
    rules.validateWebCompletionPeriod("2026-01-01", {
      todayKey: "2026-07-11",
      operation: "undo",
      existingCompletion: true,
    }),
    { ok: true },
  );
});

test("native suggested and widget check-ins pass validated habit metadata to the action boundary", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  const widget = readFileSync("app/widget/check-in.tsx", "utf8");

  const primaryCheckIn =
    dashboard.match(
      /async function handleToggle[\s\S]*?async function handleLogSheetSubmit/,
    )?.[0] ?? "";
  assert.match(
    primaryCheckIn,
    /logCompletionOnce\([\s\S]*?suggestion\.value,[\s\S]*?undefined,[\s\S]*?habit[\s\S]*?\)/,
  );
  assert.match(
    widget,
    /logCompletionOnce\([\s\S]*?checkIn\.amount,[\s\S]*?undefined,[\s\S]*?validated\.habit[\s\S]*?\)/,
  );
});

test("website actions enforce the shared rules before an exact-once write", () => {
  const actions = readFileSync("website/app/(app)/dashboard/actions.ts", "utf8");

  assert.match(actions, /validateWebHabitTarget/);
  assert.match(actions, /defaultWebLogValue/);
  assert.match(actions, /validateWebCompletionPeriod/);
  assert.match(actions, /validateWebLogValue/);
  assert.match(actions, /select\("target, default_log_value, metric_type"\)/);
});
