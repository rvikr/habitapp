import type { HabitRecommendation, RoutineWizardAnswers } from "./routine-builder";
import type { HabitType, MetricType, ReminderStrategy, VisualType } from "./habit-intelligence";

const COLORS = new Set(["primary", "secondary", "tertiary", "neutral"]);
const HABIT_TYPES = new Set<HabitType>([
  "water_intake",
  "walk",
  "sleep",
  "read",
  "run",
  "cycling",
  "meditate",
  "workout",
  "journal",
  "vitamins",
  "healthy_eating",
  "cold_shower",
  "no_social_media",
  "coding",
  "stretch",
  "cooking",
  "custom",
]);
const METRIC_TYPES = new Set<MetricType>([
  "volume_ml",
  "steps",
  "hours",
  "pages",
  "minutes",
  "distance_km",
  "boolean",
]);
const VISUAL_TYPES = new Set<VisualType>([
  "water_bottle",
  "step_path",
  "sleep_moon",
  "reading_book",
  "progress_ring",
]);
const REMINDER_STRATEGIES = new Set<ReminderStrategy>([
  "manual",
  "interval",
  "conditional_interval",
]);

export async function refineRoutineRecommendations(
  answers: RoutineWizardAnswers,
  localRecommendations: HabitRecommendation[],
): Promise<{ recommendations: HabitRecommendation[]; generated: boolean }> {
  try {
    const [{ getAiSuggestionsEnabled }, { isSupabaseConfigured, supabase }] = await Promise.all([
      import("../services/feature-flags"),
      import("../supabase/client"),
    ]);
    const enabled = await getAiSuggestionsEnabled();
    if (!enabled || !isSupabaseConfigured())
      return { recommendations: localRecommendations, generated: false };
    const { data, error } = await supabase.functions.invoke<{
      recommendations?: unknown;
      generated?: boolean;
    }>("habit-routine", {
      body: { answers, localRecommendations },
    });
    if (error) return { recommendations: localRecommendations, generated: false };
    const recommendations = sanitizeHabitRecommendations(
      data?.recommendations,
      localRecommendations,
    );
    return {
      recommendations,
      generated: Boolean(data?.generated) && recommendations !== localRecommendations,
    };
  } catch {
    return { recommendations: localRecommendations, generated: false };
  }
}

export function sanitizeHabitRecommendations(
  input: unknown,
  fallback: HabitRecommendation[],
): HabitRecommendation[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) return fallback;
  const sanitized: HabitRecommendation[] = [];
  const seen = new Set<string>();

  for (const item of input) {
    if (!isRecord(item)) return fallback;
    const recommendation = sanitizeRecommendation(item);
    if (!recommendation) return fallback;
    const key = `${recommendation.habitType}:${recommendation.name.toLowerCase()}`;
    if (seen.has(key)) return fallback;
    seen.add(key);
    sanitized.push(recommendation);
  }

  return sanitized;
}

function sanitizeRecommendation(item: Record<string, unknown>): HabitRecommendation | null {
  const id = cleanText(item.id, 48);
  const name = cleanText(item.name, 60);
  const reason = cleanText(item.reason, 180);
  const icon = cleanText(item.icon, 40);
  const unit = typeof item.unit === "string" ? item.unit.trim().slice(0, 16) : "";
  const color = item.color;
  const habitType = item.habitType;
  const metricType = item.metricType;
  const visualType = item.visualType;
  const reminderStrategy = item.reminderStrategy;
  const target = normalizeOptionalNumber(item.target);
  const reminderIntervalMinutes = normalizeOptionalInteger(item.reminderIntervalMinutes);
  const defaultLogValue = normalizeOptionalNumber(item.defaultLogValue);
  const reminderTimes = normalizeReminderTimes(item.reminderTimes);
  const reminderDays = normalizeReminderDays(item.reminderDays);

  if (!id || !name || !reason || !icon) return null;
  if (typeof color !== "string" || !COLORS.has(color)) return null;
  if (typeof habitType !== "string" || !HABIT_TYPES.has(habitType as HabitType)) return null;
  if (typeof metricType !== "string" || !METRIC_TYPES.has(metricType as MetricType)) return null;
  if (typeof visualType !== "string" || !VISUAL_TYPES.has(visualType as VisualType)) return null;
  if (
    typeof reminderStrategy !== "string" ||
    !REMINDER_STRATEGIES.has(reminderStrategy as ReminderStrategy)
  )
    return null;
  if (
    target === undefined ||
    reminderIntervalMinutes === undefined ||
    defaultLogValue === undefined
  )
    return null;
  if (!reminderTimes || !reminderDays) return null;
  if (typeof item.remindersEnabled !== "boolean") return null;

  const description = item.description == null ? null : cleanText(item.description, 160);
  if (item.description != null && !description) return null;

  return {
    id,
    name,
    description,
    reason,
    selected: typeof item.selected === "boolean" ? item.selected : true,
    icon,
    color: color as HabitRecommendation["color"],
    unit,
    target,
    remindersEnabled: item.remindersEnabled,
    reminderTimes,
    reminderDays,
    habitType: habitType as HabitType,
    metricType: metricType as MetricType,
    visualType: visualType as VisualType,
    reminderStrategy: reminderStrategy as ReminderStrategy,
    reminderIntervalMinutes,
    defaultLogValue,
    mergeSimilar: typeof item.mergeSimilar === "boolean" ? item.mergeSimilar : true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function normalizeOptionalNumber(value: unknown): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

function normalizeOptionalInteger(value: unknown): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function normalizeReminderTimes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const times = value.filter((item): item is string => typeof item === "string");
  if (times.length !== value.length) return null;
  if (times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return null;
  return Array.from(new Set(times)).sort();
}

function normalizeReminderDays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const days = value.filter((item): item is number => Number.isInteger(item));
  if (days.length !== value.length) return null;
  if (days.some((day) => day < 0 || day > 6)) return null;
  return Array.from(new Set(days)).sort();
}
