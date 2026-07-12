import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateHabitInput, validateLogValueForHabit } from "../lib/habits/input-rules.ts";
import {
  inferHabitIntelligence,
  progressForHabit,
  suggestedCheckInForHabit,
} from "../lib/coach/habit-intelligence.ts";
import { widgetCheckInForValidatedState } from "../lib/widgets/widget-check-in.ts";
import { buildWidgetUpcomingInput } from "../lib/widgets/widget-upcoming.ts";
import * as websiteHabitProgress from "../website/lib/habit-progress.ts";
import {
  defaultWebLogValue,
  validateWebHabitTarget,
  validateWebLogValue,
} from "../website/lib/habit-validation.ts";

const VALID_TARGETS = [
  ["volume_ml", 2000, 500],
  ["steps", 10000, 2500],
  ["pages", 10, 2],
  ["minutes", 10, 2],
  ["hours", 2.5, 0.625],
  ["distance_km", 2.5, 0.625],
];

test("native and web target/default/log rules agree through a suggested check-in", () => {
  for (const [metricType, target, expectedDefault] of VALID_TARGETS) {
    const nativeTarget = validateHabitInput({
      name: `Parity ${metricType}`,
      metricType,
      target,
    });
    const webTarget = validateWebHabitTarget(target, metricType);
    assert.equal(nativeTarget.ok, true, `${metricType} native target`);
    assert.equal(webTarget.ok, true, `${metricType} web target`);

    const defaultValue = defaultWebLogValue(target, metricType);
    assert.equal(defaultValue, expectedDefault, `${metricType} default`);
    assert.deepEqual(
      validateLogValueForHabit(defaultValue, { metricType, target }),
      { ok: true, value: defaultValue },
      `${metricType} native log`,
    );
    assert.deepEqual(
      validateWebLogValue(defaultValue, { metricType, target }),
      { ok: true, value: defaultValue },
      `${metricType} web log`,
    );

    const habit = {
      name: `Parity ${metricType}`,
      description: null,
      icon: "check",
      metric_type: metricType,
      target,
      unit: metricType,
      default_log_value: defaultValue,
    };
    assert.equal(
      suggestedCheckInForHabit(habit, progressForHabit(habit, null))?.value,
      defaultValue,
      `${metricType} suggested check-in`,
    );
  }
});

test("native and web reject fractional targets for whole-number metrics", () => {
  for (const metricType of ["volume_ml", "steps", "pages", "minutes"]) {
    const native = validateHabitInput({
      name: `Fractional ${metricType}`,
      metricType,
      target: 2.5,
    });
    const web = validateWebHabitTarget(2.5, metricType);
    assert.equal(native.ok, false, `${metricType} native target`);
    assert.equal(web.ok, false, `${metricType} web target`);
    if (!native.ok && !web.ok) assert.equal(native.errors[0], web.error);
  }
});

test("legacy fractional defaults use a valid whole-number suggestion when one fits", () => {
  const habit = {
    id: "legacy-minutes",
    name: "Legacy focus",
    description: null,
    icon: "timer",
    metric_type: "minutes",
    target: 10,
    unit: "min",
    default_log_value: 2.5,
    archived_at: null,
  };

  assert.equal(suggestedCheckInForHabit(habit, progressForHabit(habit, null))?.value, 2);
  assert.deepEqual(
    widgetCheckInForValidatedState({ ok: true, habit, completions: [] }, "2026-07-11"),
    { habitId: "legacy-minutes", amount: 2 },
  );
});

test("legacy whole-number metrics offer no suggestion when less than one unit remains", () => {
  const habit = {
    id: "legacy-minutes",
    name: "Legacy focus",
    description: null,
    icon: "timer",
    metric_type: "minutes",
    target: 2.5,
    unit: "min",
    default_log_value: 2.5,
    archived_at: null,
  };

  assert.equal(suggestedCheckInForHabit(habit, progressForHabit(habit, { value: 2 })), null);
  assert.equal(
    widgetCheckInForValidatedState(
      {
        ok: true,
        habit,
        completions: [{ completed_on: "2026-07-11", value: 2 }],
      },
      "2026-07-11",
    ),
    null,
  );
});

test("widget upcoming amounts match the deep-link route's fresh validation", () => {
  const habit = {
    id: "parity-widget",
    name: "Focus",
    description: null,
    icon: "timer",
    metric_type: "minutes",
    target: 100,
    unit: "min",
    default_log_value: 25,
    archived_at: null,
  };

  // Both paths funnel through suggestedCheckInForHabit, so the amount shown on
  // the widget and the amount the check-in route logs must agree.
  const [entry] = buildWidgetUpcomingInput({
    timelineEntries: [{ habit, time: "08:00" }],
    completedToday: new Set(),
    todayProgress: new Map([[habit.id, progressForHabit(habit, { value: 40 })]]),
    preferredHabitId: null,
  });
  assert.deepEqual(
    { habitId: entry.id, amount: entry.checkInValue },
    widgetCheckInForValidatedState(
      { ok: true, habit, completions: [{ completed_on: "2026-07-11", value: 40 }] },
      "2026-07-11",
    ),
  );
});

test("web action helper normalizes legacy fractional defaults before validation", () => {
  assert.equal(
    typeof websiteHabitProgress.resolveWebCheckInIncrement,
    "function",
    "the web action needs one executable increment resolver",
  );
  const habit = {
    name: "Legacy focus",
    target: 5,
    default_log_value: 1.25,
    metric_type: "minutes",
    unit: "min",
  };

  const increment = websiteHabitProgress.resolveWebCheckInIncrement(habit, 0);
  assert.equal(increment, 1);
  assert.deepEqual(validateWebLogValue(increment, { metricType: "minutes", target: 5 }), {
    ok: true,
    value: 1,
  });
  assert.equal(
    websiteHabitProgress.habitCheckInActionLabel(habit, 0, false),
    "Log 1 min for Legacy focus",
  );
  assert.equal(
    websiteHabitProgress.resolveWebCheckInIncrement(
      { ...habit, target: 2.5, default_log_value: 2.5 },
      2,
    ),
    1,
  );

  const actions = readFileSync("website/app/(app)/dashboard/actions.ts", "utf8");
  assert.match(actions, /resolveWebCheckInIncrement\(habit, currentValue\)/);
  assert.match(
    actions,
    /if \(increment == null\) return \{ ok: false, error:/,
    "an unloggable legacy row must not report a silent success",
  );
});

test("native form validates canonical targets but submits the selected display-unit value", () => {
  const canonicalWater = inferHabitIntelligence({
    name: "Drink water",
    unit: "l",
    target: 2.5,
    habitType: "water_intake",
    metricType: "volume_ml",
  });
  assert.equal(canonicalWater.target, 2500);
  assert.equal(
    validateHabitInput({
      name: "Drink water",
      metricType: canonicalWater.metricType,
      target: canonicalWater.target,
    }).ok,
    true,
  );

  const form = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(form, /validateHabitInput\(\{[\s\S]*?target: intelligence\.target,[\s\S]*?\}\)/);
  assert.match(form, /target:\s*habitRules\.data\.target == null \? null : parsedTarget\.value/);
});
