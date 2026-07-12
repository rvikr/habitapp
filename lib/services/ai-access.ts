import { getCurrentUser, isSupabaseConfigured, supabase } from "../supabase/client";
import { getAiSuggestionsEnabled } from "./feature-flags";
import { bumpAiCacheEpoch } from "../coach/ai-cache-epoch";
import { clearDataCache } from "../data/cache";

export const AI_DISCLOSURE_VERSION = "2026-07-12";

export type AiAccessState =
  | "eligible"
  | "attestation_required"
  | "feature_disabled"
  | "provider_unconfirmed";

export type AiAccessProfile = {
  state: AiAccessState;
  attestedAt: string | null;
  disclosureVersion: string | null;
  timeZone: string;
};

export function hasCurrentAiAttestation(
  profile: Pick<AiAccessProfile, "attestedAt" | "disclosureVersion">,
): boolean {
  return Boolean(profile.attestedAt && profile.disclosureVersion === AI_DISCLOSURE_VERSION);
}

export async function getAiAccessProfile(): Promise<AiAccessProfile> {
  const fallback: AiAccessProfile = {
    state: "attestation_required",
    attestedAt: null,
    disclosureVersion: null,
    timeZone: resolvedTimeZone(),
  };
  if (!isSupabaseConfigured()) return { ...fallback, state: "feature_disabled" };
  const user = await getCurrentUser();
  if (!user) return fallback;

  const [{ data, error }, featureEnabled] = await Promise.all([
    supabase
      .from("profiles")
      .select("ai_adult_attested_at, ai_disclosure_version, time_zone")
      .eq("user_id", user.id)
      .maybeSingle(),
    getAiSuggestionsEnabled(),
  ]);
  if (error || !data) return fallback;
  const attestedAt = data.ai_adult_attested_at as string | null;
  const disclosureVersion = data.ai_disclosure_version as string | null;
  return {
    state: !featureEnabled
      ? "feature_disabled"
      : hasCurrentAiAttestation({ attestedAt, disclosureVersion })
        ? "eligible"
        : "attestation_required",
    attestedAt,
    disclosureVersion,
    timeZone: typeof data.time_zone === "string" ? data.time_zone : resolvedTimeZone(),
  };
}

export async function setAiAdultAttestation(attested: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_ai_access_attestation", {
    p_confirmed: attested,
    p_disclosure_version: AI_DISCLOSURE_VERSION,
  });
  if (error) throw error;
  const [storage, validation] = await Promise.all([
    import("../platform/storage"),
    import("../habits/validate-remote"),
  ]);
  await bumpAiCacheEpoch(storage);
  validation.clearHabitValidationRemoteState();
  clearDataCache();
  if (attested) await syncProfileTimeZone();
}

export async function syncProfileTimeZone(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await supabase.rpc("set_profile_time_zone", {
    p_time_zone: resolvedTimeZone(),
  });
  if (error) console.warn("Could not sync profile timezone", error.message);
}

export function aiAccessStateFromReason(reason: string | undefined): AiAccessState | null {
  if (reason === "ai_attestation_required") return "attestation_required";
  if (reason === "feature_disabled") return "feature_disabled";
  if (reason === "paid_service_unconfirmed") return "provider_unconfirmed";
  return null;
}

function resolvedTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
