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
  authoritative: boolean;
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
      authoritative: boolean;
    }
  | { type: "optimistic_first_log"; userId: string };

export const initialActivationProviderState: ActivationProviderState = {
  ready: false,
  variant: "control",
  stage: "engaged",
  authoritative: false,
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
      authoritative: false,
      bucket: action.userId ? activationBucket(action.userId) : 0,
      userId: action.userId,
      generation: state.generation + 1,
      pendingOptimisticFirstLog: false,
    };
  }

  if (action.type === "loaded") {
    if (action.userId !== state.userId || action.generation !== state.generation) return state;
    const preserveKnownEngagement = state.ready && state.stage === "engaged" && state.authoritative;
    const preserveAuthoritativeEngaged = preserveKnownEngagement;
    const applyPendingOptimism = state.pendingOptimisticFirstLog && action.stage === "pre_value";
    const loadedStage = preserveAuthoritativeEngaged
      ? "engaged"
      : applyPendingOptimism
        ? "first_log"
        : action.stage;
    const authoritative = preserveAuthoritativeEngaged
      ? true
      : applyPendingOptimism
        ? false
        : action.authoritative;
    return {
      ...state,
      ready: true,
      variant: action.assignment.variant,
      stage: loadedStage,
      authoritative,
      bucket: action.assignment.bucket,
      pendingOptimisticFirstLog: false,
    };
  }

  if (action.userId !== state.userId) return state;
  if (!state.ready) return { ...state, pendingOptimisticFirstLog: true };
  if (state.stage !== "pre_value") return state;
  return { ...state, stage: "first_log", authoritative: false };
}
