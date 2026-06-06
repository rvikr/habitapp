import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import FeedbackRow, { type FeedbackReport } from "./FeedbackRow";
import type { FeedbackStatus } from "./actions";

export const metadata: Metadata = { title: "Feedback" };
export const dynamic = "force-dynamic";

const STATUSES: FeedbackStatus[] = ["new", "reviewed", "planned", "resolved", "closed"];
const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  planned: "Planned",
  resolved: "Resolved",
  closed: "Closed",
};

const PER_PAGE = 25;

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusParam, page: pageStr = "1" } = await searchParams;
  const activeStatus = STATUSES.includes(statusParam as FeedbackStatus)
    ? (statusParam as FeedbackStatus)
    : null;
  const page = Math.max(1, parseInt(pageStr, 10) || 1);
  const from = (page - 1) * PER_PAGE;

  let reports: FeedbackReport[] = [];
  let total = 0;
  let counts: Record<string, number> = {};
  let error = "";

  try {
    const admin = createAdminClient();

    // Per-status counts (for the filter chips) + the grand total.
    const countQueries = await Promise.all([
      admin.from("feedback_reports").select("id", { count: "exact", head: true }),
      ...STATUSES.map((s) =>
        admin.from("feedback_reports").select("id", { count: "exact", head: true }).eq("status", s),
      ),
    ]);
    counts = { all: countQueries[0].count ?? 0 };
    STATUSES.forEach((s, i) => {
      counts[s] = countQueries[i + 1].count ?? 0;
    });

    // The page of reports, optionally filtered by status.
    let query = admin
      .from("feedback_reports")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + PER_PAGE - 1);
    if (activeStatus) query = query.eq("status", activeStatus);

    const { data, count, error: err } = await query;
    if (err) error = err.message;
    else {
      reports = (data ?? []) as FeedbackReport[];
      total = count ?? 0;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const totalPages = Math.ceil(total / PER_PAGE);
  const hrefFor = (s: FeedbackStatus | null) => (s ? `/admin/feedback?status=${s}` : "/admin/feedback");

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="font-extrabold text-slate-900 text-2xl" style={{ letterSpacing: "-0.01em" }}>
          User Feedback
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Bug reports, ideas and ratings submitted from the in-app Settings → Send Feedback screen.
          {counts.all ? ` ${counts.all.toLocaleString()} total.` : ""}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 font-mono">{error}</div>
      )}

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={hrefFor(null)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
            activeStatus === null ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          All <span className="opacity-60">{counts.all ?? 0}</span>
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={hrefFor(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              activeStatus === s ? "bg-slate-900 text-white" : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {STATUS_LABELS[s]} <span className="opacity-60">{counts[s] ?? 0}</span>
          </Link>
        ))}
      </div>

      {/* Feedback list */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {reports.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <span className="material-symbols-outlined text-5xl text-slate-200" style={{ fontVariationSettings: "'FILL' 1" }}>
              forum
            </span>
            <p className="text-slate-400 text-sm">
              {activeStatus ? `No ${STATUS_LABELS[activeStatus].toLowerCase()} feedback.` : "No feedback submitted yet."}
            </p>
            <p className="text-xs text-slate-300">Feedback from the app will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reports.map((report) => (
              <FeedbackRow key={report.id} report={report} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {page} of {totalPages} · {total} {activeStatus ? STATUS_LABELS[activeStatus].toLowerCase() : ""} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/admin/feedback?${activeStatus ? `status=${activeStatus}&` : ""}page=${page - 1}`}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/feedback?${activeStatus ? `status=${activeStatus}&` : ""}page=${page + 1}`}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
