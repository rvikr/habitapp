import type { Habit, HabitCompletion, Milestone } from "../../types/db";
import { supabase, isSupabaseConfigured, getCurrentSession } from "../supabase/client";
import { DATA_CACHE_PREFIX, getCachedValue, readThroughCache, setCachedValue } from "./cache";
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

export type TodayProgressMap = Map<string, HabitProgress>;
export type StreaksMap = Map<string, number>;
type DataFetchOptions = { force?: boolean };

const today = () => localDateKey();
const DATA_CACHE_TTL_MS = 30_000;

// Reads the locally persisted session instead of supabase.auth.getUser():
// the latter is a network round trip on every dashboard load, and a transient
// failure there used to make signed-in users look signed out (empty data →
// spurious onboarding redirect). RLS still validates the token server-side.
async function getUser() {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

export type TodayDashboard = {
  // false means the habit list could not be trusted (signed out, network or
  // query failure) — callers must not treat it as "user has no habits".
  ok: boolean;
  userId: string | null;
  habits: Habit[];
  completedToday: Set<string>;
  todayProgress: TodayProgressMap;
  streaksMap: StreaksMap;
  profile: { displayName: string; email: string | null };
  leaderboardOptedIn: boolean;
  coachSignal: CoachSignal | null;
};

function emptyTodayDashboard(displayName: string, ok: boolean, userId: string | null) {
  return {
    ok,
    userId,
    habits: [] as Habit[],
    completedToday: new Set<string>(),
    todayProgress: new Map<string, HabitProgress>(),
    streaksMap: new Map() as StreaksMap,
    profile: { displayName, email: null as string | null },
    leaderboardOptedIn: false,
    coachSignal: null as CoachSignal | null,
  } satisfies TodayDashboard;
}

export async function getHabitsForToday(options?: DataFetchOptions): Promise<TodayDashboard> {
  if (!isSupabaseConfigured()) return emptyTodayDashboard("Demo", false, null);

  const user = await getUser();
  if (!user) return emptyTodayDashboard("there", false, null);

  // Cached manually (not via readThroughCache) so failed loads are never
  // cached: a 30s window of "no habits" was enough to bounce a signed-in
  // user into onboarding and keep them there on retry.
  const cacheKey = `${DATA_CACHE_PREFIX}habits-today:${user.id}:${today()}`;
  if (!options?.force) {
    const cached = getCachedValue<TodayDashboard>(cacheKey, DATA_CACHE_TTL_MS);
    if (cached !== null) return cached;
  }

  let queryResults;
  try {
    queryResults = await Promise.all([
      Promise.all([
        supabase
          .from("habits")
          .select("*")
          .eq("user_id", user.id)
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
      getAiSuggestionsEnabled().catch(() => false),
    ] as const);
  } catch {
    return emptyTodayDashboard("there", false, user.id);
  }

  const [
    [
      { data: habits, error: habitsError },
      { data: completions, error: completionsError },
      { data: profile },
    ],
    aiEnabled,
  ] = queryResults;

  // A profile error only degrades the display name; habits/completions errors
  // make the dashboard untrustworthy.
  if (habitsError || completionsError) {
    return emptyTodayDashboard("there", false, user.id);
  }

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

  const result: TodayDashboard = {
    ok: true,
    userId: user.id,
    habits: habitsList,
    completedToday,
    todayProgress,
    streaksMap,
    profile: { displayName, email: user.email ?? null },
    leaderboardOptedIn: !!(profile?.display_name as string | null | undefined),
    coachSignal,
  };
  return setCachedValue(cacheKey, result);
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
      const [{ count: totalCompletions }, { count: totalHabits }, dateResult, { data: profile }] =
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
          // Distinct dates via RPC: the raw rows grow without bound and PostgREST
          // truncates at 1,000, which silently corrupted streaks for long-tenured
          // users while re-downloading full history on every load.
          supabase.rpc("get_completion_dates"),
          supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
        ]);

      let dateValues: string[];
      if (dateResult.error) {
        // Migration not applied yet: fall back to the legacy full-row scan so
        // stats keep working against an older database.
        const { data: dateDocs } = await supabase
          .from("habit_completions")
          .select("completed_on")
          .eq("user_id", user.id)
          .order("completed_on", { ascending: false });
        dateValues = (dateDocs ?? []).map((d) => d.completed_on as string);
      } else {
        dateValues = ((dateResult.data ?? []) as string[]).map(String);
      }
      const uniqueDates = [...new Set(dateValues)].sort().reverse();
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

      // Longest streak from all-time dates
      const sortedAsc = [...uniqueDates].reverse();
      let longestStreak = 0;
      let currRun = 0;
      let prevDateKey: string | null = null;
      for (const day of sortedAsc) {
        if (prevDateKey === null) {
          currRun = 1;
        } else {
          const d = new Date(prevDateKey + "T12:00:00");
          d.setDate(d.getDate() + 1);
          currRun = localDateKey(d) === day ? currRun + 1 : 1;
        }
        longestStreak = Math.max(longestStreak, currRun);
        prevDateKey = day;
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
        longestStreak,
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

export type DayConsistency = {
  date: string;
  ratio: number;
  count: number;
  isFuture: boolean;
};

export async function getConsistencyData(options?: DataFetchOptions): Promise<DayConsistency[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getUser();
  if (!user) return [];

  return readThroughCache(
    `${DATA_CACHE_PREFIX}consistency:${user.id}:${today()}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const now = new Date();
      // Start from Monday 5 weeks ago so the grid fills 5 complete weeks
      const dayOfWeek = (now.getDay() + 6) % 7; // 0=Mon, 6=Sun
      const startDate = addLocalDays(now, -(dayOfWeek + 28));
      const cutoff = localDateKey(startDate);

      const [{ data: rows }, { count: totalHabits }] = await Promise.all([
        supabase
          .from("habit_completions")
          .select("completed_on, habit_id")
          .eq("user_id", user.id)
          .gte("completed_on", cutoff),
        supabase
          .from("habits")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null)
          .eq("user_id", user.id),
      ]);

      const total = totalHabits ?? 0;
      const countByDate = new Map<string, Set<string>>();
      for (const row of (rows ?? []) as { completed_on: string; habit_id: string }[]) {
        const set = countByDate.get(row.completed_on) ?? new Set<string>();
        set.add(row.habit_id);
        countByDate.set(row.completed_on, set);
      }

      const result: DayConsistency[] = [];
      for (let i = 0; i < 35; i++) {
        const d = addLocalDays(startDate, i);
        const key = localDateKey(d);
        const isFuture = d > now;
        const count = countByDate.get(key)?.size ?? 0;
        result.push({
          date: key,
          ratio: total > 0 && !isFuture ? count / total : 0,
          count,
          isFuture,
        });
      }

      return result;
    },
    options,
  );
}
