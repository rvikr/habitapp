const MAX_CONTEXTS = 20;
const MAX_COMPLETIONS = 14;
const MAX_MANUAL_TIMES = 8;
const MAX_SERIALIZED_BYTES = 12_000;

const HABIT_TYPES = new Set([
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
const METRIC_TYPES = new Set(["volume_ml", "steps", "hours", "pages", "minutes", "distance_km", "boolean"]);
const REMINDER_STRATEGIES = new Set(["interval", "conditional_interval"]);
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type SanitizedSmartReminderProgress = {
  current: number;
  target: number | null;
  ratio: number;
  label: string;
};

type SanitizedSmartReminderCompletion = {
  completedOn: string;
  createdAt: string;
  value: number | null;
};

type SanitizedSmartReminderContext = {
  habitId: string;
  habitName: string;
  habitType: string;
  metricType: string;
  strategy: string;
  intervalMinutes: number | null;
  target: number | null;
  unit: string | null;
  progress: SanitizedSmartReminderProgress;
  completions: SanitizedSmartReminderCompletion[];
  manualTimes: string[];
  reminderDays: number[];
  streak: number | null;
  typicalHour: number | null;
  currentTime: string;
};

export function sanitizeSmartReminderContexts(
  input: unknown,
): SanitizedSmartReminderContext[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_CONTEXTS) return null;

  const contexts: SanitizedSmartReminderContext[] = [];
  for (const item of input) {
    const context = cleanContext(item);
    if (!context) return null;
    contexts.push(context);
  }

  return serializedByteLength(contexts) <= MAX_SERIALIZED_BYTES ? contexts : null;
}

function cleanContext(item: unknown): SanitizedSmartReminderContext | null {
  if (!isRecord(item)) return null;
  const habitId = cleanText(item.habitId, 64);
  const habitName = cleanText(item.habitName, 80);
  const habitType = enumValue(item.habitType, HABIT_TYPES);
  const metricType = enumValue(item.metricType, METRIC_TYPES);
  const strategy = enumValue(item.strategy, REMINDER_STRATEGIES);
  const currentTime = cleanTime(item.currentTime);
  const progress = cleanProgress(item.progress);
  if (!habitId || !habitName || !habitType || !metricType || !strategy || !currentTime || !progress) {
    return null;
  }

  return {
    habitId,
    habitName,
    habitType,
    metricType,
    strategy,
    intervalMinutes: cleanNumber(item.intervalMinutes, 1, 24 * 60, true),
    target: cleanNumber(item.target, 0, 1_000_000, false),
    unit: typeof item.unit === "string" ? item.unit.trim().slice(0, 16) || null : null,
    progress,
    completions: cleanCompletions(item.completions),
    manualTimes: cleanTimeArray(item.manualTimes),
    reminderDays: cleanReminderDays(item.reminderDays),
    streak: cleanNumber(item.streak, 0, 365, true),
    typicalHour: cleanNumber(item.typicalHour, 0, 23, true),
    currentTime,
  };
}

function cleanProgress(value: unknown): SanitizedSmartReminderProgress | null {
  if (!isRecord(value)) return null;
  const current = cleanNumber(value.current, 0, 1_000_000, false);
  const target = cleanNumber(value.target, 0, 1_000_000, false);
  const ratio = cleanNumber(value.ratio, 0, 1, false);
  const label = cleanText(value.label, 120);
  if (current == null || ratio == null || !label) return null;
  return { current, target, ratio, label };
}

function cleanCompletions(value: unknown): SanitizedSmartReminderCompletion[] {
  if (!Array.isArray(value)) return [];
  const completions: SanitizedSmartReminderCompletion[] = [];
  for (const item of value.slice(-MAX_COMPLETIONS)) {
    if (!isRecord(item)) continue;
    const completedOn = cleanDateKey(item.completedOn);
    const createdAt = cleanText(item.createdAt, 40);
    const completionValue = cleanNumber(item.value, 0, 1_000_000, false);
    if (!completedOn || !createdAt) continue;
    completions.push({ completedOn, createdAt, value: completionValue });
  }
  return completions;
}

function cleanTimeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const times: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const time = cleanTime(item);
    if (!time || seen.has(time)) continue;
    seen.add(time);
    times.push(time);
    if (times.length >= MAX_MANUAL_TIMES) break;
  }
  return times.sort();
}

function cleanReminderDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days: number[] = [];
  const seen = new Set<number>();
  for (const item of value) {
    if (!Number.isInteger(item) || item < 0 || item > 6 || seen.has(item)) continue;
    seen.add(item);
    days.push(item);
    if (days.length >= 7) break;
  }
  return days.sort((a, b) => a - b);
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) return null;
  return cleaned;
}

function cleanDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_KEY_PATTERN.test(value)) return null;
  return value;
}

function cleanTime(value: unknown): string | null {
  if (typeof value !== "string" || !TIME_PATTERN.test(value)) return null;
  return value;
}

function cleanNumber(
  value: unknown,
  min: number,
  max: number,
  integer: boolean,
): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (integer && !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function enumValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
