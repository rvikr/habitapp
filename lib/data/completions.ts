export function buildCompletionValuePayload(
  habitId: string,
  userId: string,
  completedOn: string,
  value: number,
  note?: string,
) {
  const normalizedValue = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return {
    habit_id: habitId,
    user_id: userId,
    completed_on: completedOn,
    value: normalizedValue,
    note: note?.trim() || null,
  };
}
