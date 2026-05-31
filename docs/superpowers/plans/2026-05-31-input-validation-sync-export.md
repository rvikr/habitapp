# Input Validation Sync Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved validation, check-in, streak, offline queue, empty-state, and export-integrity behavior from `docs/superpowers/specs/2026-05-31-input-validation-sync-export-design.md`.

**Architecture:** Put core behavior in pure rule modules, cover those modules with `tests/unit.test.mjs`, then wire the rules into existing React Native data actions and screens. Keep Supabase calls thin and deterministic; local rules decide what is valid before persistence or queueing.

**Tech Stack:** Expo Router, React Native, TypeScript, Supabase JS, app-local storage abstraction, Node's built-in `assert` test runner in `tests/unit.test.mjs`.

---

## File Structure

- Create `lib/habits/input-rules.ts`: Pure habit name, schedule, reminder time, target, and log-value rules.
- Modify `lib/auth/validation.ts`: Delegate reminder time and numeric parsing to the shared rule module while preserving current public function names.
- Modify `components/habit-form.tsx`: Use shared rules for form-level errors and normalized schedule payloads.
- Modify `lib/data/actions.ts`: Enforce shared rules inside direct data actions, read active habits for duplicate checks, accept optional completion date keys, and route retryable failures through the offline queue.
- Create `lib/data/completion-rules.ts`: Pure date-key, lookback, future-date, undo, and completion-value rules.
- Modify `lib/data/completions.ts`: Use completion-value normalization instead of silently converting invalid values to zero.
- Modify `lib/utils/date.ts`: Add app-side date-key validation, date-key arithmetic, and day-index helpers that match `website/lib/date.ts`.
- Create `lib/coach/streak-rules.ts`: Pure scheduled-day and grace-cutoff streak calculation.
- Modify `lib/coach/streak.ts`: Keep `streakFromDates` as a daily wrapper over the new streak rules.
- Create `lib/data/offline-queue.ts`: Persistent queue, compaction, and reconciliation helpers.
- Create `lib/utils/export-integrity.ts`: Build a versioned export object and integrity summary from already-fetched rows.
- Modify `lib/utils/privacy.ts`: Fail on Supabase query errors and return the versioned export object.
- Modify empty-state source files only where gaps remain: `app/(tabs)/index.tsx`, `app/habits/[id]/index.tsx`, `components/insights-strip.tsx`, `app/(tabs)/achievements.tsx`, and `app/(tabs)/settings/privacy.tsx`.
- Modify `tests/unit.test.mjs`: Add focused tests before each behavior change.

## Commands

- Unit tests: `npm test`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`

Run full `npm test` after each task. Run `npm run typecheck` and `npm run lint` before final completion.

---

### Task 1: Shared Habit And Schedule Rules

**Files:**

- Create: `lib/habits/input-rules.ts`
- Modify: `lib/auth/validation.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing tests for habit input and schedule rules**

Add imports near the existing validation imports in `tests/unit.test.mjs`:

```js
import {
  HABIT_NAME_MAX_LENGTH,
  normalizeHabitName,
  normalizeReminderSchedule,
  validateHabitInput,
  validateLogValueForHabit,
} from "../lib/habits/input-rules.ts";
```

Add tests near the existing reminder and positive number validation tests:

```js
test("habit input rules reject empty long and duplicate names", () => {
  const existing = [
    { id: "h1", name: "Drink Water", archived_at: null },
    { id: "h2", name: "Archived Habit", archived_at: "2026-05-01T00:00:00Z" },
  ];

  assert.deepEqual(normalizeHabitName("  Drink   Water  "), "Drink Water");
  assert.equal(
    validateHabitInput({ name: "   ", metricType: "boolean", target: null, existingHabits: [] }).ok,
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
});
```

- [ ] **Step 2: Run tests and verify the new tests fail**

Run: `npm test`

Expected: `not ok - habit input rules reject empty long and duplicate names` with a module-not-found error for `../lib/habits/input-rules.ts`.

- [ ] **Step 3: Create the shared rule module**

Create `lib/habits/input-rules.ts`:

