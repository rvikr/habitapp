import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";

export async function exportMyData(): Promise<{ ok: boolean; data?: string; error?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase is not configured." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to sign in again." };

  const [
    { data: profile },
    { data: habits },
    { data: completions },
    { data: sleepEntries },
    { data: feedback },
  ] = await Promise.all([
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

  return {
    ok: true,
    data: JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        user: { id: user.id, email: user.email ?? null },
        profile: profile ?? null,
        habits: habits ?? [],
        completions: completions ?? [],
        sleep_entries: sleepEntries ?? [],
        feedback: feedback ?? [],
      },
      null,
      2,
    ),
  };
}
