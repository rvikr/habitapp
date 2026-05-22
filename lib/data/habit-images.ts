import type { Habit, HabitType } from "@/types/db";
import { inferHabitType } from "../coach/habit-intelligence.ts";

// Default image used for custom habits or any habit_type without a curated photo.
// A sunrise-over-mountains scene — universally evocative of "start fresh / build something".
export const DEFAULT_HABIT_IMAGE =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop&q=75";

// Unsplash images for preset habit types.
export const HABIT_IMAGES: Partial<Record<HabitType, string>> = {
  workout: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&h=400&fit=crop&q=75",
  run: "https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=600&h=400&fit=crop&q=75",
  walk: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&h=400&fit=crop&q=75",
  water_intake:
    "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=400&fit=crop&q=75",
  read: "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&h=400&fit=crop&q=75",
  meditate: "https://images.unsplash.com/photo-1545389336-cf090694435e?w=600&h=400&fit=crop&q=75",
  journal: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=600&h=400&fit=crop&q=75",
  sleep: "https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=600&h=400&fit=crop&q=75",
  vitamins:
    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&h=400&fit=crop&q=75",
  healthy_eating:
    "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=400&fit=crop&q=75",
  cold_shower:
    "https://images.unsplash.com/photo-1585066058984-bd4f82b7dba6?w=600&h=400&fit=crop&q=75",
  no_social_media:
    "https://images.unsplash.com/photo-1516251193007-45ef944ab0c6?w=600&h=400&fit=crop&q=75",
  coding: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=600&h=400&fit=crop&q=75",
  stretch: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=400&fit=crop&q=75",
  cycling: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=600&h=400&fit=crop&q=75",
  cooking: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&h=400&fit=crop&q=75",
};

export function getHabitImage(habitType: HabitType | null | undefined): string {
  if (!habitType) return DEFAULT_HABIT_IMAGE;
  return HABIT_IMAGES[habitType] ?? DEFAULT_HABIT_IMAGE;
}

export function getHabitImageForHabit(
  habit: Pick<Habit, "habit_type" | "name" | "icon" | "unit">,
): string {
  const inferredType =
    habit.habit_type && habit.habit_type !== "custom"
      ? habit.habit_type
      : inferHabitType({
          name: habit.name,
          icon: habit.icon,
          unit: habit.unit,
          habitType: habit.habit_type,
        });

  return getHabitImage(inferredType);
}
