import type { Badge } from "../../types/db";
import { localDateDaysAgo } from "../utils/date";

const daysAgo = (n: number) => localDateDaysAgo(n);

export const seedBadges: Badge[] = [
  {
    id: "water-master",
    name: "Water Master",
    description: "Hit your hydration goal 14 days in a row.",
    icon: "water_drop",
    earned: true,
    earned_at: daysAgo(2),
    tone: "yellow",
  },
  {
    id: "seven-day",
    name: "7 Day Streak",
    description: "Completed every habit 7 days running.",
    icon: "self_improvement",
    earned: true,
    earned_at: daysAgo(5),
    tone: "purple",
  },
  {
    id: "early-bird",
    name: "Early Bird",
    description: "Logged a habit before 7 AM, ten times.",
    icon: "eco",
    earned: true,
    earned_at: daysAgo(8),
    tone: "teal",
  },
  {
    id: "healthy-heart",
    name: "Healthy Heart",
    description: "30 minutes of movement, 10 days.",
    icon: "favorite",
    earned: true,
    earned_at: daysAgo(12),
    tone: "red",
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    description: "Started a fresh routine.",
    icon: "auto_awesome",
    earned: true,
    earned_at: daysAgo(20),
    tone: "indigo",
  },
  {
    id: "gym-rat",
    name: "Gym Rat",
    description: "Worked out 12 times in a month.",
    icon: "fitness_center",
    earned: true,
    earned_at: daysAgo(15),
    tone: "orange",
  },
];
