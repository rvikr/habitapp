import type { Habit, HabitCompletion } from "../../types/db";

export type HabitType =
  | "water_intake"
  | "walk"
  | "sleep"
  | "read"
  | "run"
  | "cycling"
  | "meditate"
  | "workout"
  | "journal"
  | "vitamins"
  | "healthy_eating"
  | "cold_shower"
  | "no_social_media"
  | "coding"
  | "stretch"
  | "cooking"
  | "custom";

export type MetricType =
  | "volume_ml"
  | "steps"
  | "hours"
  | "pages"
  | "minutes"
  | "distance_km"
  | "boolean";
export type VisualType =
  | "water_bottle"
  | "step_path"
  | "sleep_moon"
  | "reading_book"
  | "progress_ring";
export type ReminderStrategy = "manual" | "interval" | "conditional_interval";

export type HabitIntelligence = {
  habitType: HabitType;
  metricType: MetricType;
  visualType: VisualType;
  reminderStrategy: ReminderStrategy;
  reminderIntervalMinutes: number | null;
  defaultLogValue: number | null;
  unit: string;
  target: number | null;
};

export type UnitOption = {
  label: string;
  unit: string;
  metricType: MetricType;
};

export type HabitProgress = {
  current: number;
  target: number | null;
  ratio: number;
  isDone: boolean;
  label: string;
};

type HabitLike = Pick<Habit, "name" | "description" | "icon" | "target" | "unit"> &
  Partial<
    Pick<
      Habit,
      | "habit_type"
      | "metric_type"
      | "visual_type"
      | "reminder_strategy"
      | "reminder_interval_minutes"
      | "default_log_value"
    >
  >;

type HabitInput = {
  name: string;
  description?: string | null;
  icon?: string | null;
  unit?: string | null;
  target?: number | null;
  habitType?: HabitType | null;
  metricType?: MetricType | null;
  visualType?: VisualType | null;
  reminderStrategy?: ReminderStrategy | null;
  reminderIntervalMinutes?: number | null;
  defaultLogValue?: number | null;
};

const DEFAULTS: Record<HabitType, Omit<HabitIntelligence, "habitType">> = {
  water_intake: {
    metricType: "volume_ml",
    visualType: "water_bottle",
    reminderStrategy: "interval",
    reminderIntervalMinutes: 120,
    defaultLogValue: 250,
    unit: "ml",
    target: 2000,
  },
  walk: {
    metricType: "steps",
    visualType: "step_path",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 180, // ~4-5 nudges/day, stops when step goal hit
    defaultLogValue: 1000,
    unit: "steps",
    target: 8000,
  },
  sleep: {
    metricType: "hours",
    visualType: "sleep_moon",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once logged
    defaultLogValue: 1,
    unit: "hr",
    target: 8,
  },
  read: {
    metricType: "pages",
    visualType: "reading_book",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once done
    defaultLogValue: 10,
    unit: "pages",
    target: 20,
  },
  run: {
    metricType: "distance_km",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 480, // 2 nudges/day max, stops when done
    defaultLogValue: 1,
    unit: "km",
    target: 5,
  },
  cycling: {
    metricType: "distance_km",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 480, // 2 nudges/day max, stops when done
    defaultLogValue: 2,
    unit: "km",
    target: 10,
  },
  meditate: {
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once done
    defaultLogValue: 5,
    unit: "min",
    target: 10,
  },
  workout: {
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 480, // 2 nudges/day max on scheduled days
    defaultLogValue: 45, // realistic minimum session length
    unit: "min",
    target: 45,
  },
  cold_shower: {
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once done
    defaultLogValue: 1,
    unit: "min",
    target: 3,
  },
  coding: {
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 360, // 3 nudges/day, stops once done
    defaultLogValue: 15,
    unit: "min",
    target: 60,
  },
  stretch: {
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once done
    defaultLogValue: 5,
    unit: "min",
    target: 15,
  },
  journal: booleanDefaults(),
  vitamins: booleanDefaults(),
  healthy_eating: booleanDefaults(),
  no_social_media: booleanDefaults(),
  cooking: booleanDefaults(),
  custom: booleanDefaults(),
};