```ts
import { REMINDER_TIME_PATTERN } from "../auth/validation";
import type { Habit, MetricType, ReminderStrategy } from "../../types/db";

export const HABIT_NAME_MAX_LENGTH = 80;
const DEFAULT_REMINDER_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const TARGET_MAX_BY_METRIC: Record<MetricType, number> = {
  volume_ml: 5000,
  steps: 50000,
  hours: 24,
  pages: 1000,
  minutes: 1440,
  distance_km: 50,
  boolean: 1,
};

const CUMULATIVE_METRICS = new Set<MetricType>(["steps", "volume_ml"]);

type ExistingHabit = Pick<Habit, "id" | "name" | "archived_at">;

type HabitInput = {
  name: string;
  metricType: MetricType;
  target: number | null;
  existingHabits?: ExistingHabit[];
  currentHabitId?: string | null;
};

type ReminderScheduleInput = {
  remindersEnabled: boolean;
  reminderStrategy: ReminderStrategy;
  reminderTimes: string[];
  reminderDays: number[];
  reminderIntervalMinutes: number | null;
};

type ReminderScheduleData = {
  remindersEnabled: boolean;
  reminderTimes: string[];
  reminderDays: number[];
  reminderIntervalMinutes: number | null;
};

type RuleResult<T> = { ok: true; data: T } | { ok: false; errors: string[] };
type ValueResult = { ok: true; value: number } | { ok: false; error: string };

export function normalizeHabitName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function duplicateKey(name: string): string {
  return normalizeHabitName(name).toLocaleLowerCase();
}

function targetMax(metricType: MetricType): number {
  return TARGET_MAX_BY_METRIC[metricType];
}

function isActiveDuplicate(candidate: HabitInput, existing: ExistingHabit): boolean {
  if (existing.archived_at) return false;
  if (candidate.currentHabitId && existing.id === candidate.currentHabitId) return false;
  return duplicateKey(existing.name) === duplicateKey(candidate.name);
}

export function validateHabitInput(
  input: HabitInput,
): RuleResult<{ name: string; target: number | null }> {
  const errors: string[] = [];
  const name = normalizeHabitName(input.name);

  if (!name) errors.push("Habit name is required.");
  if (name.length > HABIT_NAME_MAX_LENGTH) {
    errors.push(`Habit name must be ${HABIT_NAME_MAX_LENGTH} characters or fewer.`);
  }
  if ((input.existingHabits ?? []).some((habit) => isActiveDuplicate(input, habit))) {
    errors.push("A habit with this name already exists.");
  }

  if (input.metricType === "boolean") {
    return errors.length > 0 ? { ok: false, errors } : { ok: true, data: { name, target: null } };
  }

  if (input.target == null || !Number.isFinite(input.target) || input.target <= 0) {
    errors.push("Target must be a positive number.");
  } else if (input.target > targetMax(input.metricType)) {
    errors.push(`Target must be ${targetMax(input.metricType)} or less.`);
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, data: { name, target: input.target } };
}

export function normalizeReminderSchedule(
  input: ReminderScheduleInput,
): RuleResult<ReminderScheduleData> {
  if (!input.remindersEnabled) {
    return {
      ok: true,
      data: {
        remindersEnabled: false,
        reminderTimes: [],
        reminderDays: [...DEFAULT_REMINDER_DAYS],
        reminderIntervalMinutes: input.reminderIntervalMinutes,
      },
    };
  }

  const errors: string[] = [];
  const reminderTimes = [...new Set(input.reminderTimes.map((time) => time.trim()))].sort();
  const reminderDays = [...new Set(input.reminderDays)].sort((a, b) => a - b);

  if (
    reminderDays.length === 0 ||
    reminderDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  ) {
    errors.push("Choose at least one valid reminder day.");
  }
  if (reminderTimes.some((time) => !REMINDER_TIME_PATTERN.test(time))) {
    errors.push("Use valid 24-hour reminder times.");
  }
  if (input.reminderStrategy === "manual" && reminderTimes.length === 0) {
    errors.push("Add at least one reminder time or turn reminders off.");
  }
  if (
    input.reminderStrategy !== "manual" &&
    reminderTimes.length === 0 &&
    (!input.reminderIntervalMinutes || input.reminderIntervalMinutes <= 0)
  ) {
    errors.push("Choose a positive smart reminder interval or add an override time.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      remindersEnabled: true,
      reminderTimes,
      reminderDays,
      reminderIntervalMinutes: input.reminderIntervalMinutes,
    },
  };
}

export function validateLogValueForHabit(
  value: number,
  habit: { metricType: MetricType; target: number | null },
): ValueResult {
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Value must be a positive number." };
  }
  const normalized = Math.floor(value);
  if (normalized > targetMax(habit.metricType)) {
    return { ok: false, error: `Value must be ${targetMax(habit.metricType)} or less.` };
  }
  if (
    habit.target != null &&
    normalized > habit.target &&
    !CUMULATIVE_METRICS.has(habit.metricType)
  ) {
    return { ok: false, error: "Value cannot exceed the habit target." };
  }
  return { ok: true, value: normalized };
}
```

- [ ] **Step 4: Break the circular import in `lib/auth/validation.ts`**

Replace `lib/auth/validation.ts` with the same public API and local pattern constant:

```ts
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidReminderTime(value: string): boolean {
  return REMINDER_TIME_PATTERN.test(value.trim());
}

export function parseOptionalPositiveNumber(
  value: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: "Target must be a positive number." };
  }
  return { ok: true, value: parsed };
}

export function validateFeedback(input: { rating: number; message: string }): string | null {
  const message = input.message.trim();
  if (message.length < 10)
    return "Please add at least 10 characters so we can understand the feedback.";
  if (message.length > 2000) return "Please keep feedback under 2000 characters.";
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    return "Choose a rating from 1 to 5.";
  return null;
}
```

- [ ] **Step 5: Run tests and verify Task 1 passes**

Run: `npm test`

Expected: All tests pass, including the four new habit input rule tests.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add lib/habits/input-rules.ts lib/auth/validation.ts tests/unit.test.mjs
git commit -m "feat: add shared habit input rules"
```

---

### Task 2: Wire Habit Rules Into Forms And Data Actions

**Files:**

- Modify: `components/habit-form.tsx`
- Modify: `lib/data/actions.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing source tests for shared-rule integration**

Add this test near the existing habit form accessibility source test:

```js
test("habit form and actions use shared habit input rules", () => {
  const formSource = readFileSync("components/habit-form.tsx", "utf8");
  assert.match(formSource, /validateHabitInput/);
  assert.match(formSource, /normalizeReminderSchedule/);

  const actionsSource = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(actionsSource, /validateHabitInput/);
  assert.match(actionsSource, /normalizeReminderSchedule/);
  assert.match(actionsSource, /A habit with this name already exists/);
});
```

- [ ] **Step 2: Run tests and verify the source test fails**

Run: `npm test`

Expected: `not ok - habit form and actions use shared habit input rules` because the shared-rule imports are not present.

- [ ] **Step 3: Update `components/habit-form.tsx` imports**

Change the validation imports:

```ts
import { isValidReminderTime, parseOptionalPositiveNumber } from "@/lib/auth/validation";
import { normalizeReminderSchedule, validateHabitInput } from "@/lib/habits/input-rules";
```

- [ ] **Step 4: Replace local submit checks with shared-rule checks**

Inside `handleSubmit`, after `const intelligence = inferHabitIntelligence(...)`, insert:

```ts
const habitRules = validateHabitInput({
  name,
  metricType: intelligence.metricType,
  target: parsedTarget.value,
  existingHabits: [],
  currentHabitId: initial?.id ?? null,
});
if (!habitRules.ok) {
  setFormError(t(habitRules.errors[0]));
  return;
}

const scheduleRules = normalizeReminderSchedule({
  remindersEnabled,
  reminderStrategy: intelligence.reminderStrategy,
  reminderTimes,
  reminderDays,
  reminderIntervalMinutes: intelligence.reminderIntervalMinutes,
});
if (!scheduleRules.ok) {
  setFormError(t(scheduleRules.errors[0]));
  return;
}
```

