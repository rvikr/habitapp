import type { HabitType, MetricType, ReminderStrategy, VisualType } from "./habit-intelligence";

export type RoutineWizardAnswers = {
  goals: string[];
  lifestyle: "office" | "student" | "active" | "home" | "mixed";
  sleep: "poor" | "okay" | "good";
  workload: "low" | "normal" | "high";
  stress: "low" | "medium" | "high";
  fitnessLevel: "beginner" | "intermediate" | "advanced";
  // Optional body metrics used to size quantity targets (water, steps). Null
  // when the user skips them; all target math falls back to fitness-based
  // defaults so the routine never depends on these being present.
  age?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  // Optional current-behavior baselines. Targets ramp up from where the user
  // already is (progressive) rather than dropping an ideal on day one.
  stepsBaseline?: ActivityBaseline | null;
  waterBaseline?: ActivityBaseline | null;
};

export type ActivityBaseline = "low" | "some" | "moderate" | "high";

export type HabitRecommendation = {
  id: string;
  reason: string;
  selected: boolean;
  name: string;
  description: string | null;
  icon: string;
  color: "primary" | "secondary" | "tertiary" | "neutral";
  unit: string;
  target: number | null;
  remindersEnabled: boolean;
  reminderTimes: string[];
  reminderDays: number[];
  habitType: HabitType;
  metricType: MetricType;
  visualType: VisualType;
  reminderStrategy: ReminderStrategy;
  reminderIntervalMinutes: number | null;
  defaultLogValue: number | null;
  mergeSimilar: boolean;
};

type RecommendationTemplate = Omit<HabitRecommendation, "selected" | "mergeSimilar">;

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const MAX_RECOMMENDATIONS = 5;

const TEMPLATES: Record<string, RecommendationTemplate> = {
  water: {
    id: "water",
    name: "Drink Water",
    description: "Stay hydrated during your day.",
    reason: "Hydration is a small win that supports energy and focus.",
    icon: "water_drop",
    color: "secondary",
    unit: "ml",
    target: 2000,
    remindersEnabled: true,
    reminderTimes: [],
    reminderDays: EVERY_DAY,
    habitType: "water_intake",
    metricType: "volume_ml",
    visualType: "water_bottle",
    reminderStrategy: "interval",
    reminderIntervalMinutes: 120,
    defaultLogValue: 250,
  },
  posture: {
    id: "posture",
    name: "Posture Stretch",
    description: "Reset your shoulders, neck, and back.",
    reason: "Short posture breaks balance long sitting blocks without needing workout time.",
    icon: "sports_gymnastics",
    color: "secondary",
    unit: "min",
    target: 5,
    remindersEnabled: true,
    reminderTimes: ["11:00", "16:00"],
    reminderDays: EVERY_DAY,
    habitType: "stretch",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 5,
  },
  walk: {
    id: "walk",
    name: "Walk",
    description: "Take a brisk walk or add steps throughout the day.",
    reason: "Walking is the gentlest way to add movement without overloading your routine.",
    icon: "directions_walk",
    color: "tertiary",
    unit: "steps",
    target: 6000,
    remindersEnabled: true,
    reminderTimes: [],
    reminderDays: EVERY_DAY,
    habitType: "walk",
    metricType: "steps",
    visualType: "step_path",
    reminderStrategy: "conditional_interval",
    reminderIntervalMinutes: 60,
    defaultLogValue: 1000,
  },
  sleep: {
    id: "sleep",
    name: "Sleep 8 hours",
    description: "Protect a consistent sleep window.",
    reason: "Better sleep makes every other habit easier to keep.",
    icon: "bedtime",
    color: "primary",
    unit: "hr",
    target: 8,
    remindersEnabled: true,
    reminderTimes: ["22:30"],
    reminderDays: EVERY_DAY,
    habitType: "sleep",
    metricType: "hours",
    visualType: "sleep_moon",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 1,
  },
  focus: {
    id: "focus",
    name: "Focus Session",
    description: "Do one distraction-free work block.",
    reason: "A single focused block builds momentum without making the day feel crowded.",
    icon: "timer",
    color: "primary",
    unit: "min",
    target: 25,
    remindersEnabled: true,
    reminderTimes: ["10:00"],
    reminderDays: EVERY_DAY,
    habitType: "custom",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 25,
  },
  revision: {
    id: "revision",
    name: "Revision Block",
    description: "Review notes while the material is still fresh.",
    reason: "Small revision blocks turn studying into a repeatable daily rhythm.",
    icon: "edit_note",
    color: "secondary",
    unit: "min",
    target: 30,
    remindersEnabled: true,
    reminderTimes: ["18:00"],
    reminderDays: EVERY_DAY,
    habitType: "custom",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 15,
  },
  read: {
    id: "read",
    name: "Read",
    description: "Read a few useful pages every day.",
    reason: "Reading keeps learning visible even on busy days.",
    icon: "menu_book",
    color: "primary",
    unit: "pages",
    target: 10,
    remindersEnabled: true,
    reminderTimes: ["21:00"],
    reminderDays: EVERY_DAY,
    habitType: "read",
    metricType: "pages",
    visualType: "reading_book",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 5,
  },
  screenLimit: {
    id: "screen-limit",
    name: "Screen Limit",
    description: "Keep social scrolling out of your study or wind-down time.",
    reason: "A simple screen boundary protects attention and sleep.",
    icon: "do_not_disturb_on",
    color: "neutral",
    unit: "",
    target: null,
    remindersEnabled: false,
    reminderTimes: [],
    reminderDays: EVERY_DAY,
    habitType: "no_social_media",
    metricType: "boolean",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: null,
  },
  meditate: {
    id: "meditate",
    name: "Meditate",
    description: "Take a short reset for your mind.",
    reason: "Stress is easier to manage when calm is scheduled before the day spills over.",
    icon: "self_improvement",
    color: "secondary",
    unit: "min",
    target: 10,
    remindersEnabled: true,
    reminderTimes: ["07:30"],
    reminderDays: EVERY_DAY,
    habitType: "meditate",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 5,
  },
  workout: {
    id: "workout",
    name: "Workout",
    description: "Do a manageable strength or mobility session.",
    reason: "A realistic workout target builds confidence before intensity.",
    icon: "fitness_center",
    color: "tertiary",
    unit: "min",
    target: 20,
    remindersEnabled: true,
    reminderTimes: ["07:00"],
    reminderDays: EVERY_DAY,
    habitType: "workout",
    metricType: "minutes",
    visualType: "progress_ring",
    reminderStrategy: "manual",
    reminderIntervalMinutes: null,
    defaultLogValue: 10,
  },
};

