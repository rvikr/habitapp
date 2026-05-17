import type { Habit, HabitCompletion, Milestone } from "../../types/db";
import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { DATA_CACHE_PREFIX, readThroughCache } from "./cache";
import { addLocalDays, localDateKey, localDateDaysAgo } from "../utils/date";
import { streakFromDates } from "../coach/streak";
import { XP_PER_LEVEL, levelForXp, xpForCompletions, xpInLevel } from "../coach/xp";
import { progressForHabit, type HabitProgress } from "../coach/habit-intelligence";
import {
  buildCoachSignals,
  chooseTopCoachSignal,
  normalizeCoachTone,
  type CoachSignal,
} from "../coach/coach";
import { resolveCoachMessage } from "../coach/coach-ai";
import { getAiSuggestionsEnabled } from "../services/feature-flags";

export type Insights = {
  mostProductiveDay: string | null;
  consistencyChangePct: number | null;
  peakTimeLabel: string | null;
};
export type TodayProgressMap = Map<string, HabitProgress>;
export type StreaksMap = Map<string, number>;
type DataFetchOptions = { force?: boolean };

const today = () => localDateKey();
const DATA_CACHE_TTL_MS = 30_000;

async function getUser() {
  return getCurrentUser();
}

export async function getHabitsForToday(options?: DataFetchOptions) {
  const emptyStreaks: StreaksMap = new Map();
  if (!isSupabaseConfigured()) {
    return {
      habits: [] as Habit[],
      completedToday: new Set<string>(),
      todayProgress: new Map<string, HabitProgress>(),
      streaksMap: emptyStreaks,
      profile: { displayName: "Demo", email: null },
      leaderboardOptedIn: false,
      coachSignal: null as CoachSignal | null,
    };
  }

  const user = await getUser();
  if (!user)
    return {
      habits: [] as Habit[],
      completedToday: new Set<string>(),
      todayProgress: new Map<string, HabitProgress>(),
      streaksMap: emptyStreaks,
      profile: { displayName: "there", email: null },
      leaderboardOptedIn: false,
      coachSignal: null as CoachSignal | null,
    };

  return readThroughCache(
    `${DATA_CACHE_PREFIX}habits-today:${user.id}:${today()}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const [[{ data: habits }, { data: completions }, { data: profile }], aiEnabled] =
        await Promise.all([
          Promise.all([
            supabase
              .from("habits")
              .select("*")
              .is("archived_at", null)
              .order("created_at", { ascending: true }),
            supabase
              .from("habit_completions")
              .select("habit_id, completed_on, created_at, value")
              .eq("user_id", user.id)
              .gte("completed_on", localDateDaysAgo(60)),
            supabase
              .from("profiles")
              .select("display_name, coach_tone")
              .eq("user_id", user.id)
              .maybeSingle(),
          ]),
          getAiSuggestionsEnabled(),
        ]);

      const habitsList = (habits ?? []) as Habit[];
      const completionRows = (completions ?? []) as Pick<
        HabitCompletion,
        "habit_id" | "completed_on" | "created_at" | "value"
      >[];
      const completionsByHabit = new Map(
        completionRows
          .filter((c) => c.completed_on === today())
          .map((c) => [c.habit_id as string, { value: c.value as number | null }]),
      );
      const todayProgress: TodayProgressMap = new Map(
        habitsList.map((habit) => [
          habit.id,
          progressForHabit(habit, completionsByHabit.get(habit.id)),
        ]),
      );
      const completedToday = new Set(
        [...todayProgress.entries()]
          .filter(([, progress]) => progress.isDone)
          .map(([habitId]) => habitId),
      );

      const completionDatesByHabit = new Map<string, string[]>();
      for (const c of completionRows) {
        const dates = completionDatesByHabit.get(c.habit_id as string) ?? [];
        dates.push(c.completed_on as string);
        completionDatesByHabit.set(c.habit_id as string, dates);
      }
      const streaksMap: StreaksMap = new Map(
        habitsList.map((habit) => [
          habit.id,
          streakFromDates(completionDatesByHabit.get(habit.id) ?? []),
        ]),
      );
      const coachTone = normalizeCoachTone(profile?.coach_tone as string | null | undefined);
      let coachSignal = chooseTopCoachSignal(
        buildCoachSignals({ habits: habitsList, completions: completionRows, tone: coachTone }),
      );
      if (coachSignal) {
        coachSignal = {
          ...coachSignal,
          message: await resolveCoachMessage(coachSignal, {
            enabled: aiEnabled,
            nonBlocking: true,
          }),
        };
      }
      const displayName =
        (profile?.display_name as string | null | undefined) ??
        (user.user_metadata?.full_name as string | undefined) ??
        user.email?.split("@")[0] ??
        "there";

      return {
        habits: habitsList,
        completedToday,
        todayProgress,
        streaksMap,
        profile: { displayName, email: user.email ?? null },
        leaderboardOptedIn: !!(profile?.display_name as string | null | undefined),
        coachSignal,
      };
    },
    options,
  );
}

export async function getHabit(id: string, options?: DataFetchOptions) {
  if (!isSupabaseConfigured()) {
    return { habit: null, completions: [] as HabitCompletion[] };
  }
  const user = await getUser();
  if (!user) return { habit: null, completions: [] as HabitCompletion[] };

  return readThroughCache(
    `${DATA_CACHE_PREFIX}habit:${user.id}:${id}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const [{ data: habit }, { data: completions }] = await Promise.all([
        supabase.from("habits").select("*").eq("id", id).eq("user_id", user.id).single(),
        supabase
          .from("habit_completions")
          .select("*")
          .eq("habit_id", id)
          .eq("user_id", user.id)
          .order("completed_on", { ascending: false })
          .limit(60),
      ]);

      return {
        habit: habit as Habit | null,
        completions: (completions ?? []) as HabitCompletion[],
      };
    },
    options,
  );
}

