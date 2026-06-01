import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { buildDataExport } from "./export-integrity";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Could not export your data.";
}

export async function exportMyData(): Promise<{ ok: boolean; data?: string; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase is not configured." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to sign in again." };

  const [profileResult, habitResult, completionResult, sleepResult, feedbackResult] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("habits")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("habit_completions")
        .select("*")
        .eq("user_id", user.id)
        .order("completed_on", { ascending: false }),
      supabase
        .from("sleep_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("sleep_date", { ascending: false }),
      supabase
        .from("feedback_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

  for (const result of [
    profileResult,
    habitResult,
    completionResult,
    sleepResult,
    feedbackResult,
  ]) {
    if (result.error) return { ok: false, error: errorMessage(result.error) };
  }

  return {
    ok: true,
    data: JSON.stringify(
      buildDataExport({
        user: { id: user.id, email: user.email ?? null },
        profile: profileResult.data ?? null,
        habits: habitResult.data ?? [],
        completions: completionResult.data ?? [],
        sleepEntries: sleepResult.data ?? [],
        feedback: feedbackResult.data ?? [],
      }),
      null,
      2,
    ),
  };
}