function booleanDefaults(): Omit<HabitIntelligence, "habitType"> {
  return {
    metricType: "boolean",
    visualType: "progress_ring",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 720, // 8am + 8pm, stops once done
    defaultLogValue: null,
    unit: "",
    target: null,
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferHabitType(
  input: Pick<HabitInput, "name" | "icon" | "unit" | "habitType">,
): HabitType {
  if (input.habitType && input.habitType !== "custom") return input.habitType;
  const text = normalizeText(`${input.name} ${input.icon ?? ""} ${input.unit ?? ""}`);
  if (/\b(water|hydrate|hydration|drink)\b/.test(text)) return "water_intake";
  if (/\b(walk|walking|steps?|stroll)\b/.test(text)) return "walk";
  if (/\b(sleep|bed|bedtime|nap)\b/.test(text)) return "sleep";
  if (/\b(read|reading|book|pages?)\b/.test(text)) return "read";
  if (/\b(run|running|jog)\b/.test(text)) return "run";
  if (/\b(cycle|cycling|bike|bicycle)\b/.test(text)) return "cycling";
  if (/\b(meditate|meditation)\b/.test(text)) return "meditate";
  if (/\b(workout|gym|exercise|fitness)\b/.test(text)) return "workout";
  if (/\b(cold shower|ice bath|cold bath|shower)\b/.test(text)) return "cold_shower";
  if (/\b(journal|write diary)\b/.test(text)) return "journal";
  if (/\b(vitamin|supplement|medication|medicine|pill)\b/.test(text)) return "vitamins";
  if (/\b(stretch|yoga)\b/.test(text)) return "stretch";
  if (/\b(code|coding|programming)\b/.test(text)) return "coding";
  if (/\b(cook|cooking)\b/.test(text)) return "cooking";
  return "custom";
}

function inferMetricForName(type: HabitType, name: string, unit?: string | null): MetricType {
  const text = normalizeText(`${name} ${unit ?? ""}`);
  if (type === "read" && /\b(min|mins|minute|minutes)\b/.test(text)) return "minutes";
  return DEFAULTS[type].metricType;
}

function canonicalUnit(metricType: MetricType, unit?: string | null): string {
  const normalized = normalizeText(unit);
  if (metricType === "volume_ml") return "ml";
  if (metricType === "steps") return "steps";
  if (metricType === "hours") return "hr";
  if (metricType === "pages") return "pages";
  if (metricType === "minutes") return "min";
  if (metricType === "distance_km") return "km";
  return normalized;
}

export function unitOptionsForHabit(type: HabitType, metricType?: MetricType): UnitOption[] {
  if (type === "water_intake" || metricType === "volume_ml") {
    return [
      { label: "Millilitres", unit: "ml", metricType: "volume_ml" },
      { label: "Litres", unit: "l", metricType: "volume_ml" },
    ];
  }
  if (type === "run" || type === "cycling" || metricType === "distance_km") {
    return [
      { label: "Kilometres", unit: "km", metricType: "distance_km" },
      { label: "Metres", unit: "m", metricType: "distance_km" },
    ];
  }
  if (type === "walk" || metricType === "steps") {
    return [{ label: "Steps", unit: "steps", metricType: "steps" }];
  }
  if (type === "sleep" || metricType === "hours") {
    return [
      { label: "Hours", unit: "hr", metricType: "hours" },
      { label: "Minutes", unit: "min", metricType: "minutes" },
    ];
  }
  if (type === "read") {
    return [
      { label: "Pages", unit: "pages", metricType: "pages" },
      { label: "Minutes", unit: "min", metricType: "minutes" },
    ];
  }
  if (
    metricType === "minutes" ||
    ["meditate", "workout", "cold_shower", "coding", "stretch"].includes(type)
  ) {
    return [
      { label: "Minutes", unit: "min", metricType: "minutes" },
      { label: "Hours", unit: "hr", metricType: "hours" },
    ];
  }
  return [];
}

function targetFromName(name: string, metricType: MetricType): number | null {
  const text = normalizeText(name);
  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(ml|milliliter|milliliters|l|litre|litres|liter|liters|steps?|pages?|mins?|minutes?|hrs?|hours?|m|meter|meters|km|kilometers?)/,
  );
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(value) || value <= 0) return null;
  if (metricType === "volume_ml") return /^l|lit/.test(unit) ? value * 1000 : value;
  if (metricType === "hours") return /^hr|hour/.test(unit) ? value : null;
  if (metricType === "minutes")
    return /^hr|hour/.test(unit) ? value * 60 : /^min/.test(unit) ? value : null;
  if (metricType === "pages") return /^page/.test(unit) ? value : null;
  if (metricType === "steps") return /^step/.test(unit) ? value : null;
  if (metricType === "distance_km")
    return /^m|meter/.test(unit) ? value / 1000 : /^km|kilometer/.test(unit) ? value : null;
  return null;
}

