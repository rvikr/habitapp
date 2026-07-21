import type { WeeklyProgressReport } from "../../types/db";
import { getCurrentUser, isSupabaseConfigured, supabase } from "../supabase/client";
import { previousLocalWeekStartKey } from "../utils/date";
import { DATA_CACHE_PREFIX, readThroughCache } from "./cache";

const REPORT_CACHE_TTL_MS = 5 * 60_000;

type FetchOptions = { force?: boolean };
type GenerateProgressReportResponse = {
  mode?: string;
  status?: "written" | "skipped" | "failed";
  reason?: string;
  report?: WeeklyProgressReport | null;
  error?: string;
};

export type GenerateProgressReportResult =
  | {
      ok: true;
      report: WeeklyProgressReport;
      status?: "written" | "skipped" | "failed";
      reason?: string;
    }
  | { ok: false; error: string; reason?: string };

export async function getLatestProgressReport(
  options?: FetchOptions,
): Promise<WeeklyProgressReport | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  return readThroughCache(
    `${DATA_CACHE_PREFIX}progress-report:latest:${user.id}`,
    REPORT_CACHE_TTL_MS,
    async () => {
      const { data, error } = await supabase
        .from("weekly_progress_reports")
        .select(
          "id, user_id, week_start, summary_text, insight_text, stats_snapshot, model, prompt_version, generated_at",
        )
        .eq("user_id", user.id)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("getLatestProgressReport failed", error.message);
        return null;
      }
      return (data as WeeklyProgressReport | null) ?? null;
    },
    options,
  );
}

export async function generateProgressReportNow(): Promise<GenerateProgressReportResult> {
  if (!isSupabaseConfigured()) return { ok: false, error: "Supabase is not configured." };
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "You need to sign in again." };

  try {
    const { data, error } = await supabase.functions.invoke<GenerateProgressReportResponse>(
      "progress-report",
      { body: { mode: "generate-now" } },
    );

    if (error) {
      const payload = await functionErrorPayload(error);
      const reason = payload?.reason;
      return {
        ok: false,
        error: errorMessageForReason(reason) ?? payload?.error ?? error.message,
        reason,
      };
    }

    if (data?.error) {
      return {
        ok: false,
        error: errorMessageForReason(data.reason) ?? data.error,
        reason: data.reason,
      };
    }

    const latestReport = await getLatestProgressReport({ force: true });
    const report = latestReport ?? data?.report ?? null;
    if (!report) {
      return {
        ok: false,
        error: errorMessageForReason(data?.reason) ?? "No report was generated yet.",
        reason: data?.reason,
      };
    }

    return { ok: true, report, status: data?.status, reason: data?.reason };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}

// Stale = the report doesn't cover the most recent completed local week. week_start is
// a YYYY-MM-DD key, so plain string comparison orders correctly.
export function isReportStale(report: WeeklyProgressReport): boolean {
  return report.week_start < previousLocalWeekStartKey();
}

export function formatReportWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  if (!y || !m || !d) return weekStart;
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function errorMessageForReason(reason: string | undefined): string | null {
  if (reason === "pro_required") return "Weekly reports are for Pro users.";
  if (reason === "quota_exceeded") return "Weekly report generation is busy. Try again later.";
  if (reason === "feature_disabled") return "Weekly report generation is temporarily unavailable.";
  if (reason === "provider_unavailable" || reason === "pro_guard_failed") {
    return "Weekly report generation is not available right now.";
  }
  if (
    reason === "stats_query_failed" ||
    reason === "existence_check_failed" ||
    reason === "insert_failed"
  ) {
    return "We couldn't build your report just now. Please try again in a moment.";
  }
  return null;
}

async function functionErrorPayload(
  error: unknown,
): Promise<GenerateProgressReportResponse | null> {
  if (!isRecord(error) || !isRecord(error.context)) return null;
  const response = error.context;

  try {
    const clone = typeof response.clone === "function" ? response.clone.call(response) : response;
    if (!isRecord(clone) || typeof clone.json !== "function") return null;
    const payload = await clone.json.call(clone);
    return isRecord(payload) ? (payload as GenerateProgressReportResponse) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
