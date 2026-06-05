"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";
import { isValidDateKey } from "@/lib/date";

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
    default_log_value: null,
  });
  if (error) return mutationResult(error);

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleHabit(
  habitId: string,
  currentlyDone: boolean,
  completedOn: string,
): Promise<ActionResult> {
  if (!isValidDateKey(completedOn)) return { ok: false, error: "Invalid completion date." };

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
    const { data: habit, error: habitError } = await supabase
      .from("habits")
      .select("target")
      .eq("id", habitId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (habitError) return mutationResult(habitError);
    if (!habit) return { ok: false, error: "Habit not found." };

    const target = Number(habit?.target ?? 1);
    const { error } = await supabase.from("habit_completions").upsert(
      { habit_id: habitId, user_id: user.id, completed_on: completedOn, value: target > 0 ? target : 1 },
      { onConflict: "habit_id,completed_on" }
    );
    if (error) return mutationResult(error);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
