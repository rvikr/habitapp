import type { QuickStartConstraint } from "../activation/contracts";
import type { MetricType } from "./habit-intelligence";
import {
  buildRoutineTemplateRecommendation,
  type HabitRecommendation,
  type RoutineTemplateId,
  type RoutineWizardAnswers,
} from "./routine-builder.ts";

export type QuickStartGoal = "energy" | "focus" | "fitness" | "sleep" | "stress" | "learning";

export type TreatmentQuickStartAnswers = Omit<RoutineWizardAnswers, "goals"> & {
  goals: [QuickStartGoal];
  constraint: QuickStartConstraint;
};

export const QUICK_START_CONSTRAINT_PRIORITIES: Record<QuickStartConstraint, RoutineTemplateId[]> =
  {
    time: ["posture", "meditate", "water"],
    energy: ["water", "walk", "sleep"],
    stress: ["meditate", "walk", "sleep"],
    sleep: ["sleep", "screen-limit", "meditate"],
    consistency: ["water", "walk", "read"],
  };

export const QUICK_START_GOAL_PRIORITIES: Record<QuickStartGoal, RoutineTemplateId[]> = {
  energy: ["water", "walk", "sleep"],
  focus: ["focus", "posture", "meditate"],
  fitness: ["walk", "workout", "water"],
  sleep: ["sleep", "screen-limit", "meditate"],
  stress: ["meditate", "walk", "sleep"],
  learning: ["read", "revision", "focus"],
};

export const QUICK_START_CONTEXT_PRIORITIES: Record<
  RoutineWizardAnswers["lifestyle"],
  RoutineTemplateId[]
> = {
  office: ["posture", "water", "walk"],
  student: ["focus", "read", "screen-limit"],
  active: ["walk", "workout", "water"],
  home: ["water", "walk", "read"],
  mixed: ["water", "walk", "meditate"],
};

type CappedQuickStartConstraint = Exclude<QuickStartConstraint, "sleep">;

export const QUICK_START_TARGET_CAPS: Record<
  CappedQuickStartConstraint,
  Partial<Record<MetricType, number>>
> = {
  time: {
    volume_ml: 1500,
    steps: 4000,
    hours: 8,
    pages: 5,
    minutes: 10,
    distance_km: 2,
  },
  energy: {
    volume_ml: 2000,
    steps: 5000,
    hours: 8,
    pages: 5,
    minutes: 15,
    distance_km: 3,
  },
  stress: {
    volume_ml: 2000,
    steps: 5000,
    hours: 8,
    pages: 5,
    minutes: 10,
    distance_km: 3,
  },
  consistency: {
    volume_ml: 1500,
    steps: 4000,
    hours: 8,
    pages: 5,
    minutes: 10,
    distance_km: 2,
  },
};

const FALLBACK_PRIORITIES: RoutineTemplateId[] = ["water", "walk", "sleep", "meditate", "read"];
const MAX_TREATMENT_RECOMMENDATIONS = 5;

export function applyQuickStartConstraint(
  answers: RoutineWizardAnswers,
  constraint: QuickStartConstraint,
): RoutineWizardAnswers {
  if (constraint === "time") return { ...answers, workload: "high" };
  if (constraint === "stress") return { ...answers, stress: "high" };
  if (constraint === "sleep") return { ...answers, sleep: "poor" };
  return answers;
}

export function buildTreatmentRecommendations(
  answers: TreatmentQuickStartAnswers,
): HabitRecommendation[] {
  const adjustedAnswers = applyQuickStartConstraint(answers, answers.constraint);
  const goal = answers.goals[0];
  const priorities = [
    ...(QUICK_START_GOAL_PRIORITIES[goal] ?? []),
    ...QUICK_START_CONSTRAINT_PRIORITIES[answers.constraint],
    ...QUICK_START_CONTEXT_PRIORITIES[answers.lifestyle],
  ];
  const recommendations: HabitRecommendation[] = [];

  function addPriorities(ids: readonly RoutineTemplateId[]) {
    for (const id of ids) {
      if (recommendations.length >= MAX_TREATMENT_RECOMMENDATIONS) break;
      const candidate = buildRoutineTemplateRecommendation(id, adjustedAnswers);
      if (recommendations.some((item) => isSemanticDuplicate(item, candidate))) continue;
      recommendations.push(candidate);
    }
  }

  addPriorities(priorities);
  if (recommendations.length < 3) addPriorities(FALLBACK_PRIORITIES);

  return selectFirstTwo(applyTreatmentConstraintCaps(recommendations, answers.constraint));
}

