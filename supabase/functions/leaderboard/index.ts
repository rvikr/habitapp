// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Period = "week" | "month" | "all";

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_style: string | null;
  avatar_seed: string | null;
  total_completions: number;
  total_xp: number;
  level: number;
  total_habits: number;
  last_completion_date: string | null;
  xp: number;
  streak: number;
  is_current_user: boolean;
};

type LeaderboardPosition = {
  rank: number;
  totalUsers: number;
  totalXp: number;
  percentileAhead: number | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function parsePeriod(value: unknown): Period | null {
  if (value === undefined || value === null) return "all";
  return value === "week" || value === "month" || value === "all" ? value : null;
}

function clampLimit(value: unknown): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 50;
  return Math.max(1, Math.min(numeric, 100));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function normalizePosition(row: any): LeaderboardPosition | null {
  if (!row) return null;
  return {
    rank: Number(row.rank),
    totalUsers: Number(row.total_users),
    totalXp: Number(row.total_xp),
    percentileAhead:
      row.percentile_ahead === null || row.percentile_ahead === undefined
        ? null
        : Number(row.percentile_ahead),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);
  if (!SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Server is not configured" }, 500);

  let body: Record<string, unknown> = {};
  try {
    body = asRecord(await req.json());
  } catch {
    body = {};
  }

  const period = parsePeriod(body.period);
  if (!period) return json({ error: "Invalid leaderboard period" }, 400);

  const includeEntries = body.includeEntries !== false;
  const includePosition = body.includePosition === true;
  const limit = clampLimit(body.limit);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const response: {
    entries?: LeaderboardEntry[];
    position?: LeaderboardPosition | null;
  } = {};

  if (includeEntries) {
    const { data, error } = await admin.rpc("get_leaderboard_entries", {
      p_period: period,
      p_limit: limit,
      p_current_user_id: user.id,
    });
    if (error) return json({ error: error.message }, 500);
    response.entries = (data ?? []) as LeaderboardEntry[];
  }

  if (includePosition) {
    const { data, error } = await admin.rpc("get_leaderboard_position", {
      p_user_id: user.id,
      p_period: period,
    });
    if (error) return json({ error: error.message }, 500);
    response.position = normalizePosition(Array.isArray(data) ? data[0] : null);
  }

  return json(response);
});
