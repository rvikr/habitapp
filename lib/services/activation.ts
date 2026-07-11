import { supabase } from "../supabase/client";
import {
  assignActivationVariant,
  resolveActivationStage,
  resolveStageWithOptimisticMarker,
  type ActivationStage,
  type FeatureFlagAssignment,
} from "../activation/contracts";
import { getFeatureFlagConfig } from "./feature-flags";
import { optimisticFirstLogStore } from "./activation-marker";
import { completionQueueStore } from "./completion-queue-store";

export type ActivationSnapshot = {
  assignment: FeatureFlagAssignment;
  stage: ActivationStage;
  authoritative: boolean;
};

export async function getActivationAssignment(
  userId: string,
  options?: { forceConfig?: boolean },
): Promise<FeatureFlagAssignment> {
  const config = await getFeatureFlagConfig(
    "activation_v2",
    {
      enabled: false,
      rolloutPercentage: 0,
    },
    { force: options?.forceConfig },
  );
  return assignActivationVariant(userId, config);
}

async function readActivationStage(userId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("first_habit_logged_at, activation_engaged_at")
      .eq("user_id", userId)
      .maybeSingle();
    return resolveActivationStage(data, error);
  } catch (error) {
    return resolveActivationStage(null, error);
  }
}

export async function loadActivationSnapshot(
  userId: string,
  options?: { forceConfig?: boolean; reconcile?: boolean },
): Promise<ActivationSnapshot> {
  const assignment = await getActivationAssignment(userId, options);
  const remotePromise = readActivationStage(userId);
  const [remote, hasMarker] = await Promise.all([
    remotePromise,
    optimisticFirstLogStore.has(userId),
  ]);
  const shouldVerifyPendingPositive =
    !options?.reconcile && remote.authoritative && remote.stage === "pre_value" && hasMarker;
  const hasPendingPositive = shouldVerifyPendingPositive
    ? await completionQueueStore.hasPendingPositive(userId).catch(() => false)
    : false;
  const resolved = resolveStageWithOptimisticMarker({
    remote,
    hasMarker,
    hasPendingPositive,
    reconcile: options?.reconcile ?? false,
  });
  if (resolved.clearMarker) await optimisticFirstLogStore.clear(userId);
  return {
    assignment,
    stage: resolved.stage,
    authoritative: remote.authoritative && resolved.stage === remote.stage,
  };
}
