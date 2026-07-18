// Supabase Edge Function — permanently deletes the calling user's account
// and all of their data (habits, completions, profile), while preserving a
// completed account-deletion audit row.
//
// Deploy:    npx supabase functions deploy delete-account
// Invoke:    supabase.functions.invoke('delete-account')
//
// The function authenticates via the caller's JWT, verifies the user, then
// uses the service-role key to perform the cross-table delete. Service-role
// access is required to call auth.admin.deleteUser.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REAUTH_MAX_AGE_MS = Number(Deno.env.get("DELETE_ACCOUNT_REAUTH_MAX_AGE_SECONDS") ?? "600") * 1000;
// Goodbye email is sent through Resend (same provider/sender as welcome-email).
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const GOODBYE_EMAIL_FROM = Deno.env.get("WELCOME_EMAIL_FROM") ?? "Lagan <hello@lagan.health>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function hasRecentSignIn(user: { last_sign_in_at?: string | null }): boolean {
  if (!Number.isFinite(REAUTH_MAX_AGE_MS) || REAUTH_MAX_AGE_MS <= 0) return false;
  const signedInAt = Date.parse(user.last_sign_in_at ?? "");
  if (!Number.isFinite(signedInAt)) return false;
  return Date.now() - signedInAt <= REAUTH_MAX_AGE_MS;
}

function goodbyeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:40px 32px;">
            <tr>
              <td style="font-size:24px;font-weight:700;color:#111827;padding-bottom:16px;">Your account has been deleted</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:24px;color:#374151;padding-bottom:24px;">
                We've permanently deleted your Lagan account and its data as requested. Thank you for the time you spent building habits with us — you're always welcome back.
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:22px;color:#6b7280;">
                If you didn't request this, reply to this email right away and we'll help.
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;padding:16px 32px;">
            <tr>
              <td style="font-size:12px;color:#9ca3af;text-align:center;">Lagan · Build better habits, one day at a time.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Best-effort goodbye email — never blocks or fails the deletion.
async function sendGoodbyeEmail(email: string | null): Promise<void> {
  if (!RESEND_API_KEY || !email) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: GOODBYE_EMAIL_FROM,
        to: email,
        subject: "Your Lagan account has been deleted",
        html: goodbyeHtml(),
      }),
    });
    if (!res.ok) console.error(`Goodbye email failed (${res.status}):`, await res.text());
  } catch (e) {
    console.error("Goodbye email failed (non-fatal):", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  // Verify the caller using their JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);
  if (!hasRecentSignIn(user)) {
    return json({ error: "Recent sign-in required before deleting your account." }, 403);
  }

  const userId = user.id;

  // Optional reason from the request body (non-fatal if missing).
  let reason: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.reason === "string" && body.reason.trim().length > 0) {
      reason = body.reason.trim();
    }
  } catch {
    // No body or invalid JSON — ignore.
  }

  // Service-role client for the actual deletion.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Audit row first so we have a trail even if a later step fails.
  const { data: auditRow, error: auditError } = await admin
    .from("account_deletion_requests")
    .insert({ user_id: userId, email: user.email ?? null, reason, status: "processing" })
    .select("id")
    .single();
  if (auditError) return json({ error: `Failed to create deletion request: ${auditError.message}` }, 500);

  const auditId = auditRow.id;

  // Best-effort cascade. The auth.users delete cascades via FK to habits,
  // habit_completions, profiles, account_deletion_requests, etc., but we
  // delete app rows explicitly so partial failures are visible.
  const cascades: Array<[string, any]> = [
    ["sleep_entries",     admin.from("sleep_entries").delete().eq("user_id", userId)],
    ["habit_completions", admin.from("habit_completions").delete().eq("user_id", userId)],
    ["habits",            admin.from("habits").delete().eq("user_id", userId)],
    ["profiles",          admin.from("profiles").delete().eq("user_id", userId)],
  ];
  for (const [table, builder] of cascades) {
    const { error } = await builder;
    if (error) {
      await admin
        .from("account_deletion_requests")
        .update({ status: "requested" })
        .eq("id", auditId);
      return json({ error: `Failed to delete ${table}: ${error.message}` }, 500);
    }
  }

  // Delete the auth user last. After this point the JWT is invalid.
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    await admin
      .from("account_deletion_requests")
      .update({ status: "requested" })
      .eq("id", auditId);
    return json({ error: `Failed to delete auth user: ${authError.message}` }, 500);
  }

  // Account is gone at this point — send the goodbye email (best-effort).
  await sendGoodbyeEmail(user.email ?? null);

  const { error: completeError } = await admin
    .from("account_deletion_requests")
    .update({ status: "completed", processed_at: new Date().toISOString() })
    .eq("id", auditId);
  if (completeError) {
    return json({ error: `Account deleted, but failed to update deletion audit: ${completeError.message}` }, 500);
  }

  return json({ ok: true });
});
