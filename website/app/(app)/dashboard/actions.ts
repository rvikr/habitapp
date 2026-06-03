"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { revalidatePath } from "next/cache";
import { isValidDateKey } from "@/lib/date";

function suggestedIncrement(
  habit: { target: number | null; default_log_value: number | null } | null,
  currentValue: number,
) {
  const target = Number(habit?.target ?? 0);
  const defaultValue = Number(habit?.default_log_value ?? 0);
  if (!Number.isFinite(target) || target <= 0) return 1;
  if (!Number.isFinite(defaultValue) || defaultValue <= 0) return target;
  return Math.min(defaultValue, Math.max(target - currentValue, 0));
}

export async function toggleHabit(habitId: string, currentlyDone: boolean, completedOn: string) {
  if (!isValidDateKey(completedOn)) return;

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) return;

  if (currentlyDone) {
    await supabase
      .from("habit_completions")
      .delete()
      .eq("habit_id", habitId)
      .eq("user_id", user.id)
      .eq("completed_on", completedOn);
  } else {
    const [{ data: habit }, { data: completion }] = await Promise.all([
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
    const increment = suggestedIncrement(
      habit as { target: number | null; default_log_value: number | null } | null,
      Number(completion?.value ?? 0),
    );
    if (increment > 0) {
      await supabase.rpc("log_habit_completion", {
        p_habit_id: habitId,
        p_completed_on: completedOn,
        p_increment: increment,
        p_note: "Logged from web check-in",
      });
    }
  }

  revalidatePath("/dashboard");
}