export function getVisibleTreatmentRecommendations(
  recommendations: readonly HabitRecommendation[],
  showAdditionalSuggestions: boolean,
): HabitRecommendation[] {
  return showAdditionalSuggestions ? [...recommendations] : recommendations.slice(0, 2);
}

export function applyTreatmentConstraintCaps(
  recommendations: readonly HabitRecommendation[],
  constraint: QuickStartConstraint,
): HabitRecommendation[] {
  const caps = constraint === "sleep" ? undefined : QUICK_START_TARGET_CAPS[constraint];
  const capped = recommendations.map((item) => {
    const cap = caps?.[item.metricType];
    const target =
      item.target != null && item.target > 0 && cap != null
        ? Math.min(item.target, cap)
        : item.target;
    return { ...item, target };
  });
  return clampDefaultLogValuesToTargets(capped);
}

export function clampDefaultLogValuesToTargets(
  recommendations: readonly HabitRecommendation[],
): HabitRecommendation[] {
  return recommendations.map((item) => {
    const defaultLogValue =
      item.target != null &&
      item.target > 0 &&
      item.defaultLogValue != null &&
      item.defaultLogValue > item.target
        ? item.target
        : item.defaultLogValue;
    return { ...item, defaultLogValue };
  });
}

export function normalizeTreatmentRecommendations(
  recommendations: readonly HabitRecommendation[],
  fallback: readonly HabitRecommendation[],
  answers: TreatmentQuickStartAnswers,
): HabitRecommendation[] {
  const guaranteedFallback = buildTreatmentRecommendations(answers);
  const unique: HabitRecommendation[] = [];
  for (const candidate of [...recommendations, ...fallback, ...guaranteedFallback]) {
    if (unique.length >= MAX_TREATMENT_RECOMMENDATIONS) break;
    if (unique.some((item) => isSemanticDuplicate(item, candidate))) continue;
    unique.push({ ...candidate });
  }
  return selectFirstTwo(applyTreatmentConstraintCaps(unique, answers.constraint));
}

export function shouldApplyTreatmentAiResult({
  reviewActive,
  requestId,
  currentRequestId,
  interactionVersion,
  currentInteractionVersion,
}: {
  reviewActive: boolean;
  requestId: number;
  currentRequestId: number;
  interactionVersion: number;
  currentInteractionVersion: number;
}): boolean {
  return (
    reviewActive &&
    requestId === currentRequestId &&
    interactionVersion === currentInteractionVersion
  );
}

type CreateResultLike = { ok: boolean; id: string | null };

export type TreatmentCreateOutcome = {
  status: "signed_out" | "none_created" | "partially_created" | "all_created";
  successfulCount: number;
  totalCount: number;
  failedIndices: number[];
};

export function classifyTreatmentCreateOutcome(
  signedOut: boolean,
  results: readonly CreateResultLike[],
  totalCount: number,
): TreatmentCreateOutcome {
  if (signedOut) {
    return { status: "signed_out", successfulCount: 0, totalCount, failedIndices: [] };
  }
  const failedIndices: number[] = [];
  let successfulCount = 0;
  for (let index = 0; index < totalCount; index += 1) {
    const result = results[index];
    if (result?.ok && result.id) successfulCount += 1;
    else failedIndices.push(index);
  }
  return {
    status:
      successfulCount === 0
        ? "none_created"
        : successfulCount === totalCount
          ? "all_created"
          : "partially_created",
    successfulCount,
    totalCount,
    failedIndices,
  };
}

function selectFirstTwo(recommendations: readonly HabitRecommendation[]): HabitRecommendation[] {
  return recommendations.map((item, index) => ({ ...item, selected: index < 2 }));
}

function isSemanticDuplicate(
  existing: HabitRecommendation,
  candidate: HabitRecommendation,
): boolean {
  return (
    existing.id === candidate.id ||
    (existing.habitType === candidate.habitType &&
      (candidate.habitType !== "custom" ||
        normalizeRecommendationName(existing.name) === normalizeRecommendationName(candidate.name)))
  );
}

function normalizeRecommendationName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}
