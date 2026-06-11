// Edge function: complete-habit-from-push
//
// Redeems the signed action token carried by a Web Push notification's
// "Mark done" button. The service worker that posts here has no Supabase
// session, so the HMAC token minted by web-push-reminders is the sole
// authentication — it is scoped to one (user, habit, local date) and
// short-lived. The write is an idempotent per-day upsert with the same
// semantics as the in-app toggleHabit "mark done" (value = max(target, 1)),
// and the composite (habit_id, user_id) -> habits owner FK backstops any
// user/habit mismatch at the database level.
//
// Deploy:  npx supabase functions deploy complete-habit-from-push --no-verify-jwt
// Secrets: PUSH_ACTION_SECRET (shared with web-push-reminders)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyActionToken } from "../_shared/push-action-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUSH_ACTION_SECRET = Deno.env.get("PUSH_ACTION_SECRET") ?? "";

// The service worker fetch is cross-origin (app origin -> *.supabase.co).
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!PUSH_ACTION_SECRET) return json({ error: "Not configured" }, 500);

  let token = "";
  try {
    const body = await req.json();
    if (typeof body?.token === "string") token = body.token;
  } catch {
    // Missing/invalid JSON falls through to the generic auth failure below.
  }

  // Keep auth failures generic — this endpoint is reachable without a JWT.
  const payload = token ? await verifyActionToken(token, PUSH_ACTION_SECRET) : null;
  if (!payload) return json({ error: "Unauthorized" }, 401);

  const { data: habit, error: habitError } = await supabase
    .from("habits")
    .select("id, name, target, archived_at")
    .eq("id", payload.h)
    .eq("user_id", payload.u)
    .maybeSingle();
  if (habitError) return json({ error: "Lookup failed" }, 500);
  if (!habit || habit.archived_at) return json({ error: "Not found" }, 404);

  const target = Number(habit.target ?? 1);
  const value = target > 0 ? target : 1;

  const { error: writeError } = await supabase.from("habit_completions").upsert(
    { habit_id: payload.h, user_id: payload.u, completed_on: payload.d, value },
    { onConflict: "habit_id,completed_on" },
  );
  if (writeError) return json({ error: "Write failed" }, 500);

  // habitName lets the service worker show "✓ Logged: <name>".
  return json({ ok: true, habitName: habit.name });
});
