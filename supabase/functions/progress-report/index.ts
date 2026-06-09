// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiQuota, recordAiUsageEvent } from "../_shared/ai-guard.ts";
import { enforceProAccess } from "../_shared/pro-access.ts";
import { generateContent } from "../_shared/gemini.ts";
import {
  buildFacts,
  buildWeeklyStats,
  fallbackSummary,
  formatDate,
  type CompletionStatsRow,
  type HabitStatsRow,
  type WeeklyStats,
} from "./stats.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_REPORT_MODEL =
  Deno.env.get("GEMINI_REPORT_MODEL") ?? Deno.env.get("GEMINI_COACH_MODEL") ?? "gemini-2.5-flash";
const CRON_SECRET = Deno.env.get("PROGRESS_REPORT_CRON_SECRET");
const MAX_BATCH_USERS = Number(Deno.env.get("PROGRESS_REPORT_BATCH_SIZE") ?? 200);
const BATCH_CONCURRENCY = Math.max(1, Number(Deno.env.get("PROGRESS_REPORT_CONCURRENCY") ?? 2));
// Minimum spacing between Gemini calls across the whole worker pool. Staggers the
// workers' otherwise-simultaneous start and paces the batch under the shared
// project rate limit instead of bursting BATCH_CONCURRENCY calls at once.
const PROGRESS_REPORT_MIN_INTERVAL_MS = Math.max(
  0,
  Number(Deno.env.get("PROGRESS_REPORT_MIN_INTERVAL_MS") ?? 1200),
);
// Stop scheduling new users past this elapsed wall-clock so the function exits
// cleanly before the platform limit; remaining users are picked up on the next
// (idempotent) cron run.
const BATCH_DEADLINE_MS = Math.max(1000, Number(Deno.env.get("PROGRESS_REPORT_DEADLINE_MS") ?? 120000));

