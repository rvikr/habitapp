import { supabase, isSupabaseConfigured, getCurrentUser } from "../supabase/client";
import { DATA_CACHE_PREFIX, clearDataCache, readThroughCache } from "./cache";

export type LeaderboardEntry = {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_style: string | null;
  avatar_seed: string | null;
  total_completions: number;
  total_xp: number;
  level: number;
  total_habits: number;
  last_completion_date: string | null;
  xp: number;
  streak: number;
  is_current_user: boolean;
};

export type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_style: string | null;
  avatar_seed: string | null;
};

export type LeaderboardPeriod = "week" | "month" | "all";

export type LeaderboardPosition = {
  rank: number;
  totalUsers: number;
  totalXp: number;
  percentileAhead: number | null;
};

type LeaderboardResponse = {
  entries?: LeaderboardEntry[];
  position?: LeaderboardPosition | null;
};

type DataFetchOptions = { force?: boolean };
const DATA_CACHE_TTL_MS = 30_000;

async function invokeLeaderboard(body: {
  period?: LeaderboardPeriod;
  limit?: number;
  includeEntries?: boolean;
  includePosition?: boolean;
}): Promise<LeaderboardResponse | null> {
  const { data, error } = await supabase.functions.invoke<LeaderboardResponse>("leaderboard", {
    body,
  });
  if (error) return null;
  return data ?? null;
}

// Top N users by total XP. Only includes users who opted in (display_name is not null).
export async function getLeaderboard(
  limit = 50,
  options?: DataFetchOptions,
  period: LeaderboardPeriod = "all",
): Promise<LeaderboardEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  return readThroughCache(
    `${DATA_CACHE_PREFIX}leaderboard:${user.id}:${period}:${limit}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const data = await invokeLeaderboard({ period, limit, includeEntries: true });
      return data?.entries ?? [];
    },
    options,
  );
}

// The current user's profile (display_name is null until they opt in).
export async function getMyProfile(options?: DataFetchOptions): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;
  const user = await getCurrentUser();
  if (!user) return null;

  return readThroughCache(
    `${DATA_CACHE_PREFIX}leaderboard-profile:${user.id}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_style, avatar_seed")
        .eq("user_id", user.id)
        .single();
      return (data ?? null) as Profile | null;
    },
    options,
  );
}

// Opt in (or change name) by setting a display_name. Pass null to opt out.
export async function setDisplayName(
  displayName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in" };
  // Use the user's avatar metadata so the leaderboard avatars match the in-app avatar.
  const avatarStyle = (user.user_metadata?.avatar_style as string | undefined) ?? "avataaars";
  const avatarSeed =
    (user.user_metadata?.avatar_seed as string | undefined) ?? user.id.slice(0, 12);
  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    display_name: displayName,
    avatar_style: avatarStyle,
    avatar_seed: avatarSeed,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  clearDataCache();
  return { ok: true };
}

export async function getMyLeaderboardPosition(
  options?: DataFetchOptions,
  period: LeaderboardPeriod = "all",
): Promise<LeaderboardPosition | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  return readThroughCache(
    `${DATA_CACHE_PREFIX}leaderboard-position:${user.id}:${period}`,
    DATA_CACHE_TTL_MS,
    async () => {
      const data = await invokeLeaderboard({
        period,
        includeEntries: false,
        includePosition: true,
      });
      return data?.position ?? null;
    },
    options,
  );
}

// Find current user's rank (1-indexed). Returns null if not opted in.
export async function getMyRank(options?: DataFetchOptions): Promise<number | null> {
  const position = await getMyLeaderboardPosition(options);
  return position?.rank ?? null;
}
