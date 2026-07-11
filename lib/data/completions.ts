import type { MetricType } from "../../types/db.ts";
import { validateCompletionValue } from "./completion-rules.ts";

export function buildCompletionValuePayload(
  habitId: string,
  userId: string,
  completedOn: string,
  value: number,
  note?: string,
  habit?: { metricType: MetricType; target: number | null },
) {
  const normalized = habit
    ? validateCompletionValue(value, habit)
    : Number.isFinite(value) && value > 0
      ? ({ ok: true, value } as const)
      : ({ ok: false, error: "Value must be a positive number." } as const);
  if (!normalized.ok) throw new Error(normalized.error);
  return {
    habit_id: habitId,
    user_id: userId,
    completed_on: completedOn,
    value: normalized.value,
    note: note?.trim() || null,
  };
}