function normalizeTarget(
  metricType: MetricType,
  target: number | null | undefined,
  unit?: string | null,
): number | null {
  if (target == null) return null;
  const normalizedUnit = normalizeText(unit);
  if (metricType === "volume_ml" && /^(l|litre|litres|liter|liters)$/.test(normalizedUnit))
    return target * 1000;
  if (metricType === "distance_km" && /^(m|meter|meters)$/.test(normalizedUnit))
    return target / 1000;
  if (metricType === "minutes" && /^(hr|hour|hours)$/.test(normalizedUnit)) return target * 60;
  if (metricType === "hours" && /^(min|minute|minutes)$/.test(normalizedUnit)) return target / 60;
  if (metricType === "steps" && /^(km|kilometer|kilometers|mi|mile|miles)$/.test(normalizedUnit))
    return null;
  return target;
}

export function inferHabitIntelligence(input: HabitInput): HabitIntelligence {
  const habitType = inferHabitType(input);
  const defaults = DEFAULTS[habitType];
  const useExplicitMetadata = !!input.habitType && input.habitType !== "custom";
  const metricType =
    useExplicitMetadata && input.metricType
      ? input.metricType
      : inferMetricForName(habitType, input.name, input.unit);
  const target =
    normalizeTarget(metricType, input.target, input.unit) ??
    targetFromName(input.name, metricType) ??
    defaults.target;

  return {
    habitType,
    metricType,
    visualType: useExplicitMetadata && input.visualType ? input.visualType : defaults.visualType,
    reminderStrategy:
      useExplicitMetadata && input.reminderStrategy
        ? input.reminderStrategy
        : defaults.reminderStrategy,
    reminderIntervalMinutes: useExplicitMetadata
      ? (input.reminderIntervalMinutes ?? defaults.reminderIntervalMinutes)
      : defaults.reminderIntervalMinutes,
    defaultLogValue: useExplicitMetadata
      ? (input.defaultLogValue ?? defaults.defaultLogValue)
      : defaults.defaultLogValue,
    unit: canonicalUnit(metricType, input.unit || defaults.unit),
    target,
  };
}

export function progressForHabit(
  habit: HabitLike,
  completion?: Pick<HabitCompletion, "value"> | null,
): HabitProgress {
  const target = habit.target == null ? null : Number(habit.target);
  const hasCompletion = !!completion;
  const current = Number(completion?.value ?? (hasCompletion ? 1 : 0));
  const ratio =
    target && target > 0 ? Math.min(Math.max(current / target, 0), 1) : hasCompletion ? 1 : 0;
  const isDone = target && target > 0 ? current >= target : hasCompletion;
  const unit = habit.unit ? ` ${habit.unit}` : "";
  const label =
    target && target > 0
      ? `${formatAmount(current)} / ${formatAmount(target)}${unit}`
      : isDone
        ? "Done today"
        : "Not logged yet";
  return { current, target, ratio, isDone, label };
}