Then remove the existing manual checks for manual reminder times, invalid reminder times, and invalid day indexes. In the payload, use normalized values:

```ts
      name: habitRules.data.name,
      target: habitRules.data.target,
      remindersEnabled: scheduleRules.data.remindersEnabled,
      reminderTimes: scheduleRules.data.reminderTimes,
      reminderDays: scheduleRules.data.reminderDays,
      reminderIntervalMinutes: scheduleRules.data.reminderIntervalMinutes,
```

- [ ] **Step 5: Update `lib/data/actions.ts` imports**

Add:

```ts
import { normalizeReminderSchedule, validateHabitInput } from "../habits/input-rules";
```

- [ ] **Step 6: Add a reusable action validation helper**

Place this helper below `runHabitValidation`:

```ts
async function validateHabitMutationInput(
  userId: string,
  data: HabitMutationData,
  intelligence: ReturnType<typeof inferHabitIntelligence>,
  currentHabitId?: string,
): Promise<{ ok: true; data: HabitMutationData } | { ok: false; error: string }> {
  const { data: existingHabits, error } = await supabase
    .from("habits")
    .select("id, name, archived_at")
    .eq("user_id", userId);
  if (error) return { ok: false, error: error.message };

  const habitRules = validateHabitInput({
    name: data.name,
    metricType: intelligence.metricType,
    target: intelligence.target,
    existingHabits: (existingHabits ?? []) as Pick<Habit, "id" | "name" | "archived_at">[],
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
  };
}
```

- [ ] **Step 7: Use the helper in `createHabit`**

After computing `intelligence`, insert:

```ts
const inputRules = await validateHabitMutationInput(user.id, data, intelligence);
if (!inputRules.ok) return { ok: false, id: null, error: inputRules.error };
data = inputRules.data;
```

When reading `existingHabits` for similar merge, keep the existing query because it needs full habit rows. Exact duplicate names are already rejected before this point.

- [ ] **Step 8: Use the helper in `updateHabitFull`**

After computing `intelligence`, insert:

```ts
const inputRules = await validateHabitMutationInput(user.id, data, intelligence, habitId);
if (!inputRules.ok) return { ok: false, error: inputRules.error };
data = inputRules.data;
```

- [ ] **Step 9: Run tests and verify Task 2 passes**

Run: `npm test`

Expected: All tests pass, including `habit form and actions use shared habit input rules`.

- [ ] **Step 10: Commit Task 2**

Run:

```bash
git add components/habit-form.tsx lib/data/actions.ts tests/unit.test.mjs
git commit -m "feat: enforce shared habit rules in mutations"
```

---

### Task 3: Completion Period Rules And Dated Actions

**Files:**

- Modify: `lib/utils/date.ts`
- Create: `lib/data/completion-rules.ts`
- Modify: `lib/data/completions.ts`
- Modify: `lib/data/actions.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing tests for app date-key helpers and completion rules**

Add imports:

```js
import {
  COMPLETION_LOOKBACK_DAYS,
  validateCompletionPeriod,
  validateCompletionValue,
} from "../lib/data/completion-rules.ts";
```

Extend the date import:

```js
import {
  addDateKeyDays,
  addLocalDays,
  dayIndexForDateKey,
  isValidDateKey as isValidAppDateKey,
  localDateDaysAgo,
  localDateKey,
} from "../lib/utils/date.ts";
```

Add tests near the current date-key tests:

```js
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
```

- [ ] **Step 2: Run tests and verify the new tests fail**

Run: `npm test`

Expected: `not ok - app date helpers validate date keys and add calendar days` because the new app date helpers are not exported.

- [ ] **Step 3: Add app date-key helpers**

Append to `lib/utils/date.ts`:

```ts
export function addDateKeyDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getUTCDate()).padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function dayIndexForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}
```

- [ ] **Step 4: Create completion rules**

Create `lib/data/completion-rules.ts`:

```ts
import { addDateKeyDays, isValidDateKey, localDateKey } from "../utils/date";
import { validateLogValueForHabit } from "../habits/input-rules";
import type { MetricType } from "../../types/db";

export const COMPLETION_LOOKBACK_DAYS = 7;

type PeriodOperation = "log" | "set" | "done" | "undo";

type PeriodOptions = {
  now?: Date;
  operation?: PeriodOperation;
  lookbackDays?: number;
  existingCompletion?: boolean;
};

export type CompletionRuleResult = { ok: true } | { ok: false; error: string };

export function validateCompletionPeriod(
  completedOn: string,
  options: PeriodOptions = {},
): CompletionRuleResult {
  if (!isValidDateKey(completedOn)) return { ok: false, error: "Use a valid completion date." };
  if (options.operation === "undo" && options.existingCompletion) return { ok: true };

  const now = options.now ?? new Date();
  const today = localDateKey(now);
  if (completedOn > today) return { ok: false, error: "Completion date cannot be in the future." };

  const earliest = addDateKeyDays(today, -(options.lookbackDays ?? COMPLETION_LOOKBACK_DAYS));
  if (completedOn < earliest) {
    return {
      ok: false,
      error: `You can only mark habits done for the last ${options.lookbackDays ?? COMPLETION_LOOKBACK_DAYS} days.`,
    };
  }

  return { ok: true };
}

export function validateCompletionValue(
  value: number,
  habit: { metricType: MetricType; target: number | null },
) {
  return validateLogValueForHabit(value, habit);
}
```

- [ ] **Step 5: Update completion payload normalization**

Change `lib/data/completions.ts`:

```ts
import { validateCompletionValue } from "./completion-rules";

