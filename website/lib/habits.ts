import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import type { Habit, HabitCompletion } from "@/types/db";
import { addDateKeyDays, dateDaysAgoInTimeZone, dateKeyInTimeZone } from "@/lib/date";
import { getRequestTimeZone } from "@/lib/request-timezone";

export type Insights = {
  mostProductiveDay: string | null;
  consistencyChangePct: number | null;
  peakTimeLabel: string | null;
};

export async function getHabitsForToday() {
  const supabase = await createClient();
  const timeZone = await getRequestTimeZone();
  const user = await getCurrentUser(supabase);
  if (!user)
    return {
      habits: [] as Habit[],
      completedToday: new Set<string>(),
      displayName: "there",
      email: null as string | null,
    };

  const [{ data: habits }, { data: completions }, { data: profile }] =
    await Promise.all([
      supabase
        .from("habits")
        .select("*")
        .eq("user_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("habit_completions")
        .select("habit_id, value")
        .eq("user_id", user.id)
        .eq("completed_on", dateKeyInTimeZone(new Date(), timeZone)),
      supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const habitsList = (habits ?? []) as Habit[];
  const completionByHabit = new Map((completions ?? []).map((c) => [c.habit_id as string, Number(c.value ?? 1)]));
  const completedToday = new Set(
    habitsList
      .filter((habit) => {
        if (!completionByHabit.has(habit.id)) return false;
        const target = habit.target == null ? null : Number(habit.target);
        return target && target > 0 ? (completionByHabit.get(habit.id) ?? 0) >= target : true;
      })
      .map((habit) => habit.id)
  );
  const displayName =
    (profile?.display_name as string | null | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    user.email?.split("@")[0] ??
    "there";

  return {
    habits: habitsList,
    completedToday,
    displayName,
    email: user.email ?? null,
  };
}

export async function getStats() {
  const supabase = await createClient();
  const timeZone = await getRequestTimeZone();
  const user = await getCurrentUser(supabase);
  if (!user) return null;

  const thirtyDaysAgo = dateDaysAgoInTimeZone(30, timeZone);

  const [{ count: totalCompletions }, { count: totalHabits }, { data: recent }] =
    await Promise.all([
      supabase
        .from("habit_completions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("habits")
        .select("id", { count: "exact", head: true })
        .is("archived_at", null)
        .eq("user_id", user.id),
      supabase
        .from("habit_completions")
        .select("completed_on")
        .eq("user_id", user.id)
        .gte("completed_on", thirtyDaysAgo)
        .order("completed_on", { ascending: false }),
    ]);

  // Compute streak
  const activeDates = new Set((recent ?? []).map((r) => r.completed_on));
  let streak = 0;
  let cursor = dateKeyInTimeZone(new Date(), timeZone);
  while (true) {
    if (activeDates.has(cursor)) {
      streak++;
      cursor = addDateKeyDays(cursor, -1);
    } else {
      break;
    }
  }

  return {
    totalCompletions: totalCompletions ?? 0,
    totalHabits: totalHabits ?? 0,
    streak,
    activeDates: Array.from(activeDates),
  };
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function peakHourLabel(hour: number): string {
  if (hour >= 21) return "late at night";
  if (hour >= 19) return "after 7PM";
  if (hour >= 17) return "in the evening";
  if (hour >= 12) return "in the afternoon";
  if (hour >= 5)  return "in the morning";
  return "late at night";
}

export async function getInsights(): Promise<Insights> {
  const supabase = await createClient();
  const timeZone = await getRequestTimeZone();
  const user = await getCurrentUser(supabase);
  if (!user) return { mostProductiveDay: null, consistencyChangePct: null, peakTimeLabel: null };

  const cutoff = dateDaysAgoInTimeZone(60, timeZone);
  const midpoint = dateDaysAgoInTimeZone(30, timeZone);

  const { data: rows } = await supabase
    .from("habit_completions")
    .select("completed_on, created_at")
    .eq("user_id", user.id)
    .gte("completed_on", cutoff);

  const all = (rows ?? []) as { completed_on: string; created_at: string }[];
  if (all.length < 5) return { mostProductiveDay: null, consistencyChangePct: null, peakTimeLabel: null };

  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const c of all) {
    const d = new Date(c.completed_on + "T12:00:00");
    dayCounts[d.getDay()]++;
  }
  const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
  const mostProductiveDay = dayCounts[maxDay] > 0 ? DAY_NAMES[maxDay] : null;

  const thisMonth = all.filter((c) => c.completed_on >= midpoint).length;
  const lastMonth = all.filter((c) => c.completed_on < midpoint).length;
  const consistencyChangePct =
    lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

  const hourCounts: Record<number, number> = {};
  for (const c of all) {
    const h = new Date(c.created_at).getHours();
    hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const topHourEntry = Object.entries(hourCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  const peakTimeLabel = topHourEntry ? peakHourLabel(parseInt(topHourEntry[0], 10)) : null;

  return { mostProductiveDay, consistencyChangePct, peakTimeLabel };
}

export async function getWeeklyCompletions(): Promise<HabitCompletion[]> {
  const supabase = await createClient();
  const timeZone = await getRequestTimeZone();
  const user = await getCurrentUser(supabase);
  if (!user) return [];
  const sevenDaysAgo = dateDaysAgoInTimeZone(6, timeZone);

  const { data } = await supabase
    .from("habit_completions")
    .select("*")
    .eq("user_id", user.id)
    .gte("completed_on", sevenDaysAgo)
    .order("completed_on", { ascending: true });

  return (data ?? []) as HabitCompletion[];
}
