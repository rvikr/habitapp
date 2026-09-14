import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ACTIONS_ENABLED = Deno.env.get("WIDGET_BACKGROUND_ACTIONS_ENABLED") === "true";

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

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function localDateKey(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function leaderboardFor(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.display_name) return { status: "not_joined", rank: null };

  const { data, error } = await admin.rpc("get_leaderboard_position", {
    p_user_id: userId,
    p_period: "all",
  });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row || !Number.isFinite(Number(row.rank))) {
    return { status: "unavailable", rank: null };
  }
  // Widget contracts intentionally expose the all-time rank field only.
  return { status: "ranked", rank: Number(row.rank) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ACTIONS_ENABLED) {
    return json({ error: "Widget actions disabled", code: "actions_disabled" }, 503);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token.length < 32 || token.length > 128) {
    return json({ error: "Unauthorized", code: "session_required" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const tokenHash = await sha256(token);
  const { data: device, error: deviceError } = await admin
    .from("widget_devices")
    .select("id, user_id, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (
    deviceError ||
    !device ||
    device.revoked_at ||
    new Date(device.expires_at).getTime() <= Date.now()
  ) return json({ error: "Unauthorized", code: "session_required" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  await admin
    .from("widget_devices")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", device.id);

  const { data: profile } = await admin
    .from("profiles")
    .select("time_zone")
    .eq("user_id", device.user_id)
    .maybeSingle();
  let today: string;
  try {
    today = localDateKey(profile?.time_zone || "UTC");
  } catch {
    today = localDateKey("UTC");
  }

  if (body.action === "refresh_rank") {
    return json({ ok: true, leaderboard: await leaderboardFor(admin, device.user_id) });
  }

  if (body.action === "sync_steps") {
    const steps = typeof body.steps === "number" && Number.isFinite(body.steps)
      ? Math.floor(body.steps)
      : -1;
    if (steps < 0 || steps > 1_000_000) return json({ error: "Invalid steps" }, 400);
    const { data, error } = await admin.rpc("widget_sync_daily_steps", {
      p_user_id: device.user_id,
      p_completed_on: today,
      p_steps: steps,
    });
    if (error) return json({ error: "Could not sync steps" }, 409);
    return json({ ...data, leaderboard: await leaderboardFor(admin, device.user_id) });
  }

  if (body.action !== "check_in") return json({ error: "Invalid action" }, 400);
  const habitId = typeof body.habitId === "string" ? body.habitId : "";
  const operationId = typeof body.operationId === "string" ? body.operationId : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(habitId) || !uuid.test(operationId)) {
    return json({ error: "Invalid check-in" }, 400);
  }

  const { data, error } = await admin.rpc("widget_log_habit_completion_once", {
    p_user_id: device.user_id,
    p_operation_id: operationId,
    p_habit_id: habitId,
    p_completed_on: today,
  });
  if (error) {
    const code = error.code === "23514"
      ? "already_complete"
      : error.code === "P0002"
        ? "habit_unavailable"
        : "check_in_failed";
    const message = code === "already_complete"
      ? "Habit already complete"
      : code === "habit_unavailable"
        ? "Habit unavailable"
        : "Could not log check-in";
    return json({ error: message, code }, 409);
  }
  return json({ ...data, leaderboard: await leaderboardFor(admin, device.user_id) });
});