// Returns an async gate shared across the worker pool: it resolves immediately
// the first time, then spaces subsequent calls at least `intervalMs` apart no
// matter how many workers call it. The waits count against BATCH_DEADLINE_MS, so
// pacing naturally yields to the wall-clock budget and the next cron resumes.
function createMinIntervalGate(intervalMs: number): () => Promise<void> {
  let nextAllowedAt = 0;
  return async function gate(): Promise<void> {
    if (intervalMs <= 0) return;
    const now = Date.now();
    const wait = Math.max(0, nextAllowedAt - now);
    nextAllowedAt = Math.max(now, nextAllowedAt) + intervalMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

type ProUserRow = { user_id: string };
type ProgressReportRequest = { mode?: string };
type GenerateForUserResult = { status: "written" | "skipped" | "failed"; reason?: string };
type WeeklyProgressReportRow = {
  id: string;
  user_id: string;
  week_start: string;
  summary_text: string;
  stats_snapshot: Record<string, unknown>;
  model: string | null;
  generated_at: string;
};

const REPORT_SELECT = "id, user_id, week_start, summary_text, stats_snapshot, model, generated_at";

function isoWeekStart(reference: Date): Date {
  const utc = new Date(Date.UTC(
    reference.getUTCFullYear(),
    reference.getUTCMonth(),
    reference.getUTCDate(),
  ));
  const day = utc.getUTCDay();
  const offsetToMonday = (day + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - offsetToMonday);
  return utc;
}

function previousWeekStart(reference = new Date()): Date {
  const weekStart = isoWeekStart(reference);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  return weekStart;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseRequestBody(req: Request): Promise<ProgressReportRequest> {
  try {
    const body = await req.json();
    return isRecord(body) && typeof body.mode === "string" ? { mode: body.mode } : {};
  } catch {
    return {};
  }
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength).trimEnd() : trimmed;
}

function outputText(body: any): string | null {
  const parts = body?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    const text = cleanText(part?.text, 800);
    if (text) return text;
  }
  return null;
}

// Fetches the raw rows and delegates all math to the pure buildWeeklyStats in
// ./stats.ts (which is exercised directly by the Node unit tests).
async function computeWeeklyStats(
  admin: ReturnType<typeof createClient>,
  userId: string,
  weekStartDate: Date,
): Promise<WeeklyStats | null> {
  const weekStart = formatDate(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = formatDate(weekEndDate);

  const prevWeekStartDate = new Date(weekStartDate);
  prevWeekStartDate.setUTCDate(prevWeekStartDate.getUTCDate() - 7);
  const prevWeekStart = formatDate(prevWeekStartDate);
  const prevWeekEnd = formatDate(new Date(weekStartDate.getTime() - 86_400_000));

  const [habitsRes, completionsRes, prevCompletionsRes] = await Promise.all([
    admin
      .from("habits")
      .select("id, name, unit, target, metric_type, reminder_days, reminders_enabled, created_at")
      .eq("user_id", userId)
      .is("archived_at", null),
    admin
      .from("habit_completions")
      .select("habit_id, completed_on, value")
      .eq("user_id", userId)
      .gte("completed_on", weekStart)
      .lte("completed_on", weekEnd),
    admin
      .from("habit_completions")
      .select("habit_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("completed_on", prevWeekStart)
      .lte("completed_on", prevWeekEnd),
  ]);

  if (habitsRes.error) {
    console.error("progress-report habits query failed", { userId, error: habitsRes.error.message });
    return null;
  }
  if (completionsRes.error) {
    console.error("progress-report completions query failed", { userId, error: completionsRes.error.message });
    return null;
  }

  return buildWeeklyStats({
    habits: (habitsRes.data ?? []) as unknown as HabitStatsRow[],
    completions: (completionsRes.data ?? []) as unknown as CompletionStatsRow[],
    lastWeekCompletions: prevCompletionsRes.error ? 0 : (prevCompletionsRes.count ?? 0),
    weekStartDate,
    today: new Date(),
  });
}

async function generateSummary(stats: WeeklyStats): Promise<{ text: string; generated: boolean }> {
  if (!GEMINI_API_KEY) return { text: fallbackSummary(stats), generated: false };

  const response = await generateContent(GEMINI_REPORT_MODEL, GEMINI_API_KEY, {
    systemInstruction: {
      parts: [
        {
          text:
            "You write a short weekly habit progress summary, 3-4 sentences, under 480 characters. " +
            "Use ONLY the numbers and units given in the facts below, exactly as written. " +
            "Never convert units, never do arithmetic, never invent or estimate any figure. " +
            "Be supportive and concrete: name the strongest habit and the one habit to focus on next week. " +
            "Do not mention AI or use medical language.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: `Facts:\n${buildFacts(stats)}` }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 240,
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Gemini progress-report failed", { status: response.status, error });
    return { text: fallbackSummary(stats), generated: false };
  }

  const body = await response.json();
  const text = outputText(body);
  return text ? { text, generated: true } : { text: fallbackSummary(stats), generated: false };
}

async function generateForUser(
  admin: ReturnType<typeof createClient>,
  userId: string,
  weekStartDate: Date,
): Promise<GenerateForUserResult> {
  const weekStart = formatDate(weekStartDate);

  const existing = await admin
    .from("weekly_progress_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (existing.error) {
    console.error("progress-report existence check failed", { userId, error: existing.error.message });
    return { status: "failed", reason: "existence_check_failed" };
  }
  if (existing.data) return { status: "skipped", reason: "already_exists" };

  const quota = await enforceAiQuota(admin as any, userId, "progress-report");
  if (!quota.allowed) {
    await recordAiUsageEvent(admin as any, userId, "progress-report", "fallback", quota.reason);
    return { status: "skipped", reason: quota.reason };
  }

  const stats = await computeWeeklyStats(admin, userId, weekStartDate);
  if (!stats) return { status: "failed", reason: "stats_query_failed" };
  if (stats.activeHabits === 0) {
    await recordAiUsageEvent(admin as any, userId, "progress-report", "fallback", "no_active_habits");
    return { status: "skipped", reason: "no_active_habits" };
  }

  const { text, generated } = await generateSummary(stats);

  const insert = await admin
    .from("weekly_progress_reports")
    .insert({
      user_id: userId,
      week_start: weekStart,
      summary_text: text,
      stats_snapshot: stats,
      model: generated ? GEMINI_REPORT_MODEL : null,
    });
  if (insert.error) {
    console.error("progress-report insert failed", { userId, error: insert.error.message });
    await recordAiUsageEvent(admin as any, userId, "progress-report", "failed", "insert_failed");
    return { status: "failed", reason: "insert_failed" };
  }

  await recordAiUsageEvent(
    admin as any,
    userId,
    "progress-report",
    generated ? "succeeded" : "fallback",
    generated ? undefined : "gemini_unavailable",
  );
  return { status: "written" };
}

async function getProgressReport(
  admin: ReturnType<typeof createClient>,
  userId: string,
  weekStartDate: Date,
): Promise<WeeklyProgressReportRow | null> {
  const { data, error } = await admin
    .from("weekly_progress_reports")
    .select(REPORT_SELECT)
    .eq("user_id", userId)
    .eq("week_start", formatDate(weekStartDate))
    .maybeSingle();
  if (error) {
    console.error("progress-report readback failed", { userId, error: error.message });
    return null;
  }
  return (data as WeeklyProgressReportRow | null) ?? null;
}

async function runCronBatch(admin: ReturnType<typeof createClient>) {
  const now = new Date();
  const previousWeek = previousWeekStart(now);

  // Mirror has_pro_access(): admin override, active RevenueCat entitlement (with non-expired
  // pro_expires_at when set), or unexpired trial.
  const profilesRes = await admin
    .from("profiles")
    .select("user_id, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at")
    .or(
      `is_pro.eq.true,revenuecat_entitlement_active.eq.true,pro_trial_ends_at.gte.${now.toISOString()}`,
    )
    .limit(MAX_BATCH_USERS);
  if (profilesRes.error) {
    console.error("progress-report user listing failed", { error: profilesRes.error.message });
    return { processed: 0, written: 0, skipped: 0, failed: 0, remaining: 0, deadlineReached: false };
  }
  const users: ProUserRow[] = ((profilesRes.data ?? []) as any[])
    .filter((row) => {
      if (row.is_pro === true) return true;
      if (row.pro_trial_ends_at && new Date(row.pro_trial_ends_at) > now) return true;
      if (row.revenuecat_entitlement_active === true) {
        return !row.pro_expires_at || new Date(row.pro_expires_at) > now;
      }
      return false;
    })
    .map((row) => ({ user_id: row.user_id }));

  let written = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;
  const startedAt = Date.now();

  // Bounded-concurrency worker pool: workers pull from a shared cursor until the
  // queue drains or the wall-clock deadline is reached. generateForUser is
  // idempotent (skips users whose report already exists), so a partial run is
  // safely completed by the next cron invocation.
  let cursor = 0;
  let deadlineReached = false;
  const gate = createMinIntervalGate(PROGRESS_REPORT_MIN_INTERVAL_MS);

  async function worker(): Promise<void> {
    while (true) {
      if (Date.now() - startedAt >= BATCH_DEADLINE_MS) {
        deadlineReached = true;
        return;
      }
      const index = cursor++;
      if (index >= users.length) return;
      await gate();
      const result = await generateForUser(admin, users[index].user_id, previousWeek);
      processed += 1;
      if (result.status === "written") written += 1;
      else if (result.status === "skipped") skipped += 1;
      else failed += 1;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, users.length) }, () => worker()),
  );

  const remaining = Math.max(0, users.length - processed);
  return { processed, written, skipped, failed, remaining, deadlineReached };
}

function statusForGenerateResult(result: GenerateForUserResult): number {
  if (result.status === "failed") return 500;
  if (result.reason === "quota_exceeded") return 429;
  if (result.reason === "quota_guard_failed") return 503;
  return 200;
}

async function runGenerateNow(req: Request, admin: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing authorization header" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const proAccess = await enforceProAccess(admin as any, user.id, "progress-report");
  if (!proAccess.allowed) {
    console.warn("AI progress-report generate-now blocked", { userId: user.id, reason: proAccess.reason });
    return json(
      { mode: "generate-now", status: "skipped", reason: proAccess.reason, report: null },
      proAccess.status,
    );
  }

  const weekStartDate = previousWeekStart();
  const result = await generateForUser(admin, user.id, weekStartDate);
  const report = await getProgressReport(admin, user.id, weekStartDate);
  return json(
    {
      mode: "generate-now",
      weekStart: formatDate(weekStartDate),
      ...result,
      report,
    },
    statusForGenerateResult(result),
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("progress-report: service role key missing");
    return json({ error: "Service role not configured" }, 503);
  }

  const body = await parseRequestBody(req);
  if (body.mode === "generate-now") {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    return runGenerateNow(req, admin);
  }

  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret) return json({ error: "Cron secret required" }, 401);
  if (!CRON_SECRET || !timingSafeEqual(cronSecret, CRON_SECRET)) {
    return json({ error: "Invalid cron secret" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const summary = await runCronBatch(admin);
  return json({ mode: "cron-batch", ...summary });
});
