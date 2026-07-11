export type HomeWidgetSnapshotInput = {
  completedCount: number;
  totalHabits: number;
  currentStreak?: number | null;
  level?: number | null;
  nextHabitName?: string | null;
  nextHabit?: {
    id: string;
    name: string;
    checkInValue?: number | null;
  } | null;
  coachMessage?: string | null;
  hasPro?: boolean;
  now?: Date;
  locale?: string;
};

export type HomeWidgetSnapshot = {
  title: string;
  completedCount: number;
  totalHabits: number;
  remainingCount: number;
  progressPercent: number;
  completionLabel: string;
  nextHabitLabel: string;
  coachLabel: string;
  streakLabel: string;
  levelLabel: string;
  updatedLabel: string;
  checkInLabel: string;
  checkInUrl: string | null;
};

function wholeNumber(value: number | null | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value as number));
}

function completionLabel(completedCount: number, totalHabits: number): string {
  if (totalHabits === 0) return "No habits yet";
  if (completedCount === totalHabits) return "All habits done";
  return `${completedCount} of ${totalHabits} habits done`;
}

function streakLabel(currentStreak: number): string {
  if (currentStreak <= 0) return "No streak yet";
  return `${currentStreak} day${currentStreak === 1 ? "" : "s"} streak`;
}

// Empty labels mean the widget hides that line entirely.
function nextHabitLabel(
  nextHabitName: string | null | undefined,
  totalHabits: number,
  remainingCount: number,
): string {
  const name = nextHabitName?.trim() ?? "";
  if (!name || totalHabits === 0 || remainingCount === 0) return "";
  return `Next: ${name}`;
}

// The coach line is Pro-only by construction; free users get the next habit only.
function coachLabel(coachMessage: string | null | undefined, hasPro: boolean): string {
  if (!hasPro) return "";
  return coachMessage?.trim() ?? "";
}

function updatedLabel(now: Date, locale: string): string {
  const time = now.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Updated ${time}`;
}

function buildCheckInUrl(nextHabit: HomeWidgetSnapshotInput["nextHabit"]): string | null {
  if (!nextHabit) return null;
  const habitId = nextHabit.id.trim();
  const checkInValue = Number(nextHabit.checkInValue);
  if (!habitId || !Number.isFinite(checkInValue) || checkInValue <= 0) return null;

  // The amount is deliberately omitted. The route reloads the habit and
  // calculates a fresh, clamped increment so a stale widget cannot over-log.
  return `lagan://widget/check-in?habitId=${encodeURIComponent(habitId)}`;
}

export function buildHomeWidgetSnapshot(input: HomeWidgetSnapshotInput): HomeWidgetSnapshot {
  const totalHabits = wholeNumber(input.totalHabits);
  const completedCount =
    totalHabits === 0 ? 0 : Math.min(wholeNumber(input.completedCount), totalHabits);
  const currentStreak = wholeNumber(input.currentStreak);
  const level = Math.max(1, wholeNumber(input.level, 1));
  const remainingCount = Math.max(totalHabits - completedCount, 0);
  const progressPercent = totalHabits === 0 ? 0 : Math.round((completedCount / totalHabits) * 100);
  const now = input.now ?? new Date();
  const locale = input.locale ?? "en-US";
  const checkInUrl = buildCheckInUrl(input.nextHabit);

  return {
    title: "Today",
    completedCount,
    totalHabits,
    remainingCount,
    progressPercent,
    completionLabel: completionLabel(completedCount, totalHabits),
    nextHabitLabel: nextHabitLabel(input.nextHabitName, totalHabits, remainingCount),
    coachLabel: coachLabel(input.coachMessage, input.hasPro ?? false),
    streakLabel: streakLabel(currentStreak),
    levelLabel: `Level ${level}`,
    updatedLabel: updatedLabel(now, locale),
    checkInLabel: checkInUrl ? "Check in" : "Open Lagan",
    checkInUrl,
  };
}

export function stringifyHomeWidgetSnapshot(snapshot: HomeWidgetSnapshot): string {
  return JSON.stringify(snapshot);
}
