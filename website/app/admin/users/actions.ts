"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";
import { SITE_URL } from "@/lib/site";

export async function grantPro(userId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ is_pro: true }).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "grant_pro", "user", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function revokePro(userId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("profiles").update({ is_pro: false }).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "revoke_pro", "user", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function resetPasswordForUser(email: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    // A session-less anon client so this never touches the admin's own session.
    // resetPasswordForEmail actually delivers the recovery email — unlike
    // admin.generateLink, which only mints a link and sends nothing.
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${SITE_URL}/auth/callback?next=/reset-password`,
    });
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "reset_password", "user", email);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function verifyUserEmail(userId: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "verify_email", "user", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function hardDeleteUser(userId: string, userEmail: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    // Delete all user data first (in case cascade isn't set up)
    await Promise.all([
      admin.from("habit_completions").delete().eq("user_id", userId),
      admin.from("habits").delete().eq("user_id", userId),
      admin.from("profiles").delete().eq("user_id", userId),
    ]);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "hard_delete_user", "user", userId, { email: userEmail });
    revalidatePath("/admin/users");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}