export function buildRoutineRecommendations(answers: RoutineWizardAnswers): HabitRecommendation[] {
  const picked: RecommendationTemplate[] = [];

  function add(template: RecommendationTemplate) {
    if (picked.length >= MAX_RECOMMENDATIONS) return;
    if (
      picked.some(
        (item) =>
          item.id === template.id ||
          (item.habitType === template.habitType && template.habitType !== "custom"),
      )
    )
      return;
    picked.push(adjustForAnswers(template, answers));
  }

  if (answers.lifestyle === "office") {
    add(TEMPLATES.water);
    add(TEMPLATES.posture);
    add(TEMPLATES.walk);
    add(TEMPLATES.sleep);
  } else if (answers.lifestyle === "student") {
    add(TEMPLATES.focus);
    add(TEMPLATES.revision);
    add(TEMPLATES.read);
    add(TEMPLATES.screenLimit);
  } else if (answers.lifestyle === "active") {
    add(TEMPLATES.walk);
    add(TEMPLATES.workout);
    add(TEMPLATES.water);
  } else if (answers.lifestyle === "home") {
    add(TEMPLATES.water);
    add(TEMPLATES.walk);
    add(TEMPLATES.read);
  } else {
    add(TEMPLATES.water);
    add(TEMPLATES.focus);
    add(TEMPLATES.walk);
  }

  const goalText = answers.goals.map((goal) => goal.toLowerCase()).join(" ");
  if (/\b(focus|productivity|work|study)\b/.test(goalText)) add(TEMPLATES.focus);
  if (/\b(learn|learning|read|study)\b/.test(goalText)) {
    add(TEMPLATES.revision);
    add(TEMPLATES.read);
  }
  if (/\b(fitness|health|move|movement|energy)\b/.test(goalText)) {
    add(TEMPLATES.walk);
    add(TEMPLATES.workout);
  }
  if (/\b(stress|calm|mindful|mental)\b/.test(goalText) || answers.stress === "high")
    add(TEMPLATES.meditate);
  if (answers.sleep === "poor") add(TEMPLATES.sleep);
  if (answers.workload === "high" && answers.lifestyle !== "student") add(TEMPLATES.posture);

  if (picked.length < 3) {
    add(TEMPLATES.water);
    add(TEMPLATES.walk);
    add(TEMPLATES.sleep);
  }

  return picked.slice(0, MAX_RECOMMENDATIONS).map((item) => ({
    ...item,
    selected: true,
    mergeSimilar: true,
  }));
}

function clampRound(value: number, step: number, min: number, max: number): number {
  const rounded = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, rounded));
}

// Approximate current daily volume each baseline bucket represents, so a target
// can ramp up from where the user already is rather than from zero.
const STEP_BASELINE_STEPS: Record<ActivityBaseline, number> = {
  low: 2500,
  some: 4000,
  moderate: 6500,
  high: 9000,
};
// 1 glass ≈ 250 ml.
const WATER_BASELINE_ML: Record<ActivityBaseline, number> = {
  low: 500,
  some: 1000,
  moderate: 1750,
  high: 2250,
};

