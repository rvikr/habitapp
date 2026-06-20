const MAX_GOALS = 5;
const MAX_GOAL_LENGTH = 48;
const MAX_SERIALIZED_BYTES = 1024;

const ALLOWED_KEYS = new Set([
  "goals",
  "lifestyle",
  "sleep",
  "workload",
  "stress",
  "fitnessLevel",
  "age",
  "heightCm",
  "weightKg",
  "stepsBaseline",
  "waterBaseline",
]);

const LIFESTYLES = new Set(["office", "student", "active", "home", "mixed"]);
const SLEEP_LEVELS = new Set(["poor", "okay", "good"]);
const WORKLOAD_LEVELS = new Set(["low", "normal", "high"]);
const STRESS_LEVELS = new Set(["low", "medium", "high"]);
const FITNESS_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const ACTIVITY_BASELINES = new Set(["low", "some", "moderate", "high"]);

type SanitizedRoutineAnswers = {
  goals: string[];
  lifestyle: string;
  sleep: string;
  workload: string;
  stress: string;
  fitnessLevel: string;
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  stepsBaseline?: string | null;
  waterBaseline?: string | null;
};

export function sanitizeRoutineAnswers(value: unknown): SanitizedRoutineAnswers | null {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !ALLOWED_KEYS.has(key))) return null;

  const goals = sanitizeGoals(value.goals);
  const lifestyle = enumValue(value.lifestyle, LIFESTYLES);
  const sleep = enumValue(value.sleep, SLEEP_LEVELS);
  const workload = enumValue(value.workload, WORKLOAD_LEVELS);
  const stress = enumValue(value.stress, STRESS_LEVELS);
  const fitnessLevel = enumValue(value.fitnessLevel, FITNESS_LEVELS);
  if (!goals || !lifestyle || !sleep || !workload || !stress || !fitnessLevel) return null;

  const age = optionalNumber(value.age, 13, 100, true);
  const heightCm = optionalNumber(value.heightCm, 100, 250, true);
  const weightKg = optionalNumber(value.weightKg, 30, 250, false);
  const stepsBaseline = optionalEnum(value.stepsBaseline, ACTIVITY_BASELINES);
  const waterBaseline = optionalEnum(value.waterBaseline, ACTIVITY_BASELINES);
  if (
    age === undefined ||
    heightCm === undefined ||
    weightKg === undefined ||
    stepsBaseline === undefined ||
    waterBaseline === undefined
  ) {
    return null;
  }

  const sanitized: SanitizedRoutineAnswers = {
    goals,
    lifestyle,
    sleep,
    workload,
    stress,
    fitnessLevel,
  };
  if (hasOwn(value, "age")) sanitized.age = age;
  if (hasOwn(value, "heightCm")) sanitized.heightCm = heightCm;
  if (hasOwn(value, "weightKg")) sanitized.weightKg = weightKg;
  if (hasOwn(value, "stepsBaseline")) sanitized.stepsBaseline = stepsBaseline;
  if (hasOwn(value, "waterBaseline")) sanitized.waterBaseline = waterBaseline;

  return serializedByteLength(sanitized) <= MAX_SERIALIZED_BYTES ? sanitized : null;
}

function sanitizeGoals(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_GOALS) return null;
  const goals: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const goal = item.replace(/\s+/g, " ").trim();
    if (!goal || goal.length > MAX_GOAL_LENGTH) return null;
    const key = goal.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    goals.push(goal);
  }
  return goals.length > 0 ? goals : null;
}

function optionalNumber(
  value: unknown,
  min: number,
  max: number,
  integer: boolean,
): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (value < min || value > max) return undefined;
  return value;
}

function enumValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === "string" && allowed.has(value) ? value : null;
}

function optionalEnum(value: unknown, allowed: Set<string>): string | null | undefined {
  if (value == null) return null;
  return typeof value === "string" && allowed.has(value) ? value : undefined;
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
