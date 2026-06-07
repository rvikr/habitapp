// Edge function: welcome-email
//
// Sends a one-time branded "Welcome to Lagan" email to a newly confirmed user.
// Invoked server-to-server from a database trigger on auth.users (via pg_net),
// which fires once the user's email is confirmed. Authenticated by comparing the
// x-welcome-secret header to the WELCOME_EMAIL_SECRET env var (same pattern as
// progress-report's x-cron-secret). Idempotent: stamps profiles.welcome_email_sent_at
// and skips if already sent.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY        — Resend API key
//   WELCOME_EMAIL_SECRET  — shared secret matching the 'welcome_email_secret' Vault value
//   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const WELCOME_EMAIL_SECRET = Deno.env.get("WELCOME_EMAIL_SECRET") ?? "";
const APP_URL = Deno.env.get("EXPO_PUBLIC_APP_URL") ?? "https://lagan.health/app";
const FROM_ADDRESS = Deno.env.get("WELCOME_EMAIL_FROM") ?? "Lagan <hello@lagan.health>";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function welcomeHtml(appUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f7f9;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:40px 32px;">
            <tr>
              <td style="font-size:24px;font-weight:700;color:#111827;padding-bottom:16px;">Welcome to Lagan 🌱</td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:24px;color:#374151;padding-bottom:24px;">
                You just took the first step toward building habits that stick. Lagan helps you show up every day, track your streaks, and celebrate the small wins that add up.
              </td>
            </tr>
            <tr>
              <td style="padding-bottom:24px;">
                <a href="${appUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 28px;border-radius:10px;">Open Lagan</a>
              </td>
            </tr>
            <tr>
              <td style="font-size:14px;line-height:22px;color:#6b7280;">
                Need a hand getting started? Just reply to this email — we read every message.
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY || !WELCOME_EMAIL_SECRET) {
    return json({ error: "Welcome email is not configured" }, 503);
  }
  if (req.headers.get("x-welcome-secret") !== WELCOME_EMAIL_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { user_id?: unknown; email?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userId = typeof body.user_id === "string" ? body.user_id : null;
  const email = typeof body.email === "string" ? body.email : null;
  if (!userId || !email) {
    return json({ error: "user_id and email are required" }, 400);
  }

  // Idempotency: only send once per user.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("welcome_email_sent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) return json({ error: profileError.message }, 500);
  if (profile?.welcome_email_sent_at) return json({ ok: true, skipped: true });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: "Welcome to Lagan 🌱",
      html: welcomeHtml(APP_URL),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Resend send failed (${res.status}) for ${userId}:`, detail);
    return json({ error: "Failed to send email", status: res.status }, 502);
  }

  const { error: stampError } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (stampError) {
    // Email was sent; surface the stamp failure so we can investigate (a retry
    // would be deduped by the to-be-set flag, but log it regardless).
    console.error(`Failed to stamp welcome_email_sent_at for ${userId}:`, stampError.message);
  }

  return json({ ok: true });
});
