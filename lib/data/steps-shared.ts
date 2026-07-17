export function normalizeStepCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : 0));
}

export function stepSyncIdentity(habitSyncKey: string, dateKey: string): string {
  return `${habitSyncKey}:${dateKey}`;
}

export type WatchedStepResolution =
  | { kind: "rollover" }
  | { kind: "unchanged"; total: number }
  | { kind: "updated"; total: number };

export function resolveWatchedStepTotal(input: {
  sessionDate: string;
  currentDate: string;
  baseline: number;
  lastTotal: number;
  sessionSteps: number;
}): WatchedStepResolution {
  if (input.sessionDate !== input.currentDate) return { kind: "rollover" };
  const total = Math.max(
    normalizeStepCount(input.lastTotal),
    normalizeStepCount(input.baseline) + normalizeStepCount(input.sessionSteps),
  );
  return total > normalizeStepCount(input.lastTotal)
    ? { kind: "updated", total }
    : { kind: "unchanged", total };
}

export function shouldStartAutomaticStepSync(
  activeIdentity: string | null,
  nextIdentity: string,
): boolean {
  return activeIdentity !== nextIdentity;
}

// Whether automatic pedometer/Health step counts should sync into this habit.
// When metric_type is known we trust it exclusively: a step count must never be
// written into a non-steps habit (e.g. a distance "Walk" with unit "km", which
// would otherwise surface as "143 km"). The habit_type/unit heuristic is only a
// fallback for legacy rows created before metric_type existed.
export function isStepHabit(habit: {
  metric_type?: string | null;
  habit_type?: string | null;
  unit?: string | null;
}): boolean {
  if (habit.metric_type) return habit.metric_type === "steps";
  return habit.habit_type === "walk" || habit.unit === "steps";
}

export function healthConnectTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    operator: "between" as const,
    startTime: start.toISOString(),
    endTime: now.toISOString(),
  };
}

export function normalizeHealthConnectStepAggregate(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const total = (result as { COUNT_TOTAL?: unknown }).COUNT_TOTAL;
  if (total == null) return 0;
  return normalizeStepCount(total);
}
