export type HomeWidgetSnapshotInput = {
  completedCount: number;
  totalHabits: number;
  currentStreak?: number | null;
  level?: number | null;
  nextHabit?: {
    id: string;
    name: string;
    checkInValue?: number | null;
    unit?: string | null;
  } | null;
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
  streakLabel: string;
  levelLabel: string;
  updatedLabel: string;
  checkInLabel: string;
  checkInHabitName: string | null;
  checkInUrl: string | null;
};

function wholeNumber(value: number | null | undefined, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value as number));
}

function positiveAmount(value: number | null | undefined): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function urlAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
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
  if (!habitId) return null;

  const params = [`habitId=${encodeURIComponent(habitId)}`];
  const value = positiveAmount(nextHabit.checkInValue);
  if (value) params.push(`value=${encodeURIComponent(urlAmount(value))}`);
  const unit = nextHabit.unit?.trim();
  if (unit) params.push(`unit=${encodeURIComponent(unit)}`);
  return `lagan://widget/check-in?${params.join("&")}`;
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
    streakLabel: streakLabel(currentStreak),
    levelLabel: `Level ${level}`,
    updatedLabel: updatedLabel(now, locale),
    checkInLabel: checkInUrl ? "Check in" : "Open Lagan",
    checkInHabitName: checkInUrl ? input.nextHabit?.name.trim() || "Next habit" : null,
    checkInUrl,
  };
}

export function stringifyHomeWidgetSnapshot(snapshot: HomeWidgetSnapshot): string {
  return JSON.stringify(snapshot);
}
