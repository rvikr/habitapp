import { REMINDER_TIME_PATTERN } from "../auth/validation.ts";
import type { Habit, MetricType, ReminderStrategy } from "../../types/db.ts";

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
const DECIMAL_METRICS = new Set<MetricType>(["distance_km", "hours"]);

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
  } else if (!DECIMAL_METRICS.has(input.metricType) && !Number.isInteger(input.target)) {
    errors.push("Target must be a whole number.");
  } else if (input.target > TARGET_MAX_BY_METRIC[input.metricType]) {
    errors.push("Target is above the allowed maximum.");
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
    errors.push("Choose valid reminder days.");
  }
  if (reminderTimes.some((time) => !REMINDER_TIME_PATTERN.test(time))) {
    errors.push("Use valid 24-hour reminder times.");
  }
  if (input.reminderStrategy === "manual" && reminderTimes.length === 0) {
    errors.push("Add at least one reminder time or turn reminders off.");
  }
  if (
    input.reminderStrategy !== "manual" &&
    input.reminderIntervalMinutes != null &&
    (!Number.isFinite(input.reminderIntervalMinutes) || input.reminderIntervalMinutes <= 0)
  ) {
    errors.push("Choose a positive smart reminder interval.");
  }
  if (
    input.reminderStrategy !== "manual" &&
    reminderTimes.length === 0 &&
    (input.reminderIntervalMinutes == null ||
      !Number.isFinite(input.reminderIntervalMinutes) ||
      input.reminderIntervalMinutes <= 0)
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
  if (!DECIMAL_METRICS.has(habit.metricType) && !Number.isInteger(value)) {
    return { ok: false, error: "Value must be a whole number." };
  }
  if (value > TARGET_MAX_BY_METRIC[habit.metricType]) {
    return { ok: false, error: "Value is above the allowed maximum." };
  }
  if (habit.target != null && value > habit.target && !CUMULATIVE_METRICS.has(habit.metricType)) {
    return { ok: false, error: "Value cannot exceed the habit target." };
  }
  return { ok: true, value };
}

export function metricAllowsDecimalValues(metricType: MetricType): boolean {
  return DECIMAL_METRICS.has(metricType);
}
