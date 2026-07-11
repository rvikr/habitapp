import type { FeatureFlagAssignment, ActivationStage } from "./contracts.ts";
import { createFirstLogAnalyticsGate, type ActivationAnalyticsContext } from "./analytics.ts";

export type FirstLogAnalyticsSignal = {
  context: ActivationAnalyticsContext;
  queued: boolean;
};

type LoadedAnalyticsSignals = {
  entryContext: ActivationAnalyticsContext | null;
  firstLog: FirstLogAnalyticsSignal | null;
};

type AuthGeneration = {
  userId: string | null;
  generation: number;
  context: ActivationAnalyticsContext | null;
  stageKnown: boolean;
  entryEmitted: boolean;
  pendingCompletion: { queued: boolean } | null;
};

/**
 * Keeps analytics tied to the same monotonic activation transition as the UI,
 * while remaining independent from React scheduling and async snapshot loads.
 */
export function createActivationAnalyticsLifecycle(platform: string) {
  const firstLogGate = createFirstLogAnalyticsGate();
  let auth: AuthGeneration = {
    userId: null,
    generation: 0,
    context: null,
    stageKnown: false,
    entryEmitted: false,
    pendingCompletion: null,
  };

  function authChanged(userId: string | null, generation: number): void {
    if (auth.userId === userId && auth.generation === generation) return;
    auth = {
      userId,
      generation,
      context: null,
      stageKnown: false,
      entryEmitted: false,
      pendingCompletion: null,
    };
  }

  function firstLogSignal(queued: boolean): FirstLogAnalyticsSignal | null {
    if (!auth.userId || !auth.context || !firstLogGate.positiveCompletion(auth.userId)) {
      return null;
    }
    const context: ActivationAnalyticsContext = { ...auth.context, stage: "first_log" };
    auth.context = context;
    return { context, queued };
  }

  function loaded(
    userId: string,
    generation: number,
    assignment: FeatureFlagAssignment,
    stage: ActivationStage,
    authoritative: boolean,
  ): LoadedAnalyticsSignals {
    if (auth.userId !== userId || auth.generation !== generation) {
      return { entryContext: null, firstLog: null };
    }

    auth.context = {
      variant: assignment.variant,
      bucket: assignment.bucket,
      rolloutPercentage: assignment.rolloutPercentage,
      stage,
      platform,
    };
    const pending = auth.pendingCompletion;
    const unknownFailOpen = stage === "engaged" && !authoritative;
    if (unknownFailOpen) {
      const entryContext = auth.entryEmitted ? null : auth.context;
      auth.entryEmitted = true;
      return { entryContext, firstLog: null };
    }

    auth.stageKnown = true;
    auth.pendingCompletion = null;
    // A completion can mark local activation before the initial snapshot
    // resolves. In that case the snapshot legitimately reports optimistic
    // first_log; the pending event is the transition and still owns analytics.
    firstLogGate.sync(userId, pending && stage === "first_log" ? "pre_value" : stage);
    const firstLog = pending ? firstLogSignal(pending.queued) : null;
    const entryContext = auth.entryEmitted ? null : auth.context;
    auth.entryEmitted = true;
    return { entryContext, firstLog };
  }

  function positiveCompletion(userId: string, queued: boolean): FirstLogAnalyticsSignal | null {
    if (auth.userId !== userId) return null;
    if (!auth.context || !auth.stageKnown) {
      auth.pendingCompletion ??= { queued };
      return null;
    }
    return firstLogSignal(queued);
  }

  return { authChanged, loaded, positiveCompletion };
}
