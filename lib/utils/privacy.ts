import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { buildDataExport } from "./export-integrity";
import { collectExportPages } from "./paginated-select";

type ExportCollection = "habits" | "habit_completions" | "sleep_entries" | "feedback_reports";

function fetchAllOwnedRows(
  table: ExportCollection,
  userId: string,
  orderColumn: string,
  ascending: boolean,
  secondaryOrderColumn?: string,
) {
  return collectExportPages((from, to) => {
    let query = supabase
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .order(orderColumn, { ascending });
    if (secondaryOrderColumn) {
      query = query.order(secondaryOrderColumn, { ascending });
    }
    return query.order("id", { ascending: true }).range(from, to);
  });
}

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
      fetchAllOwnedRows("habits", user.id, "created_at", true),
      fetchAllOwnedRows("habit_completions", user.id, "completed_on", false, "created_at"),
      fetchAllOwnedRows("sleep_entries", user.id, "sleep_date", false),
      fetchAllOwnedRows("feedback_reports", user.id, "created_at", false),
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
