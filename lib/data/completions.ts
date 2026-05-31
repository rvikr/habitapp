import { validateCompletionValue } from "./completion-rules.ts";
import type { MetricType } from "../../types/db.ts";

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
