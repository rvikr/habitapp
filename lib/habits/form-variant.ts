export type HabitFormVariant = "standard" | "treatment";

export type HabitFormIssue = "basic" | "target" | "reminders" | "validation";

export function clampDefaultLogValueToTarget(
  defaultLogValue: number | null,
  target: number | null,
): number | null {
  if (defaultLogValue == null || !Number.isFinite(defaultLogValue)) return null;
  if (target != null && Number.isFinite(target) && target > 0) {
    return Math.min(defaultLogValue, target);
  }
  return defaultLogValue;
}

export function shouldExpandHabitFormAdvanced(
  variant: HabitFormVariant,
  issue: HabitFormIssue,
): boolean {
  return variant === "treatment" && issue !== "basic";
}
