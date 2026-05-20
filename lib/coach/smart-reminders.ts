import type { HabitProgress, HabitType, MetricType, ReminderStrategy } from "./habit-intelligence.ts";
import {
  SMART_REMINDER_ACTIVE_END_HOUR,
  SMART_REMINDER_ACTIVE_START_HOUR,
  smartReminderTimesForDay,
} from "./habit-intelligence.ts";

export type SmartReminderCompletion = {
  completedOn: string;
  createdAt: string;
  value: number | null;
};

export type SmartReminderDecisionContext = {
  habitId: string;
  habitName: string;
  habitType: HabitType;
  metricType: MetricType;
  strategy: ReminderStrategy;
  intervalMinutes: number;
  target: number | null;
  unit: string | null;
  progress: HabitProgress;
  completions: SmartReminderCompletion[];
  manualTimes: string[];
  reminderDays: number[];
  streak: number;
  typicalHour: number | null;
  now: Date;
};

type SanitizeOptions = {
  maxCount?: number;
  minGapMinutes?: number;
  startHour?: number;
  endHour?: number;
};

const DEFAULT_MIN_GAP_MINUTES = 60;

export function sanitizeSmartReminderPlanTimes(
  value: unknown,
  now: Date,
  options: SanitizeOptions = {},
): Date[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const maxCount = options.maxCount ?? 4;
  const minGapMinutes = options.minGapMinutes ?? DEFAULT_MIN_GAP_MINUTES;
  const startHour = options.startHour ?? SMART_REMINDER_ACTIVE_START_HOUR;
  const endHour = options.endHour ?? SMART_REMINDER_ACTIVE_END_HOUR;

  if (value.length > maxCount) return null;

  const seen = new Set<string>();
  const slots: Date[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item)) return null;
    if (seen.has(item)) return null;
    seen.add(item);

    const [hour, minute] = item.split(":").map(Number);
    if (!isInsideActiveWindow(hour, minute, startHour, endHour)) return null;

    const slot = new Date(now);
    slot.setHours(hour, minute, 0, 0);
    if (slot <= now) return null;
    slots.push(slot);
  }

  slots.sort((a, b) => a.getTime() - b.getTime());
  for (let i = 1; i < slots.length; i += 1) {
    const gapMinutes = (slots[i].getTime() - slots[i - 1].getTime()) / 60000;
    if (gapMinutes < minGapMinutes) return null;
  }

  return slots;
}

export function learnedSmartReminderTimesForDay(input: SmartReminderDecisionContext): Date[] {
  if (input.progress.isDone) return [];

  const maxCount = maxSmartReminderCount(input);
  const candidates: Date[] = [];

  if (input.typicalHour != null) {
    addHourCandidate(candidates, input.now, input.typicalHour - 1);
    addHourCandidate(candidates, input.now, input.typicalHour);
  }

  for (const hour of defaultReminderHours(input)) {
    addHourCandidate(candidates, input.now, hour);
  }

  for (const slot of smartReminderTimesForDay(input.now, input.intervalMinutes)) {
    candidates.push(slot);
  }

  return selectReminderSlots(candidates, maxCount);
}

export function maxSmartReminderCount(input: Pick<SmartReminderDecisionContext, "metricType" | "habitType" | "progress">): number {
  if (input.progress.isDone) return 0;

  if (input.metricType === "volume_ml" || input.metricType === "steps") {
    if (input.progress.ratio < 0.25) return 4;
    if (input.progress.ratio < 0.75) return 3;
    return 2;
  }

  if (
    input.habitType === "workout" ||
    input.habitType === "run" ||
    input.habitType === "cycling" ||
    input.habitType === "coding" ||
    input.habitType === "read" ||
    input.habitType === "meditate" ||
    input.habitType === "stretch"
  ) {
    return 2;
  }

  return 1;
}

function defaultReminderHours(
  input: Pick<SmartReminderDecisionContext, "habitType" | "metricType">,
): number[] {
  if (input.metricType === "volume_ml") return [9, 11, 14, 17, 20];
  if (input.metricType === "steps") return [10, 13, 17, 20];

  switch (input.habitType) {
    case "sleep":
      return [21];
    case "read":
      return [20, 21];
    case "run":
    case "cycling":
    case "workout":
      return [8, 18];
    case "meditate":
    case "stretch":
      return [8, 20];
    case "vitamins":
    case "healthy_eating":
      return [9];
    case "coding":
      return [10, 16, 20];
    case "journal":
      return [21];
    default:
      return [9, 18, 21];
  }
}

function addHourCandidate(slots: Date[], now: Date, hour: number) {
  const slot = new Date(now);
  slot.setHours(hour, 0, 0, 0);
  if (slot > now && isInsideActiveWindow(hour, 0)) slots.push(slot);
}

function selectReminderSlots(candidates: Date[], maxCount: number): Date[] {
  const selected: Date[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const key = `${candidate.getHours()}:${candidate.getMinutes()}`;
    if (seen.has(key)) continue;
    if (!hasEnoughGap(candidate, selected)) continue;
    seen.add(key);
    selected.push(candidate);
    if (selected.length >= maxCount) break;
  }

  return selected.sort((a, b) => a.getTime() - b.getTime());
}

function hasEnoughGap(candidate: Date, selected: Date[]): boolean {
  return selected.every(
    (slot) => Math.abs(slot.getTime() - candidate.getTime()) / 60000 >= DEFAULT_MIN_GAP_MINUTES,
  );
}

function isInsideActiveWindow(
  hour: number,
  minute: number,
  startHour = SMART_REMINDER_ACTIVE_START_HOUR,
  endHour = SMART_REMINDER_ACTIVE_END_HOUR,
): boolean {
  if (hour < startHour || hour > endHour) return false;
  if (hour === endHour && minute > 0) return false;
  return true;
}
