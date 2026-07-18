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

const VALID_TARGETS = [
  ["volume_ml", 2000, 500],
  ["steps", 10000, 2500],
  ["pages", 10, 2],
  ["minutes", 10, 2],
  ["hours", 2.5, 0.625],
  ["distance_km", 2.5, 0.625],
];

test("native target/default/log rules agree through a suggested check-in", () => {
  for (const [metricType, target, expectedDefault] of VALID_TARGETS) {
    const nativeTarget = validateHabitInput({
      name: `Parity ${metricType}`,
      metricType,
      target,
    });
    assert.equal(nativeTarget.ok, true, `${metricType} native target`);

    const defaultValue = expectedDefault;
    assert.equal(defaultValue, expectedDefault, `${metricType} default`);
    assert.deepEqual(
      validateLogValueForHabit(defaultValue, { metricType, target }),
      { ok: true, value: defaultValue },
      `${metricType} native log`,
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

test("native rules reject fractional targets for whole-number metrics", () => {
  for (const metricType of ["volume_ml", "steps", "pages", "minutes"]) {
    const native = validateHabitInput({
      name: `Fractional ${metricType}`,
      metricType,
      target: 2.5,
    });
    assert.equal(native.ok, false, `${metricType} native target`);
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
