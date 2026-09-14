import type { HabitCompletion, SleepEntry } from "../../types/db.ts";
import { isValidDateKey, localDateDaysAgo } from "../utils/date.ts";
import { computeSleepScore } from "./sleep-shared.ts";
import { normalizeStepCount } from "./steps-shared.ts";

export type TrendRange = 7 | 30;

export type TrendCompletion = Pick<
  HabitCompletion,
  "habit_id" | "completed_on" | "created_at" | "value"
>;

export type ProgressTrendInputs = {
  steps: {
    habitId: string;
    target: number | null;
    completions: TrendCompletion[];
  } | null;
  sleep: {
    habitId: string;
    target: number | null;
    completions: TrendCompletion[];
  } | null;
};

export type StepTrendPoint = {
  id: string;
  step_date: string;
  steps: number;
};

export type StepTrendSummary = {
  entries: StepTrendPoint[];
  trendEntries: StepTrendPoint[];
  count: number;
  maximumSteps: number;
};

export type SleepTrendPoint = {
  id: string;
  sleep_date: string;
  duration_minutes: number;
  score: number;
  source: SleepEntry["source"];
};

export const EMPTY_PROGRESS_TRENDS: ProgressTrendInputs = {
  steps: null,
  sleep: null,
};

export function summarizeStepTrend(
  completions: TrendCompletion[],
  range: TrendRange,
  now = new Date(),
): StepTrendSummary {
  const firstDate = localDateDaysAgo(range - 1, now);
  const lastDate = localDateDaysAgo(0, now);
  const byDate = new Map<string, StepTrendPoint>();

  for (const completion of completions) {
    if (
      !isValidDateKey(completion.completed_on) ||
      completion.completed_on < firstDate ||
      completion.completed_on > lastDate
    ) {
      continue;
    }
    const steps = normalizeStepCount(completion.value);
    if (steps <= 0) continue;
    const existing = byDate.get(completion.completed_on);
    if (existing && existing.steps >= steps) continue;
    byDate.set(completion.completed_on, {
      id: `steps:${completion.habit_id}:${completion.completed_on}`,
      step_date: completion.completed_on,
      steps,
    });
  }

  const entries = [...byDate.values()].sort((a, b) => b.step_date.localeCompare(a.step_date));
  return {
    entries,
    trendEntries: [...entries].reverse(),
    count: entries.length,
    maximumSteps: entries.reduce((maximum, entry) => Math.max(maximum, entry.steps), 0),
  };
}

function sleepSourcePriority(source: SleepEntry["source"]): number {
  return source === "healthConnect" || source === "healthKit" ? 2 : 1;
}

export function mergeSleepTrendEntries(
  sleepEntries: SleepEntry[],
  completionFallbacks: TrendCompletion[],
  targetMinutes: number,
): SleepTrendPoint[] {
  const byDate = new Map<string, SleepTrendPoint>();

  for (const completion of completionFallbacks) {
    if (!isValidDateKey(completion.completed_on)) continue;
    const durationHours = Number(completion.value);
    if (!Number.isFinite(durationHours) || durationHours <= 0) continue;
    const durationMinutes = Math.round(durationHours * 60);
    const existing = byDate.get(completion.completed_on);
    if (existing && existing.duration_minutes >= durationMinutes) continue;
    byDate.set(completion.completed_on, {
      id: `manual:${completion.habit_id}:${completion.completed_on}`,
      sleep_date: completion.completed_on,
      duration_minutes: durationMinutes,
      score: computeSleepScore({ durationMinutes, targetMinutes }),
      source: "manual",
    });
  }

  for (const entry of sleepEntries) {
    if (
      !isValidDateKey(entry.sleep_date) ||
      !Number.isFinite(entry.duration_minutes) ||
      entry.duration_minutes <= 0
    ) {
      continue;
    }
    const existing = byDate.get(entry.sleep_date);
    if (existing && sleepSourcePriority(existing.source) > sleepSourcePriority(entry.source)) {
      continue;
    }
    byDate.set(entry.sleep_date, {
      id: entry.id,
      sleep_date: entry.sleep_date,
      duration_minutes: entry.duration_minutes,
      score: entry.score,
      source: entry.source,
    });
  }

  return [...byDate.values()].sort((a, b) => b.sleep_date.localeCompare(a.sleep_date));
}