export function formatAmount(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

/**
 * A "quantity" habit has a numeric target measured in something other than a
 * simple yes/no (e.g. water in ml, steps, pages). These can't be finished in one
 * tap, so logging them should go through the log sheet instead of writing the
 * full target. Boolean habits stay as one-tap toggles.
 */
export function isQuantityHabit(habit: {
  metric_type: MetricType | null;
  target: number | null;
}): boolean {
  return habit.metric_type !== "boolean" && habit.target != null && Number(habit.target) > 0;
}

export function scoreHabitSimilarity(candidate: HabitInput, existing: HabitLike): number {
  const candidateIntel = inferHabitIntelligence(candidate);
  const existingIntel = inferHabitIntelligence({
    name: existing.name,
    icon: existing.icon,
    unit: existing.unit,
    target: existing.target,
    habitType: existing.habit_type,
    metricType: existing.metric_type,
    visualType: existing.visual_type,
    reminderStrategy: existing.reminder_strategy,
    reminderIntervalMinutes: existing.reminder_interval_minutes,
    defaultLogValue: existing.default_log_value,
  });
  const candidateTokens = new Set(normalizeText(candidate.name).split(" ").filter(Boolean));
  const existingTokens = new Set(normalizeText(existing.name).split(" ").filter(Boolean));
  const shared = [...candidateTokens].filter((token) => existingTokens.has(token)).length;
  const tokenScore = shared / Math.max(candidateTokens.size, existingTokens.size, 1);

  let score = 0;
  if (candidateIntel.habitType === existingIntel.habitType && candidateIntel.habitType !== "custom")
    score += 0.55;
  if (candidateIntel.metricType === existingIntel.metricType) score += 0.25;
  if (candidate.icon && candidate.icon === existing.icon) score += 0.1;
  score += Math.min(tokenScore, 1) * 0.2;
  return Math.min(score, 1);
}

export function mergeHabitSettings(candidate: HabitInput, existing: HabitLike) {
  const candidateIntel = inferHabitIntelligence(candidate);
  const existingIntel = inferHabitIntelligence({
    name: existing.name,
    icon: existing.icon,
    unit: existing.unit,
    target: existing.target,
    habitType: existing.habit_type,
    metricType: existing.metric_type,
    visualType: existing.visual_type,
    reminderStrategy: existing.reminder_strategy,
    reminderIntervalMinutes: existing.reminder_interval_minutes,
    defaultLogValue: existing.default_log_value,
  });
  const candidateTarget = candidateIntel.target;
  const existingTarget = existingIntel.target;
  const preferCandidate =
    candidateTarget != null && (existingTarget == null || candidateTarget > existingTarget);
  const preferredIntel = preferCandidate ? candidateIntel : existingIntel;
  const fallbackIntel = preferCandidate ? existingIntel : candidateIntel;
  const preferredDefaultLogValue =
    [preferredIntel.defaultLogValue, fallbackIntel.defaultLogValue]
      .filter((value): value is number => value != null)
      .sort((a, b) => b - a)[0] ?? null;

  return {
    name: preferCandidate ? candidate.name : existing.name,
    description: preferCandidate
      ? (candidate.description ?? existing.description)
      : (existing.description ?? candidate.description ?? null),
    habit_type: preferredIntel.habitType,
    metric_type: preferredIntel.metricType,
    visual_type: preferredIntel.visualType,
    reminder_strategy: preferredIntel.reminderStrategy,
    reminder_interval_minutes: preferredIntel.reminderIntervalMinutes,
    default_log_value: preferredDefaultLogValue,
    unit: preferredIntel.unit || fallbackIntel.unit || null,
    target:
      candidateTarget != null && existingTarget != null
        ? Math.max(candidateTarget, existingTarget)
        : (candidateTarget ?? existingTarget ?? null),
  };
}

export type HabitReminderSettings = {
  enabled: boolean | null | undefined;
  times: string[] | null | undefined;
  days: number[] | null | undefined;
};

const MAX_REMINDER_TIMES_PER_HABIT = 8;
const DEFAULT_REMINDER_DAYS = [0, 1, 2, 3, 4, 5, 6];
const REMINDER_TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function mergeHabitReminders(
  existing: HabitReminderSettings,
  candidate: HabitReminderSettings,
) {
  const enabled = !!existing.enabled || !!candidate.enabled;
  const activeReminderSets = [existing, candidate].filter((settings) => !!settings.enabled);
  const times = normalizeReminderTimes(activeReminderSets.flatMap((settings) => settings.times ?? []));
  const days = normalizeReminderDays(activeReminderSets.flatMap((settings) => settings.days ?? []));

  return {
    enabled,
    times,
    days: enabled ? (days.length > 0 ? days : DEFAULT_REMINDER_DAYS) : DEFAULT_REMINDER_DAYS,
  };
}

function normalizeReminderTimes(times: string[]): string[] {
  return Array.from(new Set(times.filter((time) => REMINDER_TIME_PATTERN.test(time))))
    .sort()
    .slice(0, MAX_REMINDER_TIMES_PER_HABIT);
}

function normalizeReminderDays(days: number[]): number[] {
  return Array.from(new Set(days.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)))
    .sort((a, b) => a - b)
    .slice(0, DEFAULT_REMINDER_DAYS.length);
}

export const SMART_REMINDER_ACTIVE_START_HOUR = 8;
export const SMART_REMINDER_ACTIVE_END_HOUR = 22;
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.8;

export function smartReminderTimesForDay(
  now: Date,
  intervalMinutes: number,
  startHour = SMART_REMINDER_ACTIVE_START_HOUR,
  endHour = SMART_REMINDER_ACTIVE_END_HOUR,
): Date[] {
  if (intervalMinutes <= 0) return [];
  const start = new Date(now);
  start.setHours(startHour, 0, 0, 0);
  const end = new Date(now);
  end.setHours(endHour, 0, 0, 0);

  const slots: Date[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    if (cursor > now) slots.push(new Date(cursor));
    cursor = new Date(cursor.getTime() + intervalMinutes * 60 * 1000);
  }
  return slots;
}
