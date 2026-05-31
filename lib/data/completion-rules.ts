import { validateLogValueForHabit } from "../habits/input-rules.ts";
import { addDateKeyDays, isValidDateKey, localDateKey } from "../utils/date.ts";
import type { MetricType } from "../../types/db.ts";

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

  const lookbackDays = options.lookbackDays ?? COMPLETION_LOOKBACK_DAYS;
  const earliest = addDateKeyDays(today, -lookbackDays);
  if (completedOn < earliest) {
    return {
      ok: false,
      error: `You can only mark habits done for the last ${lookbackDays} days.`,
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
