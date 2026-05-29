// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceAiQuota, recordAiUsageEvent } from "../_shared/ai-guard.ts";
import { generateContent } from "../_shared/gemini.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_REPORT_MODEL =
  Deno.env.get("GEMINI_REPORT_MODEL") ?? Deno.env.get("GEMINI_COACH_MODEL") ?? "gemini-2.5-flash";
const CRON_SECRET = Deno.env.get("PROGRESS_REPORT_CRON_SECRET");
const MAX_BATCH_USERS = Number(Deno.env.get("PROGRESS_REPORT_BATCH_SIZE") ?? 200);
const BATCH_CONCURRENCY = Math.max(1, Number(Deno.env.get("PROGRESS_REPORT_CONCURRENCY") ?? 4));
// Stop scheduling new users past this elapsed wall-clock so the function exits
// cleanly before the platform limit; remaining users are picked up on the next
// (idempotent) cron run.
const BATCH_DEADLINE_MS = Math.max(1000, Number(Deno.env.get("PROGRESS_REPORT_DEADLINE_MS") ?? 120000));

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
type HabitRow = { id: string; name: string; unit: string | null; target: number | null };
type CompletionRow = { habit_id: string; completed_on: string; value: number | null };

type WeeklyStats = {
  weekStart: string;
  weekEnd: string;
  totalCompletions: number;
  activeHabits: number;
  perfectDays: number;
  bestStreak: number;
  byHabit: Array<{
    name: string;
    unit: string | null;
    target: number | null;
    completionsThisWeek: number;
    totalThisWeek: number;
  }>;
};

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

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
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

function fallbackSummary(stats: WeeklyStats): string {
  if (stats.totalCompletions === 0) {
    return "No habits logged this week. A single small log today is enough to restart the chain — pick the easiest one and start there.";
  }
  const habit = stats.byHabit
    .slice()
    .sort((a, b) => b.completionsThisWeek - a.completionsThisWeek)[0];
  const headline = habit
    ? `Strongest habit was ${habit.name} with ${habit.completionsThisWeek} log${habit.completionsThisWeek === 1 ? "" : "s"}.`
    : "";
  const perfect = stats.perfectDays > 0 ? ` You hit every habit on ${stats.perfectDays} day${stats.perfectDays === 1 ? "" : "s"}.` : "";
  return `${stats.totalCompletions} completion${stats.totalCompletions === 1 ? "" : "s"} across ${stats.activeHabits} habit${stats.activeHabits === 1 ? "" : "s"} this week. ${headline}${perfect}`.trim();
}

async function computeWeeklyStats(
  admin: ReturnType<typeof createClient>,
  userId: string,
  weekStartDate: Date,
): Promise<WeeklyStats | null> {
  const weekStart = formatDate(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = formatDate(weekEndDate);

  const [habitsRes, completionsRes] = await Promise.all([
    admin
      .from("habits")
      .select("id, name, unit, target")
      .eq("user_id", userId)
      .is("archived_at", null),
    admin
      .from("habit_completions")
      .select("habit_id, completed_on, value")
      .eq("user_id", userId)
      .gte("completed_on", weekStart)
      .lte("completed_on", weekEnd),
  ]);

  if (habitsRes.error) {
    console.error("progress-report habits query failed", { userId, error: habitsRes.error.message });
    return null;
  }
  if (completionsRes.error) {
    console.error("progress-report completions query failed", { userId, error: completionsRes.error.message });
    return null;
  }

  const habits = (habitsRes.data ?? []) as HabitRow[];
  const completions = (completionsRes.data ?? []) as CompletionRow[];

  const perHabit = new Map<string, { count: number; total: number }>();
  const dayMap = new Map<string, Set<string>>();
  for (const completion of completions) {
    const entry = perHabit.get(completion.habit_id) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(completion.value ?? 0);
    perHabit.set(completion.habit_id, entry);

    const dayHabits = dayMap.get(completion.completed_on) ?? new Set();
    dayHabits.add(completion.habit_id);
    dayMap.set(completion.completed_on, dayHabits);
  }

  const habitCount = habits.length;
  let perfectDays = 0;
  if (habitCount > 0) {
    for (const set of dayMap.values()) {
      if (set.size >= habitCount) perfectDays += 1;
    }
  }

  let bestStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStartDate);
    day.setUTCDate(day.getUTCDate() + i);
    if ((dayMap.get(formatDate(day))?.size ?? 0) > 0) {
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  return {
    weekStart,
    weekEnd,
    totalCompletions: completions.length,
    activeHabits: habitCount,
    perfectDays,
    bestStreak,
    byHabit: habits.map((habit) => {
      const entry = perHabit.get(habit.id);
      return {
        name: habit.name,
        unit: habit.unit,
        target: habit.target == null ? null : Number(habit.target),
        completionsThisWeek: entry?.count ?? 0,
        totalThisWeek: entry?.total ?? 0,
      };
    }),
  };
}

async function generateSummary(stats: WeeklyStats): Promise<{ text: string; generated: boolean }> {
  if (!GEMINI_API_KEY) return { text: fallbackSummary(stats), generated: false };

  const response = await generateContent(GEMINI_REPORT_MODEL, GEMINI_API_KEY, {
    systemInstruction: {
      parts: [
        {
          text:
            "You write a short weekly habit progress summary, 2-3 sentences, under 480 characters. " +
            "Be specific, supportive, and concrete: cite the actual numbers from the data. " +
            "Highlight the strongest habit and one area to focus on next week. Do not mention AI or use medical language.",
        },
      ],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: JSON.stringify(stats) }],
      },
    ],
    generationConfig: {
      maxOutputTokens: 240,
      temperature: 0.6,
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
): Promise<{ status: "written" | "skipped" | "failed"; reason?: string }> {
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

async function runCronBatch(admin: ReturnType<typeof createClient>) {
  const now = new Date();
  const previousWeekStart = isoWeekStart(now);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

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

  async function worker(): Promise<void> {
    while (true) {
      if (Date.now() - startedAt >= BATCH_DEADLINE_MS) {
        deadlineReached = true;
        return;
      }
      const index = cursor++;
      if (index >= users.length) return;
      const result = await generateForUser(admin, users[index].user_id, previousWeekStart);
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("progress-report: service role key missing");
    return json({ error: "Service role not configured" }, 503);
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
