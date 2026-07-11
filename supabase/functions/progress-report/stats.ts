// Pure, dependency-free weekly-report computation. Kept separate from index.ts
// (which has Deno-only imports and a top-level `serve`) so the Node test runner
// can import and exercise the math directly. No `Deno`/`https:` imports here.

export type HabitStatsRow = {
  id: string;
  name: string;
  unit: string | null;
  target: number | null;
  metric_type: string | null;
  reminder_days: number[] | null;
  reminders_enabled: boolean | null;
  created_at: string;
};

export type CompletionStatsRow = {
  habit_id: string;
  completed_on: string;
  value: number | null;
};

// One habit's deterministic weekly breakdown. Every figure carries the habit's
// own unit; the LLM only rephrases these — it never derives or converts numbers
// (deriving numbers is what produced the bogus "143 km").
export type HabitAnalysis = {
  name: string;
  unit: string | null;
  target: number | null;
  isQuantity: boolean;
  daysLogged: number;
  scheduledDays: number;
  completionRate: number; // 0..1, daysLogged / scheduledDays
  weeklyTotal: number | null; // quantity habits only
  dailyAverage: number | null; // quantity habits only, per logged day
  targetHitDays: number | null; // quantity habits only
  displayTotal: string | null; // pre-formatted "41,000 steps"
  displayAverage: string | null; // pre-formatted "8,200 steps"
};

export type WeeklyStats = {
  weekStart: string;
  weekEnd: string;
  totalCompletions: number;
  activeHabits: number;
  perfectDays: number;
  bestStreak: number;
  completionRate: number; // overall, 0..1 across all scheduled habit-days
  strongestHabit: string | null;
  focusHabit: string | null;
  trend: { lastWeekCompletions: number; delta: number };
  byHabit: HabitAnalysis[];
};

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Mirrors lib/coach/habit-intelligence.ts formatAmount, with thousands grouping
// so large quantities (e.g. step counts) read as "41,000" not "41000".
export function formatAmount(value: number): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return rounded.toLocaleString("en-US");
}

export function withUnit(value: number, unit: string | null): string {
  const suffix = unit && unit.trim() ? ` ${unit.trim()}` : "";
  return `${formatAmount(value)}${suffix}`;
}

export function pct(ratio: number): number {
  return Math.round(ratio * 100);
}

// reminder_days uses the convention 0 = Monday … 6 = Sunday, matching the
// Monday-anchored week we iterate (offset i = day index from week start).
export function scheduledDaysForHabit(
  habit: HabitStatsRow,
  weekStartDate: Date,
  today: Date,
): number {
  const createdDay = formatDate(new Date(habit.created_at));
  const useReminderDays =
    habit.reminders_enabled === true &&
    Array.isArray(habit.reminder_days) &&
    habit.reminder_days.length > 0;
  let count = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStartDate);
    day.setUTCDate(day.getUTCDate() + i);
    const dayKey = formatDate(day);
    if (day > today) continue; // never count future days
    if (dayKey < createdDay) continue; // habit didn't exist yet
    if (useReminderDays && !habit.reminder_days!.includes(i)) continue;
    count += 1;
  }
  return count;
}

export function creditedCompletionRows(
  habits: HabitStatsRow[],
  completions: CompletionStatsRow[],
): CompletionStatsRow[] {
  const habitsById = new Map(habits.map((habit) => [habit.id, habit]));
  return completions.filter((completion) => {
    const habit = habitsById.get(completion.habit_id);
    if (!habit) return false;
    const target = habit.target == null ? null : Number(habit.target);
    if (target != null && Number.isFinite(target) && target > 0) {
      return Number(completion.value ?? 1) >= target;
    }
    return true;
  });
}

