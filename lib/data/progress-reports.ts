import type { WeeklyProgressReport } from "../../types/db";
import { getCurrentUser, isSupabaseConfigured, supabase } from "../supabase/client";
import { DATA_CACHE_PREFIX, readThroughCache } from "./cache";

const REPORT_CACHE_TTL_MS = 5 * 60_000;

type FetchOptions = { force?: boolean };

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
        .select("id, user_id, week_start, summary_text, stats_snapshot, model, generated_at")
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
