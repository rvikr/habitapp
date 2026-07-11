import {
  unassignedActivationAnalyticsContext,
  type ActivationAnalyticsContext,
} from "../activation/analytics.ts";
import type { ActivationStage, FeatureFlagAssignment } from "../activation/contracts.ts";

type AssignmentReader = (userId: string) => Promise<FeatureFlagAssignment>;

export async function resolveActivationAnalyticsContext(
  userId: string,
  stage: ActivationStage,
  platform: string,
  readAssignment?: AssignmentReader,
): Promise<ActivationAnalyticsContext> {
  if (!userId.trim()) return unassignedActivationAnalyticsContext(platform);
  try {
    const reader = readAssignment ?? (await import("./activation.ts")).getActivationAssignment;
    const assignment = await reader(userId);
    return {
      variant: assignment.variant,
      bucket: assignment.bucket,
      rolloutPercentage: assignment.rolloutPercentage,
      stage,
      platform,
    };
  } catch {
    return unassignedActivationAnalyticsContext(platform);
  }
}
