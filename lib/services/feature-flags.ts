import { supabase, isSupabaseConfigured } from "../supabase/client";
import { createFeatureFlagConfigCache } from "../activation/flag-config-cache";
import type { FeatureFlagConfig } from "../activation/contracts";

export type { FeatureFlagConfig } from "../activation/contracts";

export const FEATURE_FLAG_CACHE_TTL_MS = 5 * 60 * 1000;

const configCache = createFeatureFlagConfigCache({
  ttlMs: FEATURE_FLAG_CACHE_TTL_MS,
  async load(key) {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("enabled, rollout_percentage")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Feature flag not found: ${key}`);

    const rawPercentage = Number(data.rollout_percentage);
    return {
      enabled: Boolean(data.enabled),
      rolloutPercentage: Number.isFinite(rawPercentage)
        ? Math.max(0, Math.min(100, Math.trunc(rawPercentage)))
        : 0,
    };
  },
});

export async function getFeatureFlagConfig(
  key: string,
  fallback: FeatureFlagConfig = { enabled: false, rolloutPercentage: 0 },
  options?: { force?: boolean },
): Promise<FeatureFlagConfig> {
  if (!isSupabaseConfigured()) return fallback;
  return configCache.get(key, fallback, options);
}

export async function getFeatureFlag(key: string, fallback = false): Promise<boolean> {
  const config = await getFeatureFlagConfig(key, {
    enabled: fallback,
    rolloutPercentage: fallback ? 100 : 0,
  });
  return config.enabled;
}

export function getAiSuggestionsEnabled(): Promise<boolean> {
  return getFeatureFlag("ai_suggestions", false);
}
