"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";
import { isValidDateKey } from "@/lib/date";
import {
  defaultLogValueForTarget,
  legacyFillIncrement,
  suggestedIncrement,
} from "@/lib/habit-progress";

type ActionResult = { ok: true } | { ok: false; error?: string };
type TargetResult = { ok: true; value: number | null } | { ok: false; error: string };
type HabitColor = "primary" | "secondary" | "tertiary" | "neutral";

const HABIT_COLORS: HabitColor[] = ["primary", "secondary", "tertiary", "neutral"];
const HABIT_ICONS = new Set([
  "water_drop",
  "directions_walk",
  "directions_run",
  "menu_book",
  "self_improvement",
  "edit_note",
  "fitness_center",
  "bedtime",
  "restaurant",
  "code",
  "spa",
]);

function mutationResult(error: { message?: string } | null | undefined): ActionResult {
  return error ? { ok: false, error: error.message ?? "Something went wrong." } : { ok: true };
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function textValue(formData: FormData, name: string, maxLength: number): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function colorValue(formData: FormData): HabitColor {
  const value = textValue(formData, "color", 24) as HabitColor;
  return HABIT_COLORS.includes(value) ? value : "primary";
}

function iconValue(formData: FormData): string {
  const value = textValue(formData, "icon", 48);
  return HABIT_ICONS.has(value) ? value : "spa";
}

function targetValue(formData: FormData): TargetResult {
  const value = textValue(formData, "target", 24);
  if (!value) return { ok: true, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: "Target must be a positive number." };
  }
  return { ok: true, value: parsed };
}

export async function createHabit(formData: FormData): Promise<ActionResult> {
  const name = textValue(formData, "name", 80);
  if (!name) return { ok: false, error: "Habit name is required." };

  const target = targetValue(formData);
  if (!target.ok) return target;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: "You need to sign in again." };

  const { error } = await supabase.from("habits").insert({
    user_id: user.id,
    name,
    description: textValue(formData, "description", 180) || null,
    icon: iconValue(formData),
    color: colorValue(formData),
    target: target.value,
    unit: textValue(formData, "unit", 24) || null,
    reminders_enabled: false,
    reminder_times: [],
    reminder_days: [0, 1, 2, 3, 4, 5, 6],
    habit_type: "custom",
    metric_type: target.value ? "minutes" : "boolean",
    visual_type: "progress_ring",
    reminder_strategy: "manual",
    reminder_interval_minutes: null,
    default_log_value: defaultLogValueForTarget(target.value),
  });
  if (error) return mutationResult(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleHabit(
  habitId: string,
  currentlyDone: boolean,
  completedOn: string,
  operationId: string,
): Promise<ActionResult> {
  if (!isValidDateKey(completedOn)) return { ok: false, error: "Invalid completion date." };
  if (!isValidUuid(operationId)) return { ok: false, error: "Invalid check-in operation." };

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return { ok: false, error: "You need to sign in again." };

  if (currentlyDone) {
    const { error } = await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", completedOn);
    if (error) return mutationResult(error);
  } else {
    const [{ data: habit, error: habitError }, { data: completion, error: completionError }] =
      await Promise.all([
        supabase
          .from("habits")
          .select("target, default_log_value")
          .eq("id", habitId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("habit_completions")
          .select("value")
          .eq("habit_id", habitId)
          .eq("user_id", user.id)
          .eq("completed_on", completedOn)
          .maybeSingle(),
      ]);
    if (habitError) return mutationResult(habitError);
    if (completionError) return mutationResult(completionError);
    if (!habit) return { ok: false, error: "Habit not found." };

    const currentValue = Number(completion?.value ?? 0);
    const increment =
      suggestedIncrement(habit, currentValue) ?? legacyFillIncrement(habit, currentValue);
    if (increment != null) {
      const { error } = await supabase.rpc("log_habit_completion_once", {
        p_operation_id: operationId,
        p_habit_id: habitId,
        p_completed_on: completedOn,
        p_increment: increment,
        p_note: "Logged from web check-in",
      });
      if (error) return mutationResult(error);
    }
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
