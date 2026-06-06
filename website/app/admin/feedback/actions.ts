"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";

const STATUSES = ["new", "reviewed", "planned", "resolved", "closed"] as const;
export type FeedbackStatus = (typeof STATUSES)[number];

export async function updateFeedbackStatus(id: string, status: FeedbackStatus) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!STATUSES.includes(status)) return { ok: false, error: "Invalid status" };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("feedback_reports").update({ status }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "update_feedback_status", "feedback", id, { status });
    revalidatePath("/admin/feedback");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
