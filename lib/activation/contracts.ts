export type ActivationVariant = "control" | "activation_v2";
export type ActivationStage = "pre_value" | "first_log" | "engaged";

export type FeatureFlagConfig = {
  enabled: boolean;
  rolloutPercentage: number;
};

export type FeatureFlagAssignment = {
  variant: ActivationVariant;
  bucket: number;
  rolloutPercentage: number;
};

export type ActivationMilestones = {
  first_habit_logged_at: string | null;
  activation_engaged_at: string | null;
};

export type ActivationStageRead = {
  stage: ActivationStage;
  authoritative: boolean;
};

function normalizeRolloutPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.trunc(value)));
}

export function activationBucket(userId: string): number {
  const input = `activation_v2:${userId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function assignActivationVariant(
  userId: string,
  config: FeatureFlagConfig,
): FeatureFlagAssignment {
  const bucket = activationBucket(userId);
  const rolloutPercentage = normalizeRolloutPercentage(config.rolloutPercentage);
  return {
    variant: config.enabled && bucket < rolloutPercentage ? "activation_v2" : "control",
    bucket,
    rolloutPercentage,
  };
}

export function resolveActivationStage(
  milestones: ActivationMilestones | null,
  error: unknown,
): ActivationStageRead {
  if (error || !milestones) return { stage: "engaged", authoritative: false };
  if (milestones.activation_engaged_at) return { stage: "engaged", authoritative: true };
  if (milestones.first_habit_logged_at) return { stage: "first_log", authoritative: true };
  return { stage: "pre_value", authoritative: true };
}

export function resolveStageWithOptimisticMarker({
  remote,
  hasMarker,
  reconcile,
}: {
  remote: ActivationStageRead;
  hasMarker: boolean;
  reconcile: boolean;
}): { stage: ActivationStage; clearMarker: boolean } {
  if (!remote.authoritative) return { stage: "engaged", clearMarker: false };
  if (remote.stage !== "pre_value") return { stage: remote.stage, clearMarker: hasMarker };
  if (reconcile) return { stage: "pre_value", clearMarker: hasMarker };
  return { stage: hasMarker ? "first_log" : "pre_value", clearMarker: false };
}