// Progressive goal: if we know where the user is, start one achievable step
// above it (capped at the ideal) so the first target is reachable; if they are
// already at/above the ideal, keep their level instead of inflating it.
function progressiveTarget(
  baseline: number | null,
  ideal: number,
  stepUp: number,
  round: number,
  min: number,
  max: number,
): number {
  if (baseline == null) return clampRound(ideal, round, min, max);
  if (baseline >= ideal) return clampRound(baseline, round, min, max);
  return clampRound(Math.min(baseline + stepUp, ideal), round, min, max);
}

// Daily water "ideal": ~33 ml per kg of body weight (midpoint of the common
// 30–35 ml/kg guide; EFSA total-water AI is ~2.0–2.5 L). Falls back to 2 L when
// weight is unknown. Clamped to a sane daily range.
function waterIdealMl(weightKg: number | null): number {
  if (weightKg && weightKg > 0) return clampRound(weightKg * 33, 50, 1500, 4000);
  return 2000;
}

function waterTargetMl(answers: RoutineWizardAnswers): number {
  const ideal = waterIdealMl(answers.weightKg ?? null);
  const baseline = answers.waterBaseline ? WATER_BASELINE_ML[answers.waterBaseline] : null;
  return progressiveTarget(baseline, ideal, 500, 50, 1000, 4000);
}

// Daily step "ideal" ceiling. Paluch et al. 2022 (Lancet Public Health) found
// the all-cause-mortality benefit plateaus around 6–8k steps for adults 60+ and
// 8–10k for under-60s — so the ceiling is age-aware, then tiered by fitness.
function stepIdeal(fitnessLevel: RoutineWizardAnswers["fitnessLevel"], age: number | null): number {
  const older = age != null && age >= 60;
  const base = older
    ? fitnessLevel === "beginner"
      ? 6000
      : fitnessLevel === "intermediate"
        ? 7000
        : 8000
    : fitnessLevel === "beginner"
      ? 8000
      : fitnessLevel === "intermediate"
        ? 9000
        : 10000;
  const scaled = age != null && age >= 75 ? base * 0.85 : base;
  return clampRound(scaled, 500, 3000, 12000);
}

function stepTarget(answers: RoutineWizardAnswers): number {
  const ideal = stepIdeal(answers.fitnessLevel, answers.age ?? null);
  const baseline = answers.stepsBaseline ? STEP_BASELINE_STEPS[answers.stepsBaseline] : null;
  if (baseline != null) return progressiveTarget(baseline, ideal, 1500, 500, 3000, 12000);
  // No baseline: keep the first goal gentle (close to the previous defaults),
  // capped by the age-aware ideal so older users never get a 10k starting goal.
  const gentle =
    answers.fitnessLevel === "beginner"
      ? 5000
      : answers.fitnessLevel === "intermediate"
        ? 7000
        : 9000;
  return clampRound(Math.min(gentle, ideal), 500, 3000, 12000);
}

// Recommended sleep duration by age band (National Sleep Foundation): teens
// 8–10h, adults 7–9h, older adults 7–8h. Defaults to 8h when age is unknown.
function sleepTargetHours(age: number | null): number {
  if (age == null) return 8;
  if (age < 18) return 9;
  if (age >= 65) return 7.5;
  return 8;
}

function adjustForAnswers(
  template: RecommendationTemplate,
  answers: RoutineWizardAnswers,
): RecommendationTemplate {
  const next = {
    ...template,
    reminderTimes: [...template.reminderTimes],
    reminderDays: [...template.reminderDays],
  };
  const age = answers.age ?? null;
  const personalizedWater = (answers.weightKg ?? null) != null || answers.waterBaseline != null;
  const personalizedSteps = age != null || answers.stepsBaseline != null;

  if (next.id === "water") {
    next.target = waterTargetMl(answers);
    if (personalizedWater) {
      next.reason =
        "Sized to your body and current intake — we build up gradually, not all at once.";
    }
  }
  if (next.id === "walk") {
    next.target = stepTarget(answers);
    if (personalizedSteps) {
      next.reason =
        "Matched to your age and current activity, not a generic 10k — easy to grow over time.";
    }
  }
  if (next.id === "sleep") {
    next.target = sleepTargetHours(age);
    if (answers.sleep === "good") {
      next.name = "Keep Sleep Consistent";
      next.description = "Protect the sleep rhythm that is already working.";
    }
  }
  if (next.id === "workout") {
    next.target =
      answers.fitnessLevel === "beginner" ? 15 : answers.fitnessLevel === "intermediate" ? 30 : 45;
    next.defaultLogValue = answers.fitnessLevel === "beginner" ? 5 : 15;
  }
  if (next.id === "focus" && answers.workload === "high") {
    next.target = 45;
    next.defaultLogValue = 25;
  }
  if (next.id === "meditate" && answers.stress === "high") {
    next.target = 5;
    next.description = "Take one short reset when stress is high.";
  }
  return next;
}
