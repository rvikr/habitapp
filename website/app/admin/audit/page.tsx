import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Audit Log" };
export const dynamic = "force-dynamic";

interface AuditEntry {
  id: string;
  admin_email: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, { icon: string; color: string }> = {
  grant_pro:                 { icon: "workspace_premium", color: "text-secondary"  },
  revoke_pro:                { icon: "remove_circle",     color: "text-slate-400"   },
  reset_password:            { icon: "lock_reset",        color: "text-primary"     },
  verify_email:              { icon: "mark_email_read",   color: "text-green-600"   },
  hard_delete_user:          { icon: "delete_forever",    color: "text-red-500"     },
  toggle_flag_on:            { icon: "toggle_on",         color: "text-green-600"   },
  toggle_flag_off:           { icon: "toggle_off",        color: "text-slate-400"   },
  create_feature_flag:       { icon: "add_circle",        color: "text-primary"     },
  send_global_notification:  { icon: "send",              color: "text-secondary"   },
  dismiss_notification:      { icon: "cancel",            color: "text-slate-400"   },
  update_feedback_status:    { icon: "forum",             color: "text-secondary"   },
  create_suggested_habit:    { icon: "add_task",          color: "text-primary"     },
  update_suggested_habit:    { icon: "edit",              color: "text-primary"     },
  delete_suggested_habit:    { icon: "delete",            color: "text-red-500"     },
  enable_suggested_habit:    { icon: "visibility",        color: "text-green-600"   },
  disable_suggested_habit:   { icon: "visibility_off",    color: "text-slate-400"   },
};

function humaniseAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageStr = "1" } = await searchParams;
  const page = Math.max(1, parseInt(pageStr, 10));
  const perPage = 50;
  const from = (page - 1) * perPage;

  let entries: AuditEntry[] = [];
  let total = 0;
  let error = "";

  try {
    const admin = createAdminClient();
    const { data, count, error: err } = await admin
      .from("admin_audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, from + perPage - 1);

    if (err) error = err.message;
    else {
      entries = (data ?? []) as AuditEntry[];
      total   = count ?? 0;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="font-extrabold text-slate-900 text-2xl" style={{ letterSpacing: "-0.01em" }}>
          Audit Trail
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Immutable log of every action taken in the admin panel. {total > 0 && `${total.toLocaleString()} total entries.`}
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 font-mono">{error}</div>
      )}

      {/* Log table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="grid gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200"
          style={{ gridTemplateColumns: "32px 1fr 160px 120px" }}>
          {["", "Action", "Resource", "Timestamp"].map((h) => (
            <span key={h} className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{h}</span>
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <span className="material-symbols-outlined text-5xl text-slate-200" style={{ fontVariationSettings: "'FILL' 1" }}>
              manage_history
            </span>
            <p className="text-slate-400 text-sm">No admin actions logged yet.</p>
            <p className="text-xs text-slate-300">Actions you take in the admin panel will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const meta = ACTION_ICONS[entry.action] ?? { icon: "admin_panel_settings", color: "text-slate-500" };
              return (
                <div
                  key={entry.id}
                  className="grid gap-4 items-start px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  style={{ gridTemplateColumns: "32px 1fr 160px 120px" }}
                >
                  {/* Icon */}
                  <span className={`material-symbols-outlined text-[20px] mt-0.5 flex-shrink-0 ${meta.color}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}>
                    {meta.icon}
                  </span>

                  {/* Action details */}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold text-sm text-slate-800">{humaniseAction(entry.action)}</p>
                    <p className="text-xs text-slate-400">{entry.admin_email}</p>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <p className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded-lg mt-1 truncate">
                        {JSON.stringify(entry.details)}
                      </p>
                    )}
                  </div>

                  {/* Resource */}
                  <div className="min-w-0">
                    {entry.resource_type && (
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{entry.resource_type}</span>
                    )}
                    {entry.resource_id && (
                      <p className="text-xs text-slate-400 font-mono truncate mt-0.5" title={entry.resource_id}>
                        {entry.resource_id.length > 24
                          ? `${entry.resource_id.slice(0, 8)}…${entry.resource_id.slice(-4)}`
                          : entry.resource_id}
                      </p>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div>
                    <p className="text-xs text-slate-600 font-medium">
                      {new Date(entry.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(entry.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {page} of {totalPages} · {total} entries
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <a
                href={`/admin/audit?page=${page - 1}`}
                className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                ← Previous
              </a>
            )}
            {page < totalPages && (
              <a
                href={`/admin/audit?page=${page + 1}`}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                Next →
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
