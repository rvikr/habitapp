"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin/audit";
import { requireAdmin } from "@/lib/admin/auth";

export async function toggleFeatureFlag(key: string, enabled: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (key === "activation_v2") {
    return { ok: false, error: "Use the Activation V2 rollout control" };
  }
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("feature_flags")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, `toggle_flag_${enabled ? "on" : "off"}`, "feature_flag", key, { enabled });
    revalidatePath("/admin/system");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function updateFeatureFlagRollout(
  key: "activation_v2",
  enabled: boolean,
  rolloutPercentage: number,
) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (key !== "activation_v2") return { ok: false, error: "Invalid activation flag" };
  if (typeof enabled !== "boolean") return { ok: false, error: "Invalid enabled state" };
  if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 0 || rolloutPercentage > 100) {
    return { ok: false, error: "Rollout percentage must be an integer from 0 to 100" };
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("feature_flags")
      .update({
        enabled,
        rollout_percentage: rolloutPercentage,
        updated_at: new Date().toISOString(),
      })
      .eq("key", key)
      .select("key")
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Activation feature flag not found" };

    await logAdminAction(auth.email, "update_activation_rollout", "feature_flag", key, {
      enabled,
      rolloutPercentage,
    });
    revalidatePath("/admin/system");
    revalidatePath("/admin");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function createFeatureFlag(key: string, name: string, description: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("feature_flags").insert({ key, name, description, enabled: false });
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "create_feature_flag", "feature_flag", key, { name });
    revalidatePath("/admin/system");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function sendGlobalNotification(title: string, body: string, type: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("global_notifications").insert({ title, body, type, active: true });
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "send_global_notification", "notification", undefined, { title, type });
    revalidatePath("/admin/system");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}

export async function dismissNotification(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("global_notifications").update({ active: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    await logAdminAction(auth.email, "dismiss_notification", "notification", id);
    revalidatePath("/admin/system");
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e) }; }
}
