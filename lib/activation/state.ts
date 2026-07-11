import {
  activationBucket,
  type ActivationStage,
  type ActivationVariant,
  type FeatureFlagAssignment,
} from "./contracts.ts";

export type ActivationProviderState = {
  ready: boolean;
  variant: ActivationVariant;
  stage: ActivationStage;
  bucket: number;
  userId: string | null;
  generation: number;
  pendingOptimisticFirstLog: boolean;
};

export type ActivationStateAction =
  | { type: "auth_changed"; userId: string | null }
  | {
      type: "loaded";
      userId: string;
      generation: number;
      assignment: FeatureFlagAssignment;
      stage: ActivationStage;
    }
  | { type: "optimistic_first_log"; userId: string };

export const initialActivationProviderState: ActivationProviderState = {
  ready: false,
  variant: "control",
  stage: "engaged",
  bucket: 0,
  userId: null,
  generation: 0,
  pendingOptimisticFirstLog: false,
};

export function activationStateReducer(
  state: ActivationProviderState,
  action: ActivationStateAction,
): ActivationProviderState {
  if (action.type === "auth_changed") {
    if (action.userId === state.userId) {
      if (action.userId === null && !state.ready) return { ...state, ready: true };
      return state;
    }
    return {
      ready: action.userId === null,
      variant: "control",
      stage: "engaged",
      bucket: action.userId ? activationBucket(action.userId) : 0,
      userId: action.userId,
      generation: state.generation + 1,
      pendingOptimisticFirstLog: false,
    };
  }

  if (action.type === "loaded") {
    if (action.userId !== state.userId || action.generation !== state.generation) return state;
    const preserveEngaged =
      state.ready &&
      state.variant === "activation_v2" &&
      state.stage === "engaged" &&
      action.assignment.variant === "activation_v2";
    const loadedStage =
      action.assignment.variant === "control"
        ? "engaged"
        : preserveEngaged
          ? "engaged"
          : state.pendingOptimisticFirstLog && action.stage === "pre_value"
            ? "first_log"
            : action.stage;
    return {
      ...state,
      ready: true,
      variant: action.assignment.variant,
      stage: loadedStage,
      bucket: action.assignment.bucket,
      pendingOptimisticFirstLog: false,
    };
  }

  if (action.userId !== state.userId) return state;
  if (!state.ready) return { ...state, pendingOptimisticFirstLog: true };
  if (state.variant !== "activation_v2" || state.stage !== "pre_value") return state;
  return { ...state, stage: "first_log" };
}
