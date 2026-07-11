import type { Habit, HabitCompletion, Milestone } from "../../types/db";
import { supabase, isSupabaseConfigured, getCurrentSession } from "../supabase/client";
import { DATA_CACHE_PREFIX, getCachedValue, readThroughCache, setCachedValue } from "./cache";
import { addLocalDays, localDateKey, localDateDaysAgo } from "../utils/date";
import { longestStreakFromDates, streakFromDates } from "../coach/streak";
import { XP_PER_LEVEL, levelForXp, xpForCompletions, xpInLevel } from "../coach/xp";
import {
  completedDatesForHabit,
  isHabitCompletionDone,
  progressForHabit,
  type HabitProgress,
} from "../coach/habit-intelligence";
import {
  buildCoachSignals,
  chooseTopCoachSignal,
  normalizeCoachTone,
  type CoachSignal,
} from "../coach/coach";
import { resolveCoachMessage } from "../coach/coach-ai";
import { getAiSuggestionsEnabled } from "../services/feature-flags";
import { resolveProAccess, type ProAccessProfile } from "../subscription/access";
import { dashboardDisplayName } from "./display-name";

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
          .select(
            "display_name, coach_tone, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at",
          )
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

  const streaksMap: StreaksMap = new Map(
    habitsList.map((habit) => [
      habit.id,
      streakFromDates(completedDatesForHabit(habit, completionRows)),
    ]),
  );
  const coachTone = normalizeCoachTone(profile?.coach_tone as string | null | undefined);
  // Personalized messages are Pro-only server-side: gating here keeps free
  // users on the instant template instead of a guaranteed-402 round trip.
  const hasPro = resolveProAccess(profile as ProAccessProfile | null).hasPro;
  let coachSignal = chooseTopCoachSignal(
    buildCoachSignals({ habits: habitsList, completions: completionRows, tone: coachTone }),
  );
  if (coachSignal) {
    coachSignal = {
      ...coachSignal,
      message: await resolveCoachMessage(coachSignal, {
        enabled: aiEnabled && hasPro,
        nonBlocking: true,
      }),
    };
  }
  const displayName = dashboardDisplayName({
    profileDisplayName: profile?.display_name as string | null | undefined,
    fullName: user.user_metadata?.full_name as string | null | undefined,
    email: user.email ?? null,
  });

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
    return { ok: false, habit: null, completions: [] as HabitCompletion[] };
  }
  const user = await getUser();
  if (!user) return { ok: false, habit: null, completions: [] as HabitCompletion[] };

  return readThroughCache(
    `${DATA_CACHE_PREFIX}habit:${user.id}:${id}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const [{ data: habit, error: habitError }, { data: completions, error: completionsError }] =
        await Promise.all([
          supabase
            .from("habits")
            .select("*")
            .eq("id", id)
            .eq("user_id", user.id)
            .is("archived_at", null)
            .maybeSingle(),
          supabase
            .from("habit_completions")
            .select("*")
            .eq("habit_id", id)
            .eq("user_id", user.id)
            .order("completed_on", { ascending: false })
            .limit(60),
        ]);

      if (habitError || completionsError) {
        return { ok: false, habit: null, completions: [] as HabitCompletion[] };
      }

      return {
        ok: true,
        habit: habit as Habit | null,
        completions: (completions ?? []) as HabitCompletion[],
      };
    },
    options,
  );
}

type CoachProfileRow = ProAccessProfile & { coach_tone?: string | null };

// Top coach signal for a single habit, for the habit detail screen. Unlike the
// dashboard's top signal this may be the low-priority encouragement fallback —
// a quiet tip is appropriate on a page dedicated to the habit.
export async function getHabitCoachInsight(
  habit: Habit,
  completions: Pick<HabitCompletion, "completed_on" | "created_at" | "value">[],
): Promise<CoachSignal | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) return null;

  const todayCompletion = completions.find((c) => c.completed_on === today());
  if (progressForHabit(habit, todayCompletion).isDone) return null;

  const [profile, aiEnabled] = await Promise.all([
    readThroughCache(
      `${DATA_CACHE_PREFIX}coach-profile:${user.id}`,
      DATA_CACHE_TTL_MS,
      async () => {
        const { data } = await supabase
          .from("profiles")
          .select(
            "coach_tone, is_pro, pro_trial_ends_at, revenuecat_entitlement_active, pro_expires_at",
          )
          .eq("user_id", user.id)
          .maybeSingle();
        return (data ?? null) as CoachProfileRow | null;
      },
    ),
    getAiSuggestionsEnabled().catch(() => false),
  ]);

  const signal = chooseTopCoachSignal(
    buildCoachSignals({
      habits: [habit],
      completions: completions.map((c) => ({
        habit_id: habit.id,
        completed_on: c.completed_on,
        created_at: c.created_at,
        value: c.value,
      })),
      tone: normalizeCoachTone(profile?.coach_tone),
    }),
  );
  if (!signal) return null;

  const hasPro = resolveProAccess(profile).hasPro;
  const message = await resolveCoachMessage(signal, {
    enabled: aiEnabled && hasPro,
    nonBlocking: true,
  });
  return { ...signal, message };
}

export async function getStats(options?: DataFetchOptions) {
  if (!isSupabaseConfigured()) return null;
  const user = await getUser();
  if (!user) return null;

  return readThroughCache(
    `${DATA_CACHE_PREFIX}stats:${user.id}:${today()}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const [{ count: totalHabits }, completionStatsResult, { data: profile }] = await Promise.all([
        supabase
          .from("habits")
          .select("id", { count: "exact", head: true })
          .is("archived_at", null)
          .eq("user_id", user.id),
        // One target-aware RPC returns the all-time credited count plus bounded
        // distinct dates, avoiding PostgREST's 1,000-row cap.
        supabase.rpc("get_completion_stats"),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
      ]);

      let completions = 0;
      let dateValues: string[] = [];
      if (completionStatsResult.error) {
        // Migration not applied yet: keep older databases functional while
        // applying the same target-aware rule in the fallback.
        const [{ data: habitDocs }, { data: completionDocs }] = await Promise.all([
          supabase
            .from("habits")
            .select("id, name, description, icon, target, unit")
            .eq("user_id", user.id),
          supabase
            .from("habit_completions")
            .select("habit_id, completed_on, value")
            .eq("user_id", user.id)
            .order("completed_on", { ascending: false }),
        ]);
        const habitsById = new Map(
          (
            (habitDocs ?? []) as Pick<
              Habit,
              "id" | "name" | "description" | "icon" | "target" | "unit"
            >[]
          ).map((habit) => [habit.id, habit]),
        );
        const creditedRows = (
          (completionDocs ?? []) as Pick<HabitCompletion, "habit_id" | "completed_on" | "value">[]
        ).filter((completion) => {
          const habit = habitsById.get(completion.habit_id);
          return habit ? isHabitCompletionDone(habit, completion) : false;
        });
        completions = creditedRows.length;
        dateValues = creditedRows.map((completion) => completion.completed_on);
      } else {
        const result = Array.isArray(completionStatsResult.data)
          ? completionStatsResult.data[0]
          : completionStatsResult.data;
        const statsRow = result as {
          total_completions?: number | string;
          completion_dates?: string[] | null;
        } | null;
        const total = Number(statsRow?.total_completions ?? 0);
        completions = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
        dateValues = (statsRow?.completion_dates ?? []).map(String);
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

      const habits = totalHabits ?? 0;
      const totalXp = xpForCompletions(completions);

      return {
        displayName: dashboardDisplayName({
          profileDisplayName: profile?.display_name as string | null | undefined,
          fullName: user.user_metadata?.full_name as string | null | undefined,
          email: user.email ?? null,
        }),
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

export function weekProgressFor(habit: Habit, completions: HabitCompletion[]) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const completedDates = new Set(completedDatesForHabit(habit, completions));
  const days: { label: string; key: string; done: boolean; future: boolean }[] = [];
  const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = addLocalDays(monday, i);
    const key = localDateKey(d);
    const done = completedDates.has(key);
    days.push({ label: labels[i], key, done, future: d > now });
  }
  return days;
}

export function streakFor(habit: Habit, completions: HabitCompletion[]) {
  return streakFromDates(completedDatesForHabit(habit, completions));
}

// Longest streak within the completions the detail screen fetched (last 60
// logs) — a display stat, not an all-time database aggregate.
export function longestStreakFor(habit: Habit, completions: HabitCompletion[]) {
  return longestStreakFromDates(completedDatesForHabit(habit, completions));
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

      const [{ data: rows }, { data: habitRows }] = await Promise.all([
        supabase
          .from("habit_completions")
          .select("completed_on, habit_id, value")
          .eq("user_id", user.id)
          .gte("completed_on", cutoff),
        supabase.from("habits").select("*").is("archived_at", null).eq("user_id", user.id),
      ]);

      const activeHabits = (habitRows ?? []) as Habit[];
      const habitsById = new Map(activeHabits.map((habit) => [habit.id, habit]));
      const total = activeHabits.length;
      const countByDate = new Map<string, Set<string>>();
      for (const row of (rows ?? []) as Pick<
        HabitCompletion,
        "completed_on" | "habit_id" | "value"
      >[]) {
        const habit = habitsById.get(row.habit_id);
        if (!habit || !isHabitCompletionDone(habit, row)) continue;
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
