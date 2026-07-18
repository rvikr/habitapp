// Edge function: support-email
//
// Sends a notification email to the support team when a user submits in-app feedback.
// Called from the app via supabase.functions.invoke('support-email', { body }).
// Authenticated by the user's JWT (Authorization header). Uses Resend.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY        — same key used by welcome-email
//   SUPPORT_NOTIFY_EMAIL  — destination inbox (defaults to support@lagan.health)
//   SUPPORT_EMAIL_FROM    — FROM address (defaults to "Lagan <hello@lagan.health>")

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SUPPORT_NOTIFY_EMAIL = Deno.env.get("SUPPORT_NOTIFY_EMAIL") ?? "support@lagan.health";
const FROM_ADDRESS = Deno.env.get("SUPPORT_EMAIL_FROM") ?? "Lagan <hello@lagan.health>";

// Mirrors FeedbackCategory in lib/utils/feedback.ts. Stored rows are still
// normalized before email rendering as defense in depth on top of escapeHtml.
const FEEDBACK_CATEGORIES = ["bug", "idea", "usability", "other"] as const;
const MAX_MESSAGE_LENGTH = 2000;
const MIN_MESSAGE_LENGTH = 10;
const MAX_FEEDBACK_EMAILS_PER_HOUR = 5;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

// Escape before interpolating any user-influenced value into the notification
// HTML so a crafted field (e.g. category) can't inject markup into the email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  let body: { feedbackReportId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const feedbackReportId =
    typeof body.feedbackReportId === "string" && UUID_PATTERN.test(body.feedbackReportId)
      ? body.feedbackReportId
      : null;
  if (!feedbackReportId) return json({ error: "feedbackReportId is required" }, 400);

  const { data: report, error: reportError } = await supabase
    .from("feedback_reports")
    .select("id, email, category, rating, message, created_at, support_email_sent_at")
    .eq("id", feedbackReportId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (reportError) {
    console.error("feedback report lookup failed", reportError);
    return json({ error: "Could not load feedback report" }, 500);
  }
  if (!report) return json({ error: "Feedback report not found" }, 404);

  const message = typeof report.message === "string" ? report.message.trim() : "";
  if (message.length < MIN_MESSAGE_LENGTH) return json({ error: "message is too short" }, 400);
  if (message.length > MAX_MESSAGE_LENGTH) return json({ error: "message is too long" }, 400);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentCount, error: rateError } = await supabase
    .from("feedback_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);
  if (rateError) {
    console.error("feedback rate limit lookup failed", rateError);
    return json({ error: "Could not check feedback rate limit" }, 500);
  }
  if ((recentCount ?? 0) > MAX_FEEDBACK_EMAILS_PER_HOUR) {
    return json({ error: "Too many feedback emails" }, 429);
  }

  if (report.support_email_sent_at) return json({ ok: true, duplicate: true });

  const { data: claimed, error: claimError } = await supabase
    .from("feedback_reports")
    .update({ support_email_sent_at: new Date().toISOString() })
    .eq("id", report.id)
    .is("support_email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("feedback email claim failed", claimError);
    return json({ error: "Could not claim feedback email" }, 500);
  }
  if (!claimed) return json({ ok: true, duplicate: true });

  const rawCategory = typeof report.category === "string" ? report.category.toLowerCase() : "";
  const category = (FEEDBACK_CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory
    : "other";
  const rating = typeof report.rating === "number" ? report.rating : null;
  const replyTo = typeof report.email === "string" && report.email.trim() ? report.email : undefined;

  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
  const subject = `[Lagan] ${categoryLabel} from ${replyTo ?? "a user"}`;
  const ratingLine = rating != null ? `<p><strong>Rating:</strong> ${rating}/5 ⭐</p>` : "";
  const html = `
    <p><strong>From:</strong> ${escapeHtml(replyTo ?? user.id)}</p>
    <p><strong>Category:</strong> ${escapeHtml(categoryLabel)}</p>
    ${ratingLine}
    <p><strong>Message:</strong></p>
    <blockquote style="border-left:3px solid #F26B1F;padding-left:12px;margin:8px 0;color:#374151;">
      ${escapeHtml(message).replace(/\n/g, "<br>")}
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
      reply_to: replyTo,
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
