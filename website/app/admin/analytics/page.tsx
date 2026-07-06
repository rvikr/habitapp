import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

function FunnelBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-semibold text-on-surface">{label}</span>
        <div className="text-right">
          <span className="font-extrabold text-on-background">{value.toLocaleString()}</span>
          <span className="text-xs text-on-surface-variant ml-1.5">{pct}%</span>
        </div>
      </div>
      <div className="w-full h-3 bg-surface-container-high rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RetentionCard({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="hover-raise bg-surface rounded-2xl p-5 border border-outline-variant shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
        <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
      </div>
      <p className="font-extrabold text-3xl text-on-background" style={{ letterSpacing: "-0.02em" }}>{value}</p>
      <p className="text-xs text-on-surface-variant">{sub}</p>
    </div>
  );
}

export default async function AnalyticsPage() {
  let totalUsers = 0;
  let usersWithHabits = 0;
  let usersWithCompletions = 0;
  let activeToday = 0;
  let active7d = 0;
  let active30d = 0;
  let newToday = 0;
  let popularHabits: Array<{ name: string; icon: string; count: number }> = [];
  let last7DaysByDate: Array<{ date: string; label: string; count: number }> = [];
  let error = "";

  try {
    const admin = createAdminClient();
    const today = new Date();
    const todayStr  = today.toISOString().split("T")[0];
    const d7  = new Date(today); d7.setDate(today.getDate() - 6);
    const d30 = new Date(today); d30.setDate(today.getDate() - 29);
    const d7Str  = d7.toISOString().split("T")[0];
    const d30Str = d30.toISOString().split("T")[0];

    // Run all queries in parallel
    const [
      authResult,
      habitsResult,
      todayResult,
      week7Result,
      month30Result,
      allHabitsResult,
      last7Result,
    ] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from("habits").select("user_id"),
      admin.from("habit_completions").select("user_id").eq("completed_on", todayStr),
      admin.from("habit_completions").select("user_id").gte("completed_on", d7Str),
      admin.from("habit_completions").select("user_id").gte("completed_on", d30Str),
      admin.from("habits").select("name, icon").is("archived_at", null),
      admin.from("habit_completions")
        .select("user_id, completed_on")
        .gte("completed_on", d7Str)
        .order("completed_on"),
    ]);

    const users = authResult.data?.users ?? [];
    totalUsers          = users.length;
    newToday            = users.filter((u) => u.created_at.startsWith(todayStr)).length;
    usersWithHabits     = new Set(habitsResult.data?.map((h) => h.user_id)).size;
    usersWithCompletions = new Set((month30Result.data ?? []).map((c) => c.user_id)).size;
    activeToday         = new Set((todayResult.data ?? []).map((c) => c.user_id)).size;
    active7d            = new Set((week7Result.data ?? []).map((c) => c.user_id)).size;
    active30d           = new Set((month30Result.data ?? []).map((c) => c.user_id)).size;

    // Popular habits — count by name in-memory
    const nameCounts = new Map<string, { name: string; icon: string; count: number }>();
    for (const h of allHabitsResult.data ?? []) {
      const key = (h.name as string).toLowerCase().trim();
      const existing = nameCounts.get(key);
      if (existing) existing.count++;
      else nameCounts.set(key, { name: h.name as string, icon: h.icon as string, count: 1 });
    }
    popularHabits = [...nameCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10);

    // Daily completion counts for past 7 days
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dateCountMap = new Map<string, Set<string>>();
    for (const c of last7Result.data ?? []) {
      const d = c.completed_on as string;
      if (!dateCountMap.has(d)) dateCountMap.set(d, new Set());
      dateCountMap.get(d)!.add(c.user_id as string);
    }
    last7DaysByDate = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(d7); d.setDate(d7.getDate() + i);
      const ds = d.toISOString().split("T")[0];
      return { date: ds, label: DAYS[d.getDay()], count: dateCountMap.get(ds)?.size ?? 0 };
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const maxCount = Math.max(...last7DaysByDate.map((d) => d.count), 1);

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-8 max-w-5xl">
      <div>
        <h1 className="font-extrabold text-on-background text-2xl" style={{ letterSpacing: "-0.01em" }}>
          Analytics
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">The pulse of Lagan — growth, engagement, and retention.</p>
      </div>

      {error && (
        <div className="bg-error-container/40 border border-error/30 rounded-2xl p-4 text-sm text-error font-mono">{error}</div>
      )}

      {/* Retention cards */}
      <section className="space-y-3">
        <h2 className="font-bold text-on-surface text-sm uppercase tracking-wide">Retention</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RetentionCard label="New Today"    value={newToday.toLocaleString()}   sub="signed up today"             icon="person_add"       />
          <RetentionCard label="Active Today" value={activeToday.toLocaleString()} sub="completed a habit today"    icon="task_alt"         />
          <RetentionCard label="7-Day Active" value={active7d.toLocaleString()}   sub="active in the last 7 days"   icon="date_range"       />
          <RetentionCard label="30-Day Active" value={active30d.toLocaleString()} sub="active in the last 30 days"  icon="calendar_month"   />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Conversion funnel */}
        <div className="hover-raise bg-surface rounded-2xl p-6 border border-outline-variant shadow-sm space-y-5">
          <div>
            <h2 className="font-bold text-on-background">Conversion Funnel</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">From sign-up to active habit completion.</p>
          </div>
          <div className="space-y-4">
            <FunnelBar label="Signed Up"         value={totalUsers}          total={totalUsers} color="bg-primary"   />
            <FunnelBar label="Created a Habit"   value={usersWithHabits}     total={totalUsers} color="bg-secondary" />
            <FunnelBar label="Completed a Habit" value={usersWithCompletions} total={totalUsers} color="bg-tertiary"  />
          </div>
          <p className="text-xs text-on-surface-variant">
            {totalUsers > 0
              ? `${Math.round((usersWithCompletions / totalUsers) * 100)}% of users have completed at least one habit in the last 30 days.`
              : "No user data yet."}
          </p>
        </div>

        {/* 7-day activity chart */}
        <div className="hover-raise bg-surface rounded-2xl p-6 border border-outline-variant shadow-sm space-y-4">
          <div>
            <h2 className="font-bold text-on-background">Daily Active Users</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">Unique users who completed ≥1 habit per day.</p>
          </div>
          <div className="flex items-end gap-2 h-32">
            {last7DaysByDate.map(({ date, label, count }) => {
              const isToday = date === new Date().toISOString().split("T")[0];
              const heightPct = (count / maxCount) * 100;
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1.5">
                  <span className="text-xs font-bold text-on-surface-variant">{count > 0 ? count : ""}</span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className={`w-full rounded-lg transition-all duration-500 ${isToday ? "bg-primary/30 border-2 border-primary border-dashed" : "bg-primary"}`}
                      style={{ height: `${Math.max(heightPct, 6)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold ${isToday ? "text-primary font-bold" : "text-on-surface-variant"}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Popular habits */}
      <section className="space-y-4">
        <div>
          <h2 className="font-bold text-on-background">Most Popular Habits</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            The habits users track most — helpful for prioritising new features.
          </p>
        </div>
        <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
          {popularHabits.length === 0 ? (
            <div className="py-12 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>bar_chart</span>
              <p className="text-on-surface-variant text-sm mt-3">No habit data yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/60">
              {popularHabits.map(({ name, icon, count }, i) => {
                const widthPct = (count / popularHabits[0].count) * 100;
                return (
                  <div key={name} className="flex items-center gap-4 px-5 py-3.5 relative overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/5 transition-all duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                    <span className="relative z-10 text-xs font-extrabold text-on-surface-variant w-5 text-center">{i + 1}</span>
                    <div className="relative z-10 w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {icon}
                      </span>
                    </div>
                    <p className="relative z-10 flex-1 font-semibold text-sm text-on-surface">{name}</p>
                    <p className="relative z-10 font-extrabold text-sm text-on-surface">
                      {count.toLocaleString()}
                      <span className="text-xs font-normal text-on-surface-variant ml-1">users</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Error tracking placeholder */}
      <section className="space-y-4">
        <h2 className="font-bold text-on-background">Error Tracking</h2>
        <div className="bg-surface rounded-2xl border border-outline-variant shadow-sm p-8 text-center space-y-3">
          <span className="material-symbols-outlined text-5xl text-secondary-fixed" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <p className="font-semibold text-on-surface-variant text-sm">No recent crashes</p>
          <p className="text-xs text-on-surface-variant">
            Integrate Sentry or Crashlytics to surface crash reports here automatically.
          </p>
        </div>
      </section>
    </div>
  );
}
