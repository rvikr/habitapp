import type { Metadata } from "next";
import { getHabitsForToday, getWeeklyCompletions, getInsights } from "@/lib/habits";
import type { Insights } from "@/lib/habits";
import { addDateKeyDays, dateKeyInTimeZone, dayIndexForDateKey } from "@/lib/date";
import { getRequestTimeZone } from "@/lib/request-timezone";
import HabitList from "@/components/HabitList";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const INSIGHT_CONFIGS: {
  key: keyof Insights;
  icon: string;
  color: string;
  bg: string;
  format: (v: Insights[keyof Insights]) => string;
}[] = [
  {
    key: "mostProductiveDay",
    icon: "leaderboard",
    color: "text-primary",
    bg: "bg-primary-fixed/60",
    format: (v) => `Most productive on ${v}s`,
  },
  {
    key: "consistencyChangePct",
    icon: "trending_up",
    color: "text-secondary",
    bg: "bg-secondary-container/50",
    format: (v) => {
      const n = v as number;
      return n >= 0
        ? `Consistency up ${n}% this month`
        : `Consistency down ${Math.abs(n)}% this month`;
    },
  },
  {
    key: "peakTimeLabel",
    icon: "schedule",
    color: "text-tertiary-container",
    bg: "bg-tertiary-fixed/40",
    format: (v) => `Most active ${v}`,
  },
];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage() {
  const [{ habits, completedToday, displayName }, weeklyCompletions, insights] = await Promise.all([
    getHabitsForToday(),
    getWeeklyCompletions(),
    getInsights(),
  ]);

  const total = habits.length;
  const done = completedToday.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const circumference = 2 * Math.PI * 46;
  const dashOffset = circumference - (pct / 100) * circumference;

  // Build a map of date → completion count for the last 7 days
  const timeZone = await getRequestTimeZone();
  const todayKey = dateKeyInTimeZone(new Date(), timeZone);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    return addDateKeyDays(todayKey, -6 + i);
  });
  const completionsByDate = weeklyCompletions.reduce<Record<string, number>>(
    (acc, c) => { acc[c.completed_on] = (acc[c.completed_on] ?? 0) + 1; return acc; },
    {}
  );

  return (
    <div className="flex min-h-screen flex-col xl:flex-row">
      {/* ── Main ─────────────────────────────────────────── */}
      <div className="w-full flex-1 space-y-6 p-4 sm:p-6 lg:p-8 xl:max-w-3xl">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-extrabold text-on-background" style={{ fontSize: "28px", letterSpacing: "-0.01em" }}>
              {greeting()}, {displayName}! 👋
            </h1>
            <p className="text-on-surface-variant text-base mt-1">
              {total === 0
                ? "Add habits in the mobile app to get started."
                : done === total
                ? "All habits complete — amazing work! 🎉"
                : `${done} of ${total} habits complete. Keep going!`}
            </p>
          </div>
        </div>

        {/* Progress + streak bento */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {/* Progress ring */}
          <div className="bg-surface rounded-3xl p-5 border border-outline-variant/20 flex flex-col gap-5 sm:col-span-2 sm:flex-row sm:items-center sm:p-6">
            <div className="relative w-28 h-28 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="46" fill="none" stroke="#2C2C36" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="46" fill="none"
                  stroke="#F26B1F" strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 0.6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-extrabold text-2xl text-primary" style={{ letterSpacing: "-0.02em" }}>{pct}%</span>
                <span className="text-xs text-on-surface-variant font-medium">done</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-secondary uppercase tracking-widest">Daily Goal</p>
              <h2 className="font-bold text-on-background text-xl">Today&apos;s Habits</h2>
              <p className="text-sm text-on-surface-variant">{done} of {total} completed</p>
              {done === total && total > 0 && (
                <span className="inline-flex items-center gap-1 bg-secondary-container/40 text-on-secondary-container text-xs font-bold px-3 py-1 rounded-full">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>celebration</span>
                  Perfect day!
                </span>
              )}
            </div>
          </div>

          {/* Weekly mastery */}
          <div className="bg-gradient-to-br from-primary to-primary-container rounded-3xl p-5 text-white relative overflow-hidden shadow-[0_4px_24px_rgba(93,63,211,0.28)]">
            <div className="absolute -right-4 -bottom-4 opacity-20 pointer-events-none">
              <span className="material-symbols-outlined text-[90px]" style={{ fontVariationSettings: "'FILL' 1" }}>workspace_premium</span>
            </div>
            <div className="relative z-10 space-y-1">
              <p className="text-white/70 text-xs font-bold uppercase tracking-wider">This Week</p>
              <p className="font-extrabold text-3xl" style={{ letterSpacing: "-0.02em" }}>
                {weekDays.filter((d) => (completionsByDate[d] ?? 0) > 0).length}/7
              </p>
              <p className="text-white/80 text-sm font-medium">Days active</p>
            </div>
          </div>
        </div>

        {/* Habit List */}
        <section className="space-y-4">
          <h2 className="font-bold text-on-background text-xl">Today&apos;s Habits</h2>
          <HabitList habits={habits} completedToday={completedToday} />
        </section>

        {/* Weekly chart */}
        <section className="bg-surface rounded-3xl p-6 border border-outline-variant space-y-4">
          <h2 className="font-bold text-on-background text-xl">Weekly Overview</h2>
          <div className="flex items-end gap-3 h-24">
            {weekDays.map((date) => {
              const count = completionsByDate[date] ?? 0;
              const isToday = date === todayKey;
              const heightPct = total > 0 ? Math.min((count / total) * 100, 100) : 0;
              const dayLabel = DAYS[(dayIndexForDateKey(date) + 6) % 7];
              return (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full rounded-lg relative" style={{ height: "100%" }}>
                    <div
                      className={`absolute bottom-0 w-full rounded-lg transition-all duration-500 ${
                        isToday
                          ? "bg-primary/20 border-2 border-primary border-dashed"
                          : count > 0 ? "bg-secondary" : "bg-surface-container"
                      }`}
                      style={{ height: isToday ? "60%" : `${Math.max(heightPct, 8)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${isToday ? "text-primary font-bold" : "text-on-surface-variant"}`}>
                    {dayLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Right Aside ──────────────────────────────────── */}
      <aside className="w-full flex-shrink-0 space-y-6 p-4 sm:p-6 xl:w-72">
        {/* Quick tip */}
        <div className="bg-surface rounded-3xl p-5 border border-outline-variant space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>tips_and_updates</span>
            <h3 className="font-bold text-on-background">Quick Tip</h3>
          </div>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Consistency beats intensity. Even completing one habit today keeps your streak alive.
          </p>
        </div>

        {/* Weekly insights */}
        {INSIGHT_CONFIGS.some((c) => insights[c.key] !== null) && (
          <div className="bg-surface rounded-3xl p-5 border border-outline-variant space-y-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>insights</span>
              <h3 className="font-bold text-on-background">Your Insights</h3>
            </div>
            <div className="space-y-2">
              {INSIGHT_CONFIGS.map(({ key, icon, color, bg, format }) => {
                const value = insights[key];
                if (value === null) return null;
                const isDown = key === "consistencyChangePct" && (value as number) < 0;
                const iconName = key === "consistencyChangePct" && isDown ? "trending_down" : icon;
                const colorClass = key === "consistencyChangePct" && isDown ? "text-error" : color;
                const bgClass = key === "consistencyChangePct" && isDown ? "bg-error-container/40" : bg;
                return (
                  <div key={key} className={`flex items-start gap-2.5 rounded-2xl p-3 overflow-hidden ${bgClass}`}>
                    <span
                      className={`material-symbols-outlined text-base flex-shrink-0 mt-0.5 ${colorClass}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      {iconName}
                    </span>
                    <p className={`text-xs font-semibold leading-snug min-w-0 break-words ${colorClass}`}>
                      {format(value)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Today&apos;s date */}
        <div className="bg-gradient-to-br from-secondary/10 to-secondary-container/20 rounded-3xl p-5 border border-secondary-container/30 space-y-1">
          <p className="text-xs font-bold text-secondary uppercase tracking-widest">Today</p>
          <p className="font-extrabold text-on-background text-2xl" style={{ letterSpacing: "-0.01em" }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long" })}
          </p>
          <p className="text-on-surface-variant text-sm">
            {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Progress summary */}
        <div className="bg-surface rounded-3xl p-5 border border-outline-variant space-y-3">
          <h3 className="font-bold text-on-background">Progress</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-on-surface-variant">Today</span>
                <span className="text-primary">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