export function buildCompletionValuePayload(
  habitId: string,
  userId: string,
  completedOn: string,
  value: number,
  note?: string,
  habit?: {
    metricType: Parameters<typeof validateCompletionValue>[1]["metricType"];
    target: number | null;
  },
) {
  const normalized = habit
    ? validateCompletionValue(value, habit)
    : { ok: true as const, value: Math.max(1, Math.floor(Number.isFinite(value) ? value : 1)) };
  if (!normalized.ok) throw new Error(normalized.error);
  return {
    habit_id: habitId,
    user_id: userId,
    completed_on: completedOn,
    value: normalized.value,
    note: note?.trim() || null,
  };
}
```

- [ ] **Step 6: Add optional date keys to mutation actions**

Change signatures in `lib/data/actions.ts`:

```ts
export async function logCompletion(
  habitId: string,
  value?: number,
  note?: string,
  completedOn = localDateKey(),
): Promise<ActionResult> {
```

```ts
export async function setCompletionValue(
  habitId: string,
  value: number,
  note?: string,
  completedOn = localDateKey(),
): Promise<ActionResult> {
```

```ts
export async function toggleHabit(
  habitId: string,
  currentlyDone: boolean,
  knownTarget?: number | null,
  completedOn = localDateKey(),
): Promise<ActionResult> {
```

Use `completedOn` in RPC/upsert/delete filters instead of calling `localDateKey()` inside each query.

- [ ] **Step 7: Enforce completion period checks in actions**

Import:

```ts
import { validateCompletionPeriod, validateCompletionValue } from "./completion-rules";
```

In `logCompletion`, before the RPC:

```ts
const period = validateCompletionPeriod(completedOn, { operation: "log" });
if (!period.ok) return { ok: false, error: period.error };
```

In `setCompletionValue`, before upsert:

```ts
const period = validateCompletionPeriod(completedOn, { operation: "set" });
if (!period.ok) return { ok: false, error: period.error };
```

In `toggleHabit`, use:

```ts
const period = validateCompletionPeriod(completedOn, {
  operation: currentlyDone ? "undo" : "done",
  existingCompletion: currentlyDone,
});
if (!period.ok) return { ok: false, error: period.error };
```

In `setCompletionValue`, read the habit target and metric before building the payload:

```ts
const { data: habit, error: habitError } = await supabase
  .from("habits")
  .select("target, metric_type")
  .eq("id", habitId)
  .eq("user_id", user.id)
  .single();
if (habitError) return mutationResult(habitError);
const normalizedValue = validateCompletionValue(value, {
  metricType: (habit as { metric_type: MetricType | null }).metric_type ?? "boolean",
  target: (habit as { target: number | null }).target,
});
if (!normalizedValue.ok) return { ok: false, error: normalizedValue.error };
```

Update the existing `type Habit` import to include `MetricType`, then pass `normalizedValue.value` to `buildCompletionValuePayload`.

- [ ] **Step 8: Run tests and verify Task 3 passes**

Run: `npm test`

Expected: All tests pass, including the new completion period and date helper tests.

- [ ] **Step 9: Commit Task 3**

Run:

```bash
git add lib/utils/date.ts lib/data/completion-rules.ts lib/data/completions.ts lib/data/actions.ts tests/unit.test.mjs
git commit -m "feat: enforce completion period rules"
```

---

### Task 4: Scheduled Streak And Grace-Day Rules

**Files:**

- Create: `lib/coach/streak-rules.ts`
- Modify: `lib/coach/streak.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing tests for scheduled streaks and grace cutoff**

Add import:

```js
import { streakForSchedule } from "../lib/coach/streak-rules.ts";
```

Add tests near the existing streak tests:

```js
test("scheduled streak skips unscheduled days", () => {
  const from = new Date(2026, 5, 5, 12, 0); // Friday
  const dates = ["2026-06-05", "2026-06-03", "2026-06-01"];
  assert.equal(streakForSchedule(dates, { from, scheduledDays: [1, 3, 5] }), 3);
});

test("scheduled streak breaks on a missed scheduled day", () => {
  const from = new Date(2026, 5, 5, 12, 0); // Friday
  const dates = ["2026-06-05", "2026-06-01"];
  assert.equal(streakForSchedule(dates, { from, scheduledDays: [1, 3, 5] }), 1);
});

test("grace cutoff displays yesterday streak before cutoff only", () => {
  const beforeCutoff = new Date(2026, 4, 31, 8, 0);
  const afterCutoff = new Date(2026, 4, 31, 12, 0);
  const dates = ["2026-05-30", "2026-05-29"];
  assert.equal(streakForSchedule(dates, { from: beforeCutoff, graceCutoffHour: 10 }), 2);
  assert.equal(streakForSchedule(dates, { from: afterCutoff, graceCutoffHour: 10 }), 0);
});

test("backfilled completion restores scheduled streak", () => {
  const from = new Date(2026, 5, 5, 12, 0); // Friday
  assert.equal(
    streakForSchedule(["2026-06-05", "2026-06-01"], { from, scheduledDays: [1, 3, 5] }),
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
```

- [ ] **Step 2: Run tests and verify the new tests fail**

Run: `npm test`

Expected: module-not-found failure for `../lib/coach/streak-rules.ts`.

- [ ] **Step 3: Create `lib/coach/streak-rules.ts`**

```ts
import { addDateKeyDays, dayIndexForDateKey, localDateKey } from "../utils/date";

type StreakOptions = {
  from?: Date;
  scheduledDays?: number[];
  graceCutoffHour?: number | null;
};

function normalizedSchedule(days: number[] | undefined): Set<number> {
  const source = days && days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6];
  return new Set(source.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));
}

function previousScheduledDateKey(dateKey: string, scheduledDays: Set<number>): string {
  let cursor = addDateKeyDays(dateKey, -1);
  while (!scheduledDays.has(dayIndexForDateKey(cursor))) {
    cursor = addDateKeyDays(cursor, -1);
  }
  return cursor;
}

function anchorDateKey(
  from: Date,
  completed: Set<string>,
  scheduledDays: Set<number>,
  graceCutoffHour: number | null | undefined,
): string {
  const today = localDateKey(from);
  if (completed.has(today)) return today;
  if (graceCutoffHour != null && from.getHours() < graceCutoffHour) {
    return previousScheduledDateKey(today, scheduledDays);
  }
  return today;
}

export function streakForSchedule(completedDates: string[], options: StreakOptions = {}): number {
  if (completedDates.length === 0) return 0;

  const completed = new Set(completedDates);
  const from = options.from ?? new Date();
  const scheduledDays = normalizedSchedule(options.scheduledDays);
  let cursor = anchorDateKey(from, completed, scheduledDays, options.graceCutoffHour);
  let streak = 0;

  while (completed.has(cursor)) {
    streak++;
    cursor = previousScheduledDateKey(cursor, scheduledDays);
  }

  return streak;
}
```

- [ ] **Step 4: Update the existing wrapper**

Replace `lib/coach/streak.ts` with:

```ts
import { streakForSchedule } from "./streak-rules";

export function streakFromDates(completedDates: string[], from = new Date()): number {
  return streakForSchedule(completedDates, { from });
}
```

- [ ] **Step 5: Run tests and verify Task 4 passes**

Run: `npm test`

Expected: All tests pass, including existing DST streak tests and new schedule/grace tests.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add lib/coach/streak-rules.ts lib/coach/streak.ts tests/unit.test.mjs
git commit -m "feat: add scheduled streak rules"
```

---

### Task 5: Offline Queue Core

**Files:**

- Create: `lib/data/offline-queue.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing tests for queue persistence, compaction, and reconciliation**

Add imports:

```js
import {
  OFFLINE_QUEUE_STORAGE_KEY,
  compactOfflineMutations,
  createOfflineQueue,
  reconcileOfflineMutations,
} from "../lib/data/offline-queue.ts";
```

Add tests after `createMemoryStorage`:

```js
test("offline queue persists operations across storage reload", async () => {
  const storage = createMemoryStorage();
  const queue = createOfflineQueue(storage);
  await queue.enqueue({
    id: "m1",
    type: "completion.set",
    entityKey: "completion:h1:2026-05-31",
    payload: { habitId: "h1", completedOn: "2026-05-31", value: 1 },
    createdAt: "2026-05-31T10:00:00.000Z",
    clientUpdatedAt: "2026-05-31T10:00:00.000Z",
  });

  const reloaded = createOfflineQueue(storage);
  assert.equal((await reloaded.read()).length, 1);
  assert.match(storage.values.get(OFFLINE_QUEUE_STORAGE_KEY), /completion\.set/);
});

test("offline queue compacts habit updates by last write", () => {
  const compacted = compactOfflineMutations([
    {
      id: "old",
      type: "habit.upsert",
      entityKey: "habit:h1",
      payload: { name: "Old" },
      createdAt: "2026-05-31T10:00:00.000Z",
      clientUpdatedAt: "2026-05-31T10:00:00.000Z",
    },
    {
      id: "new",
      type: "habit.upsert",
      entityKey: "habit:h1",
      payload: { name: "New" },
      createdAt: "2026-05-31T10:01:00.000Z",
      clientUpdatedAt: "2026-05-31T10:01:00.000Z",
    },
  ]);
  assert.deepEqual(
    compacted.map((item) => item.id),
    ["new"],
  );
});

test("offline queue folds completion increments and honors newest delete", () => {
  const compacted = compactOfflineMutations([
    {
      id: "inc1",
      type: "completion.increment",
      entityKey: "completion:h1:2026-05-31",
      payload: { value: 2 },
      createdAt: "2026-05-31T10:00:00.000Z",
      clientUpdatedAt: "2026-05-31T10:00:00.000Z",
    },
    {
      id: "inc2",
      type: "completion.increment",
      entityKey: "completion:h1:2026-05-31",
      payload: { value: 3 },
      createdAt: "2026-05-31T10:01:00.000Z",
      clientUpdatedAt: "2026-05-31T10:01:00.000Z",
    },
    {
      id: "delete",
      type: "completion.delete",
      entityKey: "completion:h1:2026-05-31",
      payload: {},
      createdAt: "2026-05-31T10:02:00.000Z",
      clientUpdatedAt: "2026-05-31T10:02:00.000Z",
    },
  ]);
  assert.deepEqual(
    compacted.map((item) => item.id),
    ["delete"],
  );
});

test("offline reconciliation keeps retryable failures queued and removes permanent failures", async () => {
  const retryable = {
    id: "retry",
    type: "habit.upsert",
    entityKey: "habit:h1",
    payload: {},
    createdAt: "2026-05-31T10:00:00.000Z",
    clientUpdatedAt: "2026-05-31T10:00:00.000Z",
  };
  const permanent = {
    ...retryable,
    id: "bad",
    entityKey: "habit:h2",
    clientUpdatedAt: "2026-05-31T10:01:00.000Z",
  };
  const remaining = await reconcileOfflineMutations([retryable, permanent], async (mutation) => {
    if (mutation.id === "retry") return { ok: false, retry: true };
    return { ok: false, retry: false };
  });
  assert.deepEqual(
    remaining.map((item) => item.id),
    ["retry"],
  );
});
```

- [ ] **Step 2: Run tests and verify the queue tests fail**

Run: `npm test`

Expected: module-not-found failure for `../lib/data/offline-queue.ts`.

- [ ] **Step 3: Create `lib/data/offline-queue.ts`**

```ts
import type { getItem, removeItem, setItem } from "../platform/storage";

export const OFFLINE_QUEUE_STORAGE_KEY = "habbit:offline-mutation-queue";

export type OfflineMutationType =
  | "habit.upsert"
  | "habit.archive"
  | "completion.set"
  | "completion.increment"
  | "completion.delete";

export type OfflineMutation = {
  id: string;
  type: OfflineMutationType;
  entityKey: string;
  payload: Record<string, unknown>;
  createdAt: string;
  clientUpdatedAt: string;
};

type StorageLike = {
  getItem: typeof getItem;
  setItem: typeof setItem;
  removeItem: typeof removeItem;
};

type SendResult = { ok: true } | { ok: false; retry: boolean };

function byClientUpdatedAt(a: OfflineMutation, b: OfflineMutation): number {
  return a.clientUpdatedAt.localeCompare(b.clientUpdatedAt);
}

function newest(items: OfflineMutation[]): OfflineMutation {
  return [...items].sort(byClientUpdatedAt).at(-1)!;
}

function compactCompletion(items: OfflineMutation[]): OfflineMutation[] {
  const sorted = [...items].sort(byClientUpdatedAt);
  const latestTerminal = [...sorted]
    .reverse()
    .find((item) => item.type === "completion.set" || item.type === "completion.delete");
  if (latestTerminal?.type === "completion.delete") return [latestTerminal];
  if (latestTerminal?.type === "completion.set") return [latestTerminal];

  const increments = sorted.filter((item) => item.type === "completion.increment");
  if (increments.length === 0) return [];
  const total = increments.reduce((sum, item) => sum + Number(item.payload.value ?? 0), 0);
  const last = increments.at(-1)!;
  return [{ ...last, payload: { ...last.payload, value: total } }];
}

export function compactOfflineMutations(mutations: OfflineMutation[]): OfflineMutation[] {
  const groups = new Map<string, OfflineMutation[]>();
  for (const mutation of mutations) {
    const list = groups.get(mutation.entityKey) ?? [];
    list.push(mutation);
    groups.set(mutation.entityKey, list);
  }

  const compacted: OfflineMutation[] = [];
  for (const items of groups.values()) {
    if (items[0]?.type.startsWith("completion.")) {
      compacted.push(...compactCompletion(items));
    } else {
      compacted.push(newest(items));
    }
  }

  return compacted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createOfflineQueue(storage: StorageLike, key = OFFLINE_QUEUE_STORAGE_KEY) {
  async function read(): Promise<OfflineMutation[]> {
    const raw = await storage.getItem(key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as OfflineMutation[]) : [];
    } catch {
      return [];
    }
  }

  async function write(mutations: OfflineMutation[]): Promise<void> {
    if (mutations.length === 0) await storage.removeItem(key);
    else await storage.setItem(key, JSON.stringify(mutations));
  }

  return {
    read,
    replace: write,
    async enqueue(mutation: OfflineMutation): Promise<void> {
      const current = await read();
      await write([...current, mutation]);
    },
  };
}

export async function reconcileOfflineMutations(
  mutations: OfflineMutation[],
  send: (mutation: OfflineMutation) => Promise<SendResult>,
): Promise<OfflineMutation[]> {
  const remaining: OfflineMutation[] = [];
  for (const mutation of compactOfflineMutations(mutations)) {
    const result = await send(mutation);
    if (!result.ok && result.retry) remaining.push(mutation);
  }
  return remaining;
}
```

- [ ] **Step 4: Run tests and verify Task 5 passes**

Run: `npm test`

Expected: All tests pass, including the four offline queue tests.

- [ ] **Step 5: Commit Task 5**

Run:

```bash
git add lib/data/offline-queue.ts tests/unit.test.mjs
git commit -m "feat: add offline mutation queue"
```

---

### Task 6: Offline Queue Integration In Mutations

**Files:**

- Modify: `lib/data/actions.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write source tests for queue integration**

Add:

```js
test("habit mutations enqueue retryable offline operations", () => {
  const source = readFileSync("lib/data/actions.ts", "utf8");
  assert.match(source, /createOfflineQueue/);
  assert.match(source, /queueRetryableMutation/);
  assert.match(source, /habit\.upsert/);
  assert.match(source, /habit\.archive/);
  assert.match(source, /completion\.set/);
  assert.match(source, /completion\.increment/);
  assert.match(source, /completion\.delete/);
});
```

- [ ] **Step 2: Run tests and verify the integration source test fails**

Run: `npm test`

Expected: `not ok - habit mutations enqueue retryable offline operations`.

- [ ] **Step 3: Import queue and storage in `lib/data/actions.ts`**

```ts
import { getItem, removeItem, setItem } from "../platform/storage";
import {
  createOfflineQueue,
  type OfflineMutation,
  type OfflineMutationType,
} from "./offline-queue";
```

- [ ] **Step 4: Add retry classification and queue helper**

Place below `networkError()`:

```ts
const offlineQueue = createOfflineQueue({ getItem, setItem, removeItem });

function isRetryableError(error: unknown): boolean {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return /network|fetch|timeout|offline|connection/i.test(message);
}

async function queueRetryableMutation(
  type: OfflineMutationType,
  entityKey: string,
  payload: Record<string, unknown>,
  error: unknown,
): Promise<ActionResult & { queued?: boolean }> {
  if (!isRetryableError(error)) {
    return {
      ok: false,
      error:
        error && typeof error === "object" && "message" in error
          ? String((error as { message?: unknown }).message ?? "Something went wrong.")
          : "Something went wrong.",
    };
  }
  const now = new Date().toISOString();
  const mutation: OfflineMutation = {
    id: `${type}:${entityKey}:${now}`,
    type,
    entityKey,
    payload,
    createdAt: now,
    clientUpdatedAt: now,
  };
  await offlineQueue.enqueue(mutation);
  return { ok: true, queued: true };
}
```

- [ ] **Step 5: Wrap completion mutations**

For `logCompletion`, if the RPC returns an error, replace `return mutationResult(error);` with:

```ts
if (error) {
  return queueRetryableMutation(
    "completion.increment",
    `completion:${habitId}:${completedOn}`,
    { habitId, completedOn, value: value ?? 1, note: note?.trim() || null },
    error,
  );
}
```

For `setCompletionValue`, if the upsert returns an error:

```ts
if (error) {
  return queueRetryableMutation(
    "completion.set",
    `completion:${habitId}:${completedOn}`,
    { habitId, completedOn, value, note: note?.trim() || null },
    error,
  );
}
```

For `toggleHabit`, use:

```ts
if (error) {
  return queueRetryableMutation(
    "completion.delete",
    `completion:${habitId}:${completedOn}`,
    { habitId, completedOn },
    error,
  );
}
```

and for the completion upsert error:

```ts
if (error) {
  return queueRetryableMutation(
    "completion.set",
    `completion:${habitId}:${completedOn}`,
    { habitId, completedOn, value: resolvedTarget },
    error,
  );
}
```

- [ ] **Step 6: Wrap habit create/update/archive mutations**

For create insert failure that is retryable and not a missing-column fallback:

```ts
return queueRetryableMutation(
  "habit.upsert",
  `habit:new:${user.id}:${data.name}`,
  smartHabitPayload(data, intelligence, user.id),
  error,
);
```

For update failure that is retryable and not a missing-column fallback:

```ts
return queueRetryableMutation(
  "habit.upsert",
  `habit:${habitId}`,
  smartHabitPayload(data, intelligence),
  error,
);
```

For archive failure in `deleteHabit`:

```ts
if (error) {
  return queueRetryableMutation(
    "habit.archive",
    `habit:${habitId}`,
    { habitId, archived_at: new Date().toISOString() },
    error,
  );
}
```

- [ ] **Step 7: Run tests and verify Task 6 passes**

Run: `npm test`

Expected: All tests pass, including `habit mutations enqueue retryable offline operations`.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add lib/data/actions.ts tests/unit.test.mjs
git commit -m "feat: queue retryable offline mutations"
```

---

### Task 7: Versioned Export And Integrity Summary

**Files:**

- Create: `lib/utils/export-integrity.ts`
- Modify: `lib/utils/privacy.ts`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing tests for export object integrity**

Add import:

```js
import { buildDataExport } from "../lib/utils/export-integrity.ts";
```

Add tests:

```js
test("data export includes version counts duplicates and orphans", () => {
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
  assert.equal(exported.integrity.counts.habits, 1);
  assert.equal(exported.integrity.counts.completions, 3);
  assert.deepEqual(exported.integrity.duplicate_completion_periods, ["h1:2026-05-31"]);
  assert.deepEqual(exported.integrity.orphan_completion_ids, ["c2"]);
  assert.deepEqual(
    exported.completions.map((completion) => completion.id),
    ["c3", "c2", "c1"],
  );
});

test("privacy export fails on query errors instead of returning partial data", () => {
  const source = readFileSync("lib/utils/privacy.ts", "utf8");
  assert.match(source, /profileResult/);
  assert.match(source, /habitResult/);
  assert.match(source, /completionResult/);
  assert.match(source, /return \{ ok: false, error:/);
  assert.match(source, /buildDataExport/);
});
```

- [ ] **Step 2: Run tests and verify the export tests fail**

Run: `npm test`

Expected: module-not-found failure for `../lib/utils/export-integrity.ts`.

- [ ] **Step 3: Create export builder**

Create `lib/utils/export-integrity.ts`:

```ts
type ExportInput = {
  exportedAt: string;
  user: { id: string; email: string | null };
  profile: unknown;
  habits: Record<string, unknown>[];
  completions: Record<string, unknown>[];
  sleepEntries: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
};

function stringValue(row: Record<string, unknown>, key: string): string {
  return typeof row[key] === "string" ? (row[key] as string) : "";
}

function sortByDateDescThenId(
  rows: Record<string, unknown>[],
  dateKey: string,
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const byDate = stringValue(b, dateKey).localeCompare(stringValue(a, dateKey));
    if (byDate !== 0) return byDate;
    const byCreated = stringValue(b, "created_at").localeCompare(stringValue(a, "created_at"));
    if (byCreated !== 0) return byCreated;
    return stringValue(a, "id").localeCompare(stringValue(b, "id"));
  });
}

function duplicateCompletionPeriods(completions: Record<string, unknown>[]): string[] {
  const counts = new Map<string, number>();
  for (const completion of completions) {
    const key = `${stringValue(completion, "habit_id")}:${stringValue(completion, "completed_on")}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();
}

function orphanCompletionIds(
  habits: Record<string, unknown>[],
  completions: Record<string, unknown>[],
): string[] {
  const habitIds = new Set(habits.map((habit) => stringValue(habit, "id")));
  return completions
    .filter((completion) => !habitIds.has(stringValue(completion, "habit_id")))
    .map((completion) => stringValue(completion, "id"))
    .filter(Boolean)
    .sort();
}

export function buildDataExport(input: ExportInput) {
  const habits = sortByDateDescThenId(input.habits, "created_at").reverse();
  const completions = sortByDateDescThenId(input.completions, "completed_on");
  const sleepEntries = sortByDateDescThenId(input.sleepEntries, "sleep_date");
  const feedback = sortByDateDescThenId(input.feedback, "created_at");

  return {
    schema_version: 1,
    exported_at: input.exportedAt,
    user: input.user,
    profile: input.profile,
    habits,
    completions,
    sleep_entries: sleepEntries,
    feedback,
    integrity: {
      counts: {
        habits: habits.length,
        completions: completions.length,
        sleep_entries: sleepEntries.length,
        feedback: feedback.length,
      },
      duplicate_completion_periods: duplicateCompletionPeriods(completions),
      orphan_completion_ids: orphanCompletionIds(habits, completions),
    },
  };
}
```

- [ ] **Step 4: Refactor `exportMyData` to use named query results and fail on errors**

Replace the query block in `lib/utils/privacy.ts` with:

```ts
const [profileResult, habitResult, completionResult, sleepResult, feedbackResult] =
  await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("habits")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("habit_completions")
      .select("*")
      .eq("user_id", user.id)
      .order("completed_on", { ascending: false }),
    supabase
      .from("sleep_entries")
      .select("*")
      .eq("user_id", user.id)
      .order("sleep_date", { ascending: false }),
    supabase
      .from("feedback_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

const failed = [profileResult, habitResult, completionResult, sleepResult, feedbackResult].find(
  (result) => result.error,
);
if (failed?.error) return { ok: false, error: failed.error.message };
```

Import `buildDataExport` and return:

```ts
    data: JSON.stringify(
      buildDataExport({
        exportedAt: new Date().toISOString(),
        user: { id: user.id, email: user.email ?? null },
        profile: profileResult.data ?? null,
        habits: (habitResult.data ?? []) as Record<string, unknown>[],
        completions: (completionResult.data ?? []) as Record<string, unknown>[],
        sleepEntries: (sleepResult.data ?? []) as Record<string, unknown>[],
        feedback: (feedbackResult.data ?? []) as Record<string, unknown>[],
      }),
      null,
      2,
    ),
```

- [ ] **Step 5: Run tests and verify Task 7 passes**

Run: `npm test`

Expected: All tests pass, including the two export integrity tests.

- [ ] **Step 6: Commit Task 7**

Run:

```bash
git add lib/utils/export-integrity.ts lib/utils/privacy.ts tests/unit.test.mjs
git commit -m "feat: add export integrity summary"
```

---

### Task 8: Empty-State Coverage

**Files:**

- Modify: `app/(tabs)/index.tsx`
- Modify: `app/habits/[id]/index.tsx`
- Modify: `components/insights-strip.tsx`
- Modify: `app/(tabs)/achievements.tsx`
- Modify: `app/(tabs)/settings/privacy.tsx`
- Modify: `tests/unit.test.mjs`

- [ ] **Step 1: Write failing source assertions for required empty states**

Add:

```js
test("core app surfaces include explicit empty states", () => {
  const dashboard = readFileSync("app/(tabs)/index.tsx", "utf8");
  assert.match(dashboard, /Build your first routine/);
  assert.match(dashboard, /Choose manually/);

  const detail = readFileSync("app/habits/[id]/index.tsx", "utf8");
  assert.match(detail, /No logs yet/);
  assert.match(detail, /This week will fill in as you log this habit/);

  const insights = readFileSync("components/insights-strip.tsx", "utf8");
  assert.match(insights, /Log a few days to see patterns/);

  const achievements = readFileSync("app/(tabs)/achievements.tsx", "utf8");
  assert.match(achievements, /No badges earned yet/);

  const privacy = readFileSync("app/(tabs)/settings/privacy.tsx", "utf8");
  assert.match(privacy, /integrity/);
});
```

- [ ] **Step 2: Run tests and verify the empty-state test fails**

Run: `npm test`

Expected: `not ok - core app surfaces include explicit empty states`.

- [ ] **Step 3: Add habit detail empty state copy**

In `app/habits/[id]/index.tsx`, before weekly bars when `completions.length === 0`, render:

```tsx
{
  completions.length === 0 && (
    <View className="mx-margin-mobile mb-lg bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
      <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
        No logs yet
      </Text>
      <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant mt-xs">
        This week will fill in as you log this habit.
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Add neutral insight empty state**

In `components/insights-strip.tsx`, if all values are null, return:

```tsx
if (
  insights.mostProductiveDay === null &&
  insights.consistencyChangePct === null &&
  insights.peakTimeLabel === null
) {
  return (
    <View className="mx-margin-mobile bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
      <Text className="text-body-sm text-on-surface dark:text-d-on-surface font-semibold">
        Log a few days to see patterns
      </Text>
    </View>
  );
}
```

- [ ] **Step 5: Add achievements empty state copy**

In `app/(tabs)/achievements.tsx`, where badges are rendered, show this when no earned badges exist:

```tsx
{
  badges.every((badge) => !badge.earned) && (
    <View className="bg-surface-container dark:bg-d-surface-container rounded-xl p-md">
      <Text className="text-body-md text-on-surface dark:text-d-on-surface font-semibold">
        No badges earned yet
      </Text>
    </View>
  );
}
```

- [ ] **Step 6: Make export integrity visible in privacy export modal**

In `app/(tabs)/settings/privacy.tsx`, keep showing the raw JSON export. Add a source-visible label near the modal title:

```tsx
              {t("Data export")}
            </Text>
            <Text className="text-label-sm text-on-surface-variant dark:text-d-on-surface-variant">
              {t("Includes integrity checks for counts, duplicates, and orphaned logs.")}
            </Text>
```

- [ ] **Step 7: Run tests and verify Task 8 passes**

Run: `npm test`

Expected: All tests pass, including the empty-state source assertions.

- [ ] **Step 8: Commit Task 8**

Run:

```bash
git add app/(tabs)/index.tsx app/habits/[id]/index.tsx components/insights-strip.tsx app/(tabs)/achievements.tsx app/(tabs)/settings/privacy.tsx tests/unit.test.mjs
git commit -m "feat: cover no-data states"
```

Use PowerShell quoting if needed:

```powershell
git add 'app/(tabs)/index.tsx' 'app/habits/[id]/index.tsx' components/insights-strip.tsx 'app/(tabs)/achievements.tsx' 'app/(tabs)/settings/privacy.tsx' tests/unit.test.mjs
```

---

### Task 9: Final Verification And Spec Status

**Files:**

- Modify: `docs/superpowers/specs/2026-05-31-input-validation-sync-export-design.md`

- [ ] **Step 1: Update spec status**

Change:

```md
Status: Awaiting user review before implementation planning
```

to:

```md
Status: Implemented
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
```

Expected:

- `npm test` exits `0`.
- `npm run typecheck` exits `0`.
- `npm run lint` exits `0`.

- [ ] **Step 3: Review working tree**

Run:

```bash
git status --short
git diff --stat
```

Expected: Only files from this plan are modified or staged. Existing unrelated website edits may still appear and must remain untouched.

- [ ] **Step 4: Commit final spec status**

Run:

```bash
git add docs/superpowers/specs/2026-05-31-input-validation-sync-export-design.md
git commit -m "docs: mark validation sync export implemented"
```

---

## Self-Review Notes

- Spec coverage: habit validation is Tasks 1-2; schedule/reminders are Tasks 1-2; completion periods and undo are Task 3; streak schedule/grace/DST behavior is Task 4 plus existing DST tests; offline queue and conflict semantics are Tasks 5-6; export integrity is Task 7; empty states are Task 8; final verification is Task 9.
- Type consistency: queue mutation types are defined once in Task 5 and imported in Task 6. Completion date helpers are added in Task 3 and reused in Task 4.
- Test strategy: every new pure behavior gets a failing `tests/unit.test.mjs` test before implementation. UI integration is covered with source assertions because the repo currently uses source-level tests for several UI wiring guarantees.
