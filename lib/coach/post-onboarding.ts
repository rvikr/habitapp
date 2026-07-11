import type { HabitRecommendation } from "./routine-builder";
import { inferHabitIntelligence } from "./habit-intelligence.ts";
import type { Habit } from "../../types/db";

/**
 * A habit that was successfully created during onboarding, carrying just the
 * fields the post-create confirmation/tutorial screens need to display and to
 * mark it complete. Derived from a selected recommendation plus the id returned
 * by the create call.
 */
export type CreatedHabit = {
  id: string;
  name: string;
  icon: string;
  color: HabitRecommendation["color"];
  unit: string;
  target: number | null;
  habitType: HabitRecommendation["habitType"];
  metricType: HabitRecommendation["metricType"];
  defaultLogValue: number | null;
};

export type TutorialHabitAction = { kind: "log_progress"; value: number } | { kind: "complete" };

export type ManualCreatedHabitFallback = {
  id: string;
  name: string;
  icon: string;
  color: CreatedHabit["color"];
  unit: string;
  target: number | null;
  habitType?: Habit["habit_type"];
  metricType?: Habit["metric_type"];
  visualType?: Habit["visual_type"];
  reminderStrategy?: Habit["reminder_strategy"];
  reminderIntervalMinutes?: number | null;
  defaultLogValue?: number | null;
};

type SavedManualHabit = Pick<
  Habit,
  | "id"
  | "name"
  | "icon"
  | "color"
  | "unit"
  | "target"
  | "habit_type"
  | "metric_type"
  | "visual_type"
  | "reminder_strategy"
  | "reminder_interval_minutes"
  | "default_log_value"
>;

function capFirstLogAtTarget(value: number | null, target: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (target != null && Number.isFinite(target) && target > 0) return Math.min(value, target);
  return value;
}

/**
 * Convert the row returned after a manual create/merge into the shared first-log
 * shape. The saved row wins because a merge can change both the id and habit
 * settings. Legacy rows can be missing smart metadata, so those fields are
 * inferred. A submitted fallback keeps the first-log flow usable if the
 * authoritative read is unavailable.
 */
export function resolveManualCreatedHabit(
  saved: SavedManualHabit | null,
  fallback: ManualCreatedHabitFallback,
): CreatedHabit {
  const name = saved?.name ?? fallback.name;
  const icon = saved?.icon ?? fallback.icon;
  const inputTarget = saved ? saved.target : fallback.target;
  const intelligence = inferHabitIntelligence({
    name,
    icon,
    unit: saved ? saved.unit : fallback.unit,
    target: inputTarget,
    habitType: saved ? saved.habit_type : fallback.habitType,
    metricType: saved ? saved.metric_type : fallback.metricType,
    visualType: saved ? saved.visual_type : fallback.visualType,
    reminderStrategy: saved ? saved.reminder_strategy : fallback.reminderStrategy,
    reminderIntervalMinutes: saved
      ? saved.reminder_interval_minutes
      : fallback.reminderIntervalMinutes,
    defaultLogValue: saved ? saved.default_log_value : fallback.defaultLogValue,
  });
  const defaultLogValue = saved
    ? (saved.default_log_value ?? intelligence.defaultLogValue)
    : (fallback.defaultLogValue ?? intelligence.defaultLogValue);
  const target = saved && saved.target == null ? null : intelligence.target;

  return {
    id: saved?.id ?? fallback.id,
    name,
    icon,
    color: saved?.color ?? fallback.color,
    unit: intelligence.unit,
    target,
    habitType: intelligence.habitType,
    metricType: intelligence.metricType,
    defaultLogValue: capFirstLogAtTarget(defaultLogValue, target),
  };
}

/** Minimal shape of a single createRoutineHabits result we care about. */
type CreateResultLike = { ok: boolean; id: string | null };

/**
 * Zip the selected recommendations with the positionally-aligned create
 * results, keeping only the habits that were actually created (ok && id).
 * Merged habits return ok:true with the existing habit's id, so they're kept
 * and remain tappable; failures (and any results without an id) are dropped.
 */
export function buildCreatedHabits(
  selected: readonly HabitRecommendation[],
  results: readonly CreateResultLike[],
): CreatedHabit[] {
  const created: CreatedHabit[] = [];
  for (let i = 0; i < selected.length; i++) {
    const result = results[i];
    if (!result || !result.ok || !result.id) continue;
    const rec = selected[i];
    created.push({
      id: result.id,
      name: rec.name,
      icon: rec.icon,
      color: rec.color,
      unit: rec.unit,
      target: rec.target,
      habitType: rec.habitType,
      metricType: rec.metricType,
      defaultLogValue: rec.defaultLogValue,
    });
  }
  return created;
}

/**
 * Pick the habit to guide the user through completing first. Prefer the water
 * habit ("Drink Water") for a friendly, low-effort first win; otherwise fall
 * back to the first created habit. Returns null only when nothing was created.
 */
export function pickTutorialHabit(created: readonly CreatedHabit[]): CreatedHabit | null {
  return created.find((h) => h.habitType === "water_intake") ?? created[0] ?? null;
}

export function getTutorialHabitAction(habit: CreatedHabit): TutorialHabitAction {
  const target = habit.target != null ? Number(habit.target) : null;
  if (habit.metricType === "boolean" || target == null || target <= 0) {
    return { kind: "complete" };
  }

  const defaultValue = Number(habit.defaultLogValue ?? 0);
  const fallbackValue = target / 4;
  const value = defaultValue > 0 ? defaultValue : fallbackValue;
  return { kind: "log_progress", value: Math.min(value, target) };
}
