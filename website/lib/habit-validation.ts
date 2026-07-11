import type { MetricType } from "../types/db";

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

type ValueResult = { ok: true; value: number } | { ok: false; error: string };
type ValidValueResult = { ok: true; value: number };
type RuleResult = { ok: true } | { ok: false; error: string };

function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateWebHabitTarget(value: number, metricType: MetricType): ValueResult {
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: "Target must be a positive number." };
  }
  if (!DECIMAL_METRICS.has(metricType) && !Number.isInteger(value)) {
    return { ok: false, error: "Target must be a whole number." };
  }
  if (value > TARGET_MAX_BY_METRIC[metricType]) {
    return { ok: false, error: "Target is above the allowed maximum." };
  }
  return { ok: true, value };
}

export function defaultWebLogValue(target: number, metricType: MetricType): number {
  const rawValue = target / 4;
  const value = DECIMAL_METRICS.has(metricType)
    ? Number(rawValue.toPrecision(3))
    : Math.max(1, Math.floor(rawValue));
  return Math.min(target, value > 0 ? value : target);
}

export function validateWebLogValue(
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
  if (
    habit.target != null &&
    value > habit.target &&
    !CUMULATIVE_METRICS.has(habit.metricType)
  ) {
    return { ok: false, error: "Value cannot exceed the habit target." };
  }
  return { ok: true, value };
}

export function normalizeWebSuggestedLogValue(
  requestedValue: number,
  habit: { metricType: MetricType; target: number | null },
  remainingBefore: number,
): ValidValueResult | null {
  const requested = validateWebLogValue(requestedValue, habit);
  if (requested.ok) return requested;
  if (DECIMAL_METRICS.has(habit.metricType)) return null;

  const fallback = validateWebLogValue(Math.max(1, Math.floor(requestedValue)), habit);
  return fallback.ok && fallback.value <= Math.max(remainingBefore, 1) ? fallback : null;
}

export function validateWebCompletionPeriod(
  completedOn: string,
  options: {
    todayKey: string;
    operation: "log" | "undo";
    existingCompletion?: boolean;
    lookbackDays?: number;
  },
): RuleResult {
  if (!validDateKey(completedOn)) return { ok: false, error: "Use a valid completion date." };
  if (completedOn > options.todayKey) {
    return { ok: false, error: "Completion date cannot be in the future." };
  }
  if (options.operation === "undo" && options.existingCompletion) return { ok: true };

  const lookbackDays = options.lookbackDays ?? 7;
  if (completedOn < addDays(options.todayKey, -lookbackDays)) {
    return {
      ok: false,
      error: `You can only mark habits done for the last ${lookbackDays} days.`,
    };
  }
  return { ok: true };
}
