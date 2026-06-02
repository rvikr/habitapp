import type { Habit } from "../../types/db";
import { HABIT_CATALOG, HABIT_CATEGORIES, type HabitCategory } from "../data/habit-catalog.ts";
import type { HabitProgress } from "./habit-intelligence.ts";

type BalanceHabit = Pick<Habit, "id" | "name" | "habit_type">;
type BalanceProgress = Pick<HabitProgress, "ratio" | "isDone">;

export type LifeBalanceSegment = {
  category: HabitCategory;
  score: number;
  habitCount: number;
  completedCount: number;
  color: string;
};

export const LIFE_BALANCE_CATEGORY_COLORS: Record<HabitCategory, string> = {
  Health: "#F26B1F",
  Fitness: "#3EBB7F",
  Productivity: "#4F7CFF",
  Learning: "#FFC56B",
  "Mental Health": "#9B6CFF",
  Spiritual: "#E05CA8",
  Finance: "#2DA8A0",
};

const categoryByHabitType = new Map(
  HABIT_CATALOG.filter((entry) => entry.habitType !== "custom").map((entry) => [
    entry.habitType,
    entry.category,
  ]),
);

const categoryByName = new Map(
  HABIT_CATALOG.map((entry) => [normalizeHabitName(entry.name), entry.category]),
);

function normalizeHabitName(name: string): string {
  return name.trim().toLowerCase();
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

export function lifeBalanceCategoryForHabit(habit: BalanceHabit): HabitCategory | null {
  if (habit.habit_type && habit.habit_type !== "custom") {
    return categoryByHabitType.get(habit.habit_type) ?? null;
  }

  return categoryByName.get(normalizeHabitName(habit.name)) ?? null;
}

export function buildLifeBalanceWheelSegments(
  habits: BalanceHabit[],
  todayProgress: Map<string, BalanceProgress | undefined>,
): LifeBalanceSegment[] {
  const buckets = new Map(
    HABIT_CATEGORIES.map((category) => [
      category,
      { scoreTotal: 0, habitCount: 0, completedCount: 0 },
    ]),
  );

  for (const habit of habits) {
    const category = lifeBalanceCategoryForHabit(habit);
    if (!category) continue;

    const bucket = buckets.get(category);
    if (!bucket) continue;

    const progress = todayProgress.get(habit.id);
    bucket.scoreTotal += clampRatio(progress?.ratio ?? 0);
    bucket.habitCount += 1;
    if (progress?.isDone) bucket.completedCount += 1;
  }

  return HABIT_CATEGORIES.map((category) => {
    const bucket = buckets.get(category)!;
    return {
      category,
      score: bucket.habitCount > 0 ? bucket.scoreTotal / bucket.habitCount : 0,
      habitCount: bucket.habitCount,
      completedCount: bucket.completedCount,
      color: LIFE_BALANCE_CATEGORY_COLORS[category],
    };
  });
}
