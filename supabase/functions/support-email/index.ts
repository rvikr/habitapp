// Edge function: support-email
//
// Sends a notification email to the support team when a user submits in-app feedback.
// Called from the app via supabase.functions.invoke('support-email', { body }).
// Authenticated by the user's JWT (Authorization header). Uses Resend.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY        — same key used by welcome-email
//   SUPPORT_NOTIFY_EMAIL  — destination inbox (defaults to royalkastle@gmail.com)
//   SUPPORT_EMAIL_FROM    — FROM address (defaults to "Lagan <hello@lagan.health>")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPPORT_NOTIFY_EMAIL = Deno.env.get("SUPPORT_NOTIFY_EMAIL") ?? "royalkastle@gmail.com";
const FROM_ADDRESS = Deno.env.get("SUPPORT_EMAIL_FROM") ?? "Lagan <hello@lagan.health>";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!RESEND_API_KEY) return json({ error: "Email not configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: { message?: unknown; category?: unknown; rating?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const category = typeof body.category === "string" ? body.category : "other";
  const rating = typeof body.rating === "number" ? body.rating : null;

  if (!message) return json({ error: "message is required" }, 400);

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const subject = `[Lagan] ${categoryLabel} from ${user.email ?? "a user"}`;
  const ratingLine = rating != null ? `<p><strong>Rating:</strong> ${rating}/5 ⭐</p>` : "";
  const html = `
    <p><strong>From:</strong> ${user.email ?? user.id}</p>
    <p><strong>Category:</strong> ${categoryLabel}</p>
    ${ratingLine}
    <p><strong>Message:</strong></p>
    <blockquote style="border-left:3px solid #F26B1F;padding-left:12px;margin:8px 0;color:#374151;">
      ${message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
    </blockquote>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: SUPPORT_NOTIFY_EMAIL,
      reply_to: user.email ?? undefined,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error(`Resend send failed (${res.status}):`, detail);
    return json({ error: "Failed to send email" }, 502);
  }

  return json({ ok: true });
});
