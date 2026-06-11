import { getItem, setItem } from "../platform/storage";

// Persisted per user so a shared device can't leak one account's onboarding
// state into another's.
const ONBOARDING_COMPLETE_PREFIX = "habbit:onboarding-complete:";

export function onboardingCompleteKey(userId: string): string {
  return `${ONBOARDING_COMPLETE_PREFIX}${userId}`;
}

export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    return (await getItem(onboardingCompleteKey(userId))) === "1";
  } catch {
    // A storage failure must never force a user back into onboarding.
    return true;
  }
}

export async function markOnboardingComplete(userId: string): Promise<void> {
  try {
    await setItem(onboardingCompleteKey(userId), "1");
  } catch {
    // Best effort — the dashboard re-marks it whenever habits are present.
  }
}