export async function getStats(options?: DataFetchOptions) {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) return null;

  return readThroughCache(
    `${DATA_CACHE_PREFIX}stats:${user.id}:${today()}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const [
        { count: totalCompletions },
        { count: totalHabits },
        { data: dateDocs },
        { data: profile },
      ] = await Promise.all([
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
          .order("completed_on", { ascending: false }),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      ]);

      const uniqueDates = [...new Set((dateDocs ?? []).map((d) => d.completed_on as string))]
        .sort()
        .reverse();
      let currentStreak = 0;
      const cursor = new Date();
      for (const day of uniqueDates) {
        const key = localDateKey(cursor);
        if (day === key) {
          currentStreak++;
          cursor.setDate(cursor.getDate() - 1);
        } else if (day < key) {
          break;
        }
      }

      const completions = totalCompletions ?? 0;
      const habits = totalHabits ?? 0;
      const totalXp = xpForCompletions(completions);

      return {
        displayName:
          (profile?.display_name as string | null | undefined) ??
          (user.user_metadata?.full_name as string | undefined) ??
          user.email?.split("@")[0] ??
          "there",
        email: user.email ?? null,
        level: levelForXp(totalXp),
        xp: xpInLevel(totalXp),
        totalXp,
        xpForNext: XP_PER_LEVEL,
        currentStreak,
        totalCompletions: completions,
        totalHabits: habits,
      };
    },
    options,
  );
}

export function getMilestones(stats: Awaited<ReturnType<typeof getStats>> | null): Milestone[] {
  const totalCompletions = stats?.totalCompletions ?? 0;
  const currentStreak = stats?.currentStreak ?? 0;
  return [
    {
      id: "thirty-day",
      name: "30 Day Consistency",
      description: "Complete at least one habit every day for 30 days straight",
      progress: Math.min(currentStreak / 30, 1),
    },
    {
      id: "hundred-logs",
      name: "100 Logs",
      description: "Log 100 habit completions",
      progress: Math.min(totalCompletions / 100, 1),
    },
  ];
}

export function weekProgressFor(habitId: string, completions: HabitCompletion[]) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const days: { label: string; key: string; done: boolean; future: boolean }[] = [];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = addLocalDays(monday, i);
    const key = localDateKey(d);
    const done = completions.some((c) => c.completed_on === key && c.habit_id === habitId);
    days.push({ label: labels[i], key, done, future: d > now });
  }
  return days;
}

export function streakFor(completions: HabitCompletion[]) {
  return streakFromDates(completions.map((c) => c.completed_on));
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function peakHourLabel(hour: number): string {
  if (hour >= 21) return "late at night";
  if (hour >= 19) return "after 7PM";
  if (hour >= 17) return "in the evening";
  if (hour >= 12) return "in the afternoon";
  if (hour >= 5) return "in the morning";
  return "late at night";
}

export async function getInsights(options?: DataFetchOptions): Promise<Insights> {
  if (!isSupabaseConfigured())
    return { mostProductiveDay: null, consistencyChangePct: null, peakTimeLabel: null };
  const user = await getUser();
  if (!user) return { mostProductiveDay: null, consistencyChangePct: null, peakTimeLabel: null };

  return readThroughCache(
    `${DATA_CACHE_PREFIX}insights:${user.id}:${today()}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const cutoff = localDateDaysAgo(60);
      const midpoint = localDateDaysAgo(30);

      const { data: rows } = await supabase
        .from("habit_completions")
        .select("completed_on, created_at")
        .eq("user_id", user.id)
        .gte("completed_on", cutoff);

      const all = (rows ?? []) as { completed_on: string; created_at: string }[];
      if (all.length < 5)
        return { mostProductiveDay: null, consistencyChangePct: null, peakTimeLabel: null };

      // Most productive day of week
      const dayCounts = [0, 0, 0, 0, 0, 0, 0];
      for (const c of all) {
        const d = new Date(c.completed_on + "T12:00:00");
        dayCounts[d.getDay()]++;
      }
      const maxDay = dayCounts.indexOf(Math.max(...dayCounts));
      const mostProductiveDay = dayCounts[maxDay] > 0 ? DAY_NAMES[maxDay] : null;

      // Month-over-month consistency (raw completion count)
      const thisMonth = all.filter((c) => c.completed_on >= midpoint).length;
      const lastMonth = all.filter((c) => c.completed_on < midpoint).length;
      const consistencyChangePct =
        lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : null;

      // Peak time of day from created_at timestamps
      const hourCounts: Record<number, number> = {};
      for (const c of all) {
        const h = new Date(c.created_at).getHours();
        hourCounts[h] = (hourCounts[h] ?? 0) + 1;
      }
      const topHourEntry = Object.entries(hourCounts).sort(
        (a, b) => Number(b[1]) - Number(a[1]),
      )[0];
      const peakTimeLabel = topHourEntry ? peakHourLabel(parseInt(topHourEntry[0], 10)) : null;

      return { mostProductiveDay, consistencyChangePct, peakTimeLabel };
    },
    options,
  );
}
