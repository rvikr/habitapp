import type { HabitRecommendation } from "./routine-builder";

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
};

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
