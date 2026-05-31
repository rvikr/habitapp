import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Overview" };
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

interface FeatureFlag {
  key: string;
  name: string;
  enabled: boolean;
}

const QUICK_LINKS = [
  { href: "/admin/users",     icon: "person_search",   label: "Search Users",       color: "text-primary"   },
  { href: "/admin/system",    icon: "toggle_on",       label: "Feature Flags",      color: "text-secondary" },
  { href: "/admin/content",   icon: "edit_note",       label: "Manage Templates",   color: "text-tertiary"  },
  { href: "/admin/analytics", icon: "bar_chart",       label: "View Analytics",     color: "text-primary"   },
];

function StatCard({
  icon, label, value, sub, color = "text-primary",
}: {
  icon: string; label: string; value: string | number; sub?: string; color?: string;
}) {
  return (
    <div className="hover-raise bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        <span className={`material-symbols-outlined text-xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
          {icon}
        </span>
      </div>
      <p className="font-extrabold text-3xl text-slate-900" style={{ letterSpacing: "-0.02em" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default async function AdminPage() {
  let totalUsers = 0;
  let totalHabits = 0;
  let totalCompletions = 0;
  let activeToday = 0;
  let recentAudit: AuditEntry[] = [];
  let flags: FeatureFlag[] = [];
  let serviceRoleError = false;

  try {
    const admin = createAdminClient();
    const today = new Date().toISOString().split("T")[0];

    const [
      authResult,
      habitResult,
      completionResult,
      todayResult,
      auditResult,
      flagResult,
    ] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1 }),
      admin.from("habits").select("id", { count: "exact", head: true }),
      admin.from("habit_completions").select("id", { count: "exact", head: true }),
      admin.from("habit_completions").select("user_id").eq("completed_on", today),
      admin.from("admin_audit_log").select("*").order("created_at", { ascending: false }).limit(8),
      admin.from("feature_flags").select("key, name, enabled"),
    ]);

    totalUsers       = (authResult.data as { total?: number } | null)?.total ?? 0;
    totalHabits      = habitResult.count ?? 0;
    totalCompletions = completionResult.count ?? 0;
    activeToday      = new Set(todayResult.data?.map((d) => d.user_id)).size;
    recentAudit      = (auditResult.data ?? []) as AuditEntry[];
    flags            = (flagResult.data ?? []) as FeatureFlag[];
  } catch (e) {
    if (e instanceof Error) serviceRoleError = true;
  }

  const maintenanceOn = flags.find((f) => f.key === "maintenance_mode")?.enabled ?? false;
  const enabledFlags  = flags.filter((f) => f.enabled && f.key !== "maintenance_mode").length;

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-8 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="font-extrabold text-slate-900 text-2xl" style={{ letterSpacing: "-0.01em" }}>
          Admin Overview
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>

      {/* Service role key warning */}
      {serviceRoleError && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
          <span className="material-symbols-outlined text-amber-500 text-2xl flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
            warning
          </span>
          <div>
            <p className="font-bold text-amber-800 text-sm">Service role key not configured</p>
            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
              Add <code className="bg-amber-100 px-1 rounded font-mono">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
              <code className="bg-amber-100 px-1 rounded font-mono">website/.env.local</code> to unlock all admin features.{" "}
              Get it from <strong>Supabase Dashboard → Settings → API → service_role</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Maintenance mode banner */}
      {maintenanceOn && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3">
          <span className="material-symbols-outlined text-red-500 text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            construction
          </span>
          <p className="font-bold text-red-700 text-sm">
            Maintenance mode is ON — users are seeing the &quot;Coming Back Soon&quot; screen.
          </p>
          <Link href="/admin/system" className="ml-auto text-xs font-bold text-red-600 hover:underline">
            Manage →
          </Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="group"               label="Total Users"         value={totalUsers.toLocaleString()}       sub="registered accounts"  color="text-primary"   />
        <StatCard icon="checklist"           label="Habits Created"      value={totalHabits.toLocaleString()}      sub="across all users"     color="text-secondary" />
        <StatCard icon="task_alt"            label="Total Check-ins"     value={totalCompletions.toLocaleString()} sub="habit completions"    color="text-tertiary"  />
        <StatCard icon="person_check"        label="Active Today"        value={activeToday.toLocaleString()}      sub="completed ≥1 habit"   color="text-green-600" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Quick actions */}
        <div className="hover-raise bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <h2 className="font-bold text-slate-900 text-sm">Quick Actions</h2>
          <div className="space-y-1">
            {QUICK_LINKS.map(({ href, icon, label, color }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <span className={`material-symbols-outlined text-[20px] ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>
                  {icon}
                </span>
                <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900">{label}</span>
                <span className="material-symbols-outlined text-slate-300 text-[16px] ml-auto group-hover:text-slate-500">
                  chevron_right
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* System status */}
        <div className="hover-raise bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">System Status</h2>
            <Link href="/admin/system" className="text-xs text-primary font-bold hover:opacity-70">
              Manage
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Maintenance mode</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${maintenanceOn ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"}`}>
                {maintenanceOn ? "ON" : "OFF"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Active features</span>
              <span className="text-xs font-bold text-slate-500">{enabledFlags} of {flags.length - 1} enabled</span>
            </div>
            <div className="h-px bg-slate-100" />
            {flags.filter(f => f.key !== "maintenance_mode").slice(0, 4).map((f) => (
              <div key={f.key} className="flex items-center justify-between">
                <span className="text-xs text-slate-500 truncate">{f.name}</span>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.enabled ? "bg-green-400" : "bg-slate-300"}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Recent audit */}
        <div className="hover-raise bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Recent Actions</h2>
            <Link href="/admin/audit" className="text-xs text-primary font-bold hover:opacity-70">
              View all
            </Link>
          </div>
          {recentAudit.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No actions logged yet</p>
          ) : (
            <div className="space-y-2.5">
              {recentAudit.map((entry) => (
                <div key={entry.id} className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-700">{entry.action.replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
