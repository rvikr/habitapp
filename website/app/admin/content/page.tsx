import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { HabitCard, AddHabitForm } from "./HabitCard";

export const metadata: Metadata = { title: "Content" };
export const dynamic = "force-dynamic";

interface SuggestedHabit {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  enabled: boolean;
  sort_order: number;
}

interface UserActivity {
  habit_id: string;
  habit_name: string;
  habit_icon: string;
  completed_on: string;
  note: string | null;
}

async function getUserActivity(userEmail: string): Promise<UserActivity[]> {
  try {
    const admin = createAdminClient();
    // Find user by email
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const user = authData.users.find((u) => u.email?.toLowerCase() === userEmail.toLowerCase());
    if (!user) return [];

    // Get their habits
    const { data: habits } = await admin
      .from("habits")
      .select("id, name, icon")
      .eq("user_id", user.id);

    const habitMap = new Map((habits ?? []).map((h) => [h.id as string, h]));

    // Get completions
    const { data: completions } = await admin
      .from("habit_completions")
      .select("habit_id, completed_on, note")
      .eq("user_id", user.id)
      .order("completed_on", { ascending: false })
      .limit(50);

    return (completions ?? []).map((c) => ({
      habit_id:    c.habit_id as string,
      habit_name:  (habitMap.get(c.habit_id as string)?.name as string) ?? "Unknown habit",
      habit_icon:  (habitMap.get(c.habit_id as string)?.icon as string) ?? "star",
      completed_on: c.completed_on as string,
      note:        c.note as string | null,
    }));
  } catch {
    return [];
  }
}

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const { user: userQuery = "" } = await searchParams;

  let suggestedHabits: SuggestedHabit[] = [];
  let activity: UserActivity[] = [];
  let habitError = "";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("suggested_habits")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) habitError = error.message;
    else suggestedHabits = (data ?? []) as SuggestedHabit[];
  } catch (e) {
    habitError = e instanceof Error ? e.message : "Unknown error";
  }

  if (userQuery) {
    activity = await getUserActivity(userQuery);
  }

  return (
    <div className="app-stagger p-4 sm:p-6 lg:p-8 space-y-8 max-w-5xl">
      <div>
        <h1 className="font-extrabold text-on-background text-2xl" style={{ letterSpacing: "-0.01em" }}>
          Content & Moderation
        </h1>
        <p className="text-on-surface-variant text-sm mt-1">
          Manage habit templates and review user activity for support.
        </p>
      </div>

      {/* ── Suggested Habits ───────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-on-background">Habit Templates</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">
              These appear in the habit catalog when users add a new habit.
            </p>
          </div>
          <AddHabitForm />
        </div>

        {habitError ? (
          <div className="bg-error-container/40 border border-error/30 rounded-2xl p-4 text-sm text-error font-mono">{habitError}</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-surface shadow-sm border border-outline-variant">
            {/* Header row */}
            <div className="grid min-w-[680px] gap-3 px-5 py-3 bg-surface-container-low border-b border-outline-variant" style={{ gridTemplateColumns: "24px 36px 1fr 80px 80px auto" }}>
              {["#", "", "Template", "Status", "", "Actions"].map((h, i) => (
                <span key={i} className="text-[11px] font-extrabold text-on-surface-variant uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {suggestedHabits.length === 0 ? (
              <div className="py-12 text-center">
                <span className="material-symbols-outlined text-4xl text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>edit_note</span>
                <p className="text-on-surface-variant text-sm mt-3">No templates yet. Add one above.</p>
              </div>
            ) : (
              suggestedHabits.map((habit) => <HabitCard key={habit.id} habit={habit} />)
            )}
          </div>
        )}
      </section>

      {/* ── Activity Log (User Lookup) ─────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="font-bold text-on-background">User Activity Log</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Look up a user&apos;s habit history to help with support tickets.
          </p>
        </div>

        <form className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
              person_search
            </span>
            <input
              name="user"
              defaultValue={userQuery}
              placeholder="Enter user email to view their activity…"
              type="email"
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-outline-variant rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            Lookup
          </button>
        </form>

        {userQuery && (
          <div className="overflow-hidden rounded-2xl bg-surface shadow-sm border border-outline-variant">
            <div className="px-5 py-4 border-b border-outline-variant/60 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>person</span>
              <p className="font-semibold text-sm text-on-surface">
                Activity for <span className="text-primary">{userQuery}</span>
              </p>
              <span className="ml-auto text-xs text-on-surface-variant">{activity.length} recent completions</span>
            </div>

            {activity.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-on-surface-variant text-sm">No activity found for this email.</p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/60">
                {activity.map((entry, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                        {entry.habit_icon}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-on-surface">{entry.habit_name}</p>
                      {entry.note && <p className="text-xs text-on-surface-variant truncate">{entry.note}</p>}
                    </div>
                    <p className="text-xs text-on-surface-variant flex-shrink-0">
                      {new Date(entry.completed_on).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Reported Content (placeholder) ────────────────── */}
      <section className="space-y-4">
        <h2 className="font-bold text-on-background">Reported Content</h2>
        <div className="bg-surface rounded-2xl shadow-sm border border-outline-variant p-8 text-center space-y-3">
          <span className="material-symbols-outlined text-5xl text-on-surface" style={{ fontVariationSettings: "'FILL' 1" }}>
            flag
          </span>
          <p className="font-semibold text-on-surface-variant text-sm">No reports to review</p>
          <p className="text-xs text-on-surface-variant">
            When users report habit content, it will appear here for review.
          </p>
        </div>
      </section>
    </div>
  );
}
