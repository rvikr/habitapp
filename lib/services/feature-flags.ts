import { supabase, isSupabaseConfigured } from "../supabase/client";

const cache = new Map<string, { enabled: boolean; readAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getFeatureFlag(key: string, fallback = false): Promise<boolean> {
  if (!isSupabaseConfigured()) return fallback;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.readAt < CACHE_TTL_MS) return cached.enabled;

  const { data, error } = await supabase
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .maybeSingle();
  if (error) return fallback;

  const enabled = Boolean(data?.enabled);
  cache.set(key, { enabled, readAt: Date.now() });
  return enabled;
}

export function getAiSuggestionsEnabled(): Promise<boolean> {
  return getFeatureFlag("ai_suggestions", false);
}