export function buildWeeklyStats(params: {
  habits: HabitStatsRow[];
  completions: CompletionStatsRow[];
  lastWeekCompletions: number;
  weekStartDate: Date;
  today: Date;
}): WeeklyStats {
  const { habits, completions, lastWeekCompletions, weekStartDate, today } = params;
  const creditedCompletions = creditedCompletionRows(habits, completions);

  const weekStart = formatDate(weekStartDate);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEnd = formatDate(weekEndDate);

  // Raw per-habit totals preserve every quantity increment for reporting. Credit
  // maps include only target-reaching rows so partial days do not inflate streaks,
  // completion rates, perfect days, or week-over-week completion counts.
  const perHabit = new Map<
    string,
    { days: Set<string>; total: number; dayTotals: Map<string, number> }
  >();
  const creditedDaysByHabit = new Map<string, Set<string>>();
  const dayMap = new Map<string, Set<string>>();
  for (const completion of completions) {
    const entry =
      perHabit.get(completion.habit_id) ?? { days: new Set(), total: 0, dayTotals: new Map() };
    const value = Number(completion.value ?? 0);
    entry.days.add(completion.completed_on);
    entry.total += value;
    entry.dayTotals.set(
      completion.completed_on,
      (entry.dayTotals.get(completion.completed_on) ?? 0) + value,
    );
    perHabit.set(completion.habit_id, entry);
  }

  for (const completion of creditedCompletions) {
    const habitDays = creditedDaysByHabit.get(completion.habit_id) ?? new Set<string>();
    habitDays.add(completion.completed_on);
    creditedDaysByHabit.set(completion.habit_id, habitDays);
    const dayHabits = dayMap.get(completion.completed_on) ?? new Set();
    dayHabits.add(completion.habit_id);
    dayMap.set(completion.completed_on, dayHabits);
  }

  const habitCount = habits.length;
  let perfectDays = 0;
  if (habitCount > 0) {
    for (const set of dayMap.values()) {
      if (set.size >= habitCount) perfectDays += 1;
    }
  }

  let bestStreak = 0;
  let currentStreak = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(weekStartDate);
    day.setUTCDate(day.getUTCDate() + i);
    if ((dayMap.get(formatDate(day))?.size ?? 0) > 0) {
      currentStreak += 1;
      if (currentStreak > bestStreak) bestStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  let scheduledTotal = 0;
  let loggedTotal = 0;

  const byHabit: HabitAnalysis[] = habits.map((habit) => {
    const entry = perHabit.get(habit.id);
    const target = habit.target == null ? null : Number(habit.target);
    const isQuantity = habit.metric_type !== "boolean" && target != null && target > 0;
    const daysLogged = creditedDaysByHabit.get(habit.id)?.size ?? 0;
    const rawDaysLogged = entry?.days.size ?? 0;
    const scheduledDays = scheduledDaysForHabit(habit, weekStartDate, today);
    const completionRate = scheduledDays > 0 ? Math.min(daysLogged / scheduledDays, 1) : 0;

    scheduledTotal += scheduledDays;
    loggedTotal += Math.min(daysLogged, scheduledDays || daysLogged);

    let weeklyTotal: number | null = null;
    let dailyAverage: number | null = null;
    let targetHitDays: number | null = null;
    let displayTotal: string | null = null;
    let displayAverage: string | null = null;
    if (isQuantity) {
      weeklyTotal = entry?.total ?? 0;
      dailyAverage = rawDaysLogged > 0 ? weeklyTotal / rawDaysLogged : 0;
      targetHitDays = 0;
      if (entry && target != null) {
        for (const dayValue of entry.dayTotals.values()) {
          if (dayValue >= target) targetHitDays += 1;
        }
      }
      displayTotal = withUnit(weeklyTotal, habit.unit);
      displayAverage = withUnit(dailyAverage, habit.unit);
    }

    return {
      name: habit.name,
      unit: habit.unit,
      target,
      isQuantity,
      daysLogged,
      scheduledDays,
      completionRate,
      weeklyTotal,
      dailyAverage,
      targetHitDays,
      displayTotal,
      displayAverage,
    };
  });

  const scheduled = byHabit.filter((h) => h.scheduledDays > 0);
  const strongest = scheduled
    .slice()
    .sort((a, b) => b.completionRate - a.completionRate || b.daysLogged - a.daysLogged)[0];
  const focus = scheduled
    .slice()
    .sort((a, b) => a.completionRate - b.completionRate || a.daysLogged - b.daysLogged)[0];

  return {
    weekStart,
    weekEnd,
    totalCompletions: creditedCompletions.length,
    activeHabits: habitCount,
    perfectDays,
    bestStreak,
    completionRate: scheduledTotal > 0 ? Math.min(loggedTotal / scheduledTotal, 1) : 0,
    strongestHabit: strongest?.name ?? null,
    // Only surface a focus habit when it is distinct from the strongest and
    // actually fell short (rate < 100%), so a single-habit or all-perfect week
    // doesn't flag a habit that needs no work.
    focusHabit:
      focus && focus.name !== strongest?.name && focus.completionRate < 1 ? focus.name : null,
    trend: { lastWeekCompletions, delta: creditedCompletions.length - lastWeekCompletions },
    byHabit,
  };
}

// Plain-text, pre-computed facts handed to the LLM. The model is told to echo
// these verbatim and never do arithmetic or unit conversion of its own.
export function buildFacts(stats: WeeklyStats): string {
  const lines: string[] = [];
  lines.push(`Week of ${stats.weekStart} to ${stats.weekEnd}.`);
  lines.push(
    `Overall: ${stats.totalCompletions} completion${stats.totalCompletions === 1 ? "" : "s"} across ${stats.activeHabits} habit${stats.activeHabits === 1 ? "" : "s"}, ${pct(stats.completionRate)}% of scheduled habit-days completed.`,
  );
  if (stats.perfectDays > 0) {
    lines.push(`Perfect days (every habit done): ${stats.perfectDays}.`);
  }
  lines.push(`Best streak this week: ${stats.bestStreak} day${stats.bestStreak === 1 ? "" : "s"}.`);
  for (const h of stats.byHabit) {
    if (h.isQuantity) {
      const goal =
        h.target != null
          ? `, hit the ${withUnit(h.target, h.unit)} goal on ${h.targetHitDays} day${h.targetHitDays === 1 ? "" : "s"}`
          : "";
      lines.push(
        `${h.name}: completed ${h.daysLogged} of ${h.scheduledDays} days (${pct(h.completionRate)}%), ${h.displayTotal} total, ${h.displayAverage} per logged day${goal}.`,
      );
    } else {
      lines.push(
        `${h.name}: completed ${h.daysLogged} of ${h.scheduledDays} days (${pct(h.completionRate)}%).`,
      );
    }
  }
  if (stats.strongestHabit) lines.push(`Strongest habit: ${stats.strongestHabit}.`);
  if (stats.focusHabit) lines.push(`Needs the most work: ${stats.focusHabit}.`);
  const delta = stats.trend.delta;
  lines.push(
    `Versus last week: ${delta > 0 ? `+${delta}` : delta} completion${Math.abs(delta) === 1 ? "" : "s"} (last week ${stats.trend.lastWeekCompletions}).`,
  );
  return lines.join("\n");
}

export function fallbackSummary(stats: WeeklyStats): string {
  if (stats.totalCompletions === 0) {
    return "No habits logged this week. A single small log today is enough to restart the chain — pick the easiest one and start there.";
  }
  const parts: string[] = [];
  parts.push(
    `${stats.totalCompletions} completion${stats.totalCompletions === 1 ? "" : "s"} across ${stats.activeHabits} habit${stats.activeHabits === 1 ? "" : "s"} this week (${pct(stats.completionRate)}% of scheduled days).`,
  );
  if (stats.strongestHabit) parts.push(`Strongest habit: ${stats.strongestHabit}.`);
  if (stats.focusHabit && stats.focusHabit !== stats.strongestHabit) {
    parts.push(`Focus next week on ${stats.focusHabit}.`);
  }
  if (stats.perfectDays > 0) {
    parts.push(`You hit every habit on ${stats.perfectDays} day${stats.perfectDays === 1 ? "" : "s"}.`);
  }
  return parts.join(" ").trim();
}
