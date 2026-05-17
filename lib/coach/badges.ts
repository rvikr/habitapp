export type BadgeTone = "yellow" | "purple" | "teal" | "red" | "indigo" | "orange";

export type ComputedBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tone: BadgeTone;
  earned: boolean;
  progressPct: number;
  hintText: string;
};

export type BadgeStats = {
  totalCompletions: number;
  totalHabits: number;
  currentStreak: number;
};

export type BadgeDef = {
  id: string;
  name: string;
  description: string;
  icon: string;
  tone: BadgeTone;
  check: (s: BadgeStats) => boolean;
  progress: (s: BadgeStats) => number;
  hint: (s: BadgeStats) => string;
};

export const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first-step",
    name: "First Step",
    description: "Log your very first habit completion.",
    icon: "flag",
    tone: "teal",
    check: (s) => s.totalCompletions >= 1,
    progress: (s) => Math.min(s.totalCompletions / 1, 1),
    hint: (s) => `${s.totalCompletions} / 1 completion`,
  },
  {
    id: "habit-builder",
    name: "Habit Builder",
    description: "Create 3 or more habits.",
    icon: "add_task",
    tone: "indigo",
    check: (s) => s.totalHabits >= 3,
    progress: (s) => Math.min(s.totalHabits / 3, 1),
    hint: (s) => `${s.totalHabits} / 3 habits`,
  },
  {
    id: "early-bird",
    name: "Early Bird",
    description: "Log 10 habit completions in total.",
    icon: "eco",
    tone: "teal",
    check: (s) => s.totalCompletions >= 10,
    progress: (s) => Math.min(s.totalCompletions / 10, 1),
    hint: (s) => `${s.totalCompletions} / 10 completions`,
  },
  {
    id: "seven-day",
    name: "7 Day Streak",
    description: "Complete at least one habit every day for 7 days running.",
    icon: "local_fire_department",
    tone: "orange",
    check: (s) => s.currentStreak >= 7,
    progress: (s) => Math.min(s.currentStreak / 7, 1),
    hint: (s) => `${s.currentStreak} / 7 day streak`,
  },
  {
    id: "consistent",
    name: "Consistent",
    description: "Log 50 total habit completions.",
    icon: "workspace_premium",
    tone: "purple",
    check: (s) => s.totalCompletions >= 50,
    progress: (s) => Math.min(s.totalCompletions / 50, 1),
    hint: (s) => `${s.totalCompletions} / 50 completions`,
  },
  {
    id: "healthy-heart",
    name: "Healthy Heart",
    description: "Log 100 total habit completions.",
    icon: "favorite",
    tone: "red",
    check: (s) => s.totalCompletions >= 100,
    progress: (s) => Math.min(s.totalCompletions / 100, 1),
    hint: (s) => `${s.totalCompletions} / 100 completions`,
  },
  {
    id: "thirty-day",
    name: "30 Day Streak",
    description: "Keep your daily habit streak going for 30 days.",
    icon: "whatshot",
    tone: "red",
    check: (s) => s.currentStreak >= 30,
    progress: (s) => Math.min(s.currentStreak / 30, 1),
    hint: (s) => `${s.currentStreak} / 30 day streak`,
  },
  {
    id: "water-master",
    name: "Water Master",
    description: "Log 200 total habit completions.",
    icon: "water_drop",
    tone: "yellow",
    check: (s) => s.totalCompletions >= 200,
    progress: (s) => Math.min(s.totalCompletions / 200, 1),
    hint: (s) => `${s.totalCompletions} / 200 completions`,
  },
  {
    id: "gym-rat",
    name: "Gym Rat",
    description: "Create 5 or more habits.",
    icon: "fitness_center",
    tone: "orange",
    check: (s) => s.totalHabits >= 5,
    progress: (s) => Math.min(s.totalHabits / 5, 1),
    hint: (s) => `${s.totalHabits} / 5 habits`,
  },
  {
    id: "clean-slate",
    name: "Clean Slate",
    description: "Create your very first habit.",
    icon: "auto_awesome",
    tone: "indigo",
    check: (s) => s.totalHabits >= 1,
    progress: (s) => Math.min(s.totalHabits / 1, 1),
    hint: (s) => `${s.totalHabits} / 1 habit created`,
  },
];
