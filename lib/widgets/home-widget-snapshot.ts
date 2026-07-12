import { translate, type Language } from "../i18n/translations.ts";
import { dayIndexForDateKey, isValidDateKey, localDateKey } from "../utils/date.ts";
import {
  WIDGET_TREND_DAYS,
  type WidgetTrendDay,
  type WidgetTrendDayState,
} from "./widget-trend.ts";
import type { WidgetUpcomingHabit } from "./widget-upcoming.ts";

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
  weekTrend?: WidgetTrendDay[] | null;
  upcomingHabits?: WidgetUpcomingHabit[] | null;
  language?: Language;
  now?: Date;
  locale?: string;
};

export type HomeWidgetTrendEntry = {
  date: string;
  state: WidgetTrendDayState;
  letter: string;
};

export type HomeWidgetUpcomingEntry = {
  name: string;
  label: string;
  time: string | null;
  checkInUrl: string | null;
  checkInLabel: string;
  preferred: boolean;
};

export type HomeWidgetStaleLabels = {
  completionLabel: string;
  streakLabel: string;
  checkInLabel: string;
};

export type HomeWidgetSnapshot = {
  schemaVersion: 2;
  title: string;
  // Absent (not null) in the signed-out snapshot so the provider never treats
  // it as a stale day; org.json would read a JSON null back as "null".
  todayKey?: string;
  updatedAtMs: number;
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
  trend: HomeWidgetTrendEntry[];
  upcoming: HomeWidgetUpcomingEntry[];
  staleLabels: HomeWidgetStaleLabels;
};

// The provider only ever renders what fits; the cap just bounds the payload.
const UPCOMING_LIMIT = 15;

const TREND_STATES: ReadonlySet<string> = new Set(["full", "partial", "empty"]);

// Indexed by Date#getDay() (0 = Sunday).
const DAY_LETTERS: Record<Language, string[]> = {
  en: ["S", "M", "T", "W", "T", "F", "S"],
  hi: ["र", "सो", "मं", "बु", "गु", "शु", "श"],
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

// Free users get the deterministic rule-based message; Pro users' message is
// already AI-resolved upstream (resolveCoachMessage), so no gate is needed.
function coachLabel(coachMessage: string | null | undefined): string {
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

// Exactly WIDGET_TREND_DAYS well-formed entries ending today, else nothing —
// the provider hides the row rather than render a misaligned week. Today's
// entry is overridden from the live counts so an optimistic check-in moves
// the last dot without waiting for a data reload.
function buildTrend(
  weekTrend: WidgetTrendDay[] | null | undefined,
  todayKey: string,
  completedCount: number,
  totalHabits: number,
  language: Language,
): HomeWidgetTrendEntry[] {
  if (!Array.isArray(weekTrend) || weekTrend.length !== WIDGET_TREND_DAYS) return [];
  if (weekTrend[weekTrend.length - 1]?.date !== todayKey) return [];
  const valid = weekTrend.every(
    (day) => isValidDateKey(day.date) && TREND_STATES.has(day.state as string),
  );
  if (!valid) return [];

  const letters = DAY_LETTERS[language] ?? DAY_LETTERS.en;
  const todayState: WidgetTrendDayState =
    totalHabits === 0 || completedCount === 0
      ? "empty"
      : completedCount >= totalHabits
        ? "full"
        : "partial";

  return weekTrend.map((day, index) => ({
    date: day.date,
    state: index === weekTrend.length - 1 ? todayState : day.state,
    letter: letters[dayIndexForDateKey(day.date)] ?? "",
  }));
}

function buildUpcoming(
  upcomingHabits: WidgetUpcomingHabit[] | null | undefined,
  language: Language,
): HomeWidgetUpcomingEntry[] {
  if (!Array.isArray(upcomingHabits)) return [];
  return upcomingHabits
    .filter((habit) => habit.id.trim() && habit.name.trim())
    .slice(0, UPCOMING_LIMIT)
    .map((habit) => {
      const checkInUrl = buildCheckInUrl({
        id: habit.id,
        name: habit.name,
        checkInValue: habit.checkInValue,
      });
      return {
        name: habit.name,
        label: translate(language, "Next: {name}", { name: habit.name }),
        time: habit.time,
        checkInUrl,
        checkInLabel: checkInUrl
          ? translate(language, "Check in")
          : translate(language, "Open Lagan"),
        preferred: habit.preferred === true,
      };
    });
}

function buildStaleLabels(language: Language): HomeWidgetStaleLabels {
  return {
    completionLabel: translate(language, "New day — open Lagan"),
    streakLabel: translate(language, "Open Lagan to keep your streak"),
    checkInLabel: translate(language, "Open Lagan"),
  };
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
  const language: Language = input.language ?? "en";
  const todayKey = localDateKey(now);
  const checkInUrl = buildCheckInUrl(input.nextHabit);

  return {
    schemaVersion: 2,
    title: "Today",
    todayKey,
    updatedAtMs: now.getTime(),
    completedCount,
    totalHabits,
    remainingCount,
    progressPercent,
    completionLabel: completionLabel(completedCount, totalHabits),
    nextHabitLabel: nextHabitLabel(input.nextHabitName, totalHabits, remainingCount),
    coachLabel: coachLabel(input.coachMessage),
    streakLabel: streakLabel(currentStreak),
    levelLabel: `Level ${level}`,
    updatedLabel: updatedLabel(now, locale),
    checkInLabel: checkInUrl ? "Check in" : "Open Lagan",
    checkInUrl,
    trend: buildTrend(input.weekTrend, todayKey, completedCount, totalHabits, language),
    upcoming: buildUpcoming(input.upcomingHabits, language),
    staleLabels: buildStaleLabels(language),
  };
}

export function stringifyHomeWidgetSnapshot(snapshot: HomeWidgetSnapshot): string {
  return JSON.stringify(snapshot);
}
