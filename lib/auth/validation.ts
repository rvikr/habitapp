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
