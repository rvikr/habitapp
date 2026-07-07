import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getStats } from "@/lib/habits";
import ShareButton from "@/components/share-button";
import { getRankShareMessage } from "@/lib/share-messages";
import { XP_PER_LEVEL, levelForXp, xpForCompletions, xpInLevel } from "@/lib/xp";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Leaderboard",
  robots: { index: false, follow: false },
  openGraph: {
    images: [`${SITE_URL}/api/og/card?type=rank&rank=1&streak=30&pct=1`],
  },
};
export const dynamic = "force-dynamic";

type Period = "week" | "month" | "all";

interface LeaderboardEntry {
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
}

interface LeaderboardPosition {
  rank: number;
  totalUsers: number;
  totalXp: number;
  percentileAhead: number | null;
}

async function getLeaderboard(
  period: Period
): Promise<{
  entries: LeaderboardEntry[];
  position: LeaderboardPosition | null;
  debugError?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke<{
    entries?: LeaderboardEntry[];
    position?: LeaderboardPosition | null;
  }>("leaderboard", {
    body: {
      period,
      limit: 50,
      includeEntries: true,
      includePosition: true,
    },
  });
  if (error) {
    return {
      entries: [],
      position: null,
      debugError: `Leaderboard API error: ${error.message}`,
    };
  }
  return {
    entries: Array.isArray(data?.entries) ? data.entries : [],
    position: data?.position ?? null,
  };
}

const TABS: { label: string; period: Period }[] = [
  { label: "This Week", period: "week" },
  { label: "This Month", period: "month" },
  { label: "All Time", period: "all" },
];

function Avatar({
  name,
  size = "md",
  highlight = false,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  highlight?: boolean;
}) {
  const sz =
    size === "lg"
      ? "w-16 h-16 text-2xl"
      : size === "sm"
      ? "w-8 h-8 text-sm"
      : "w-10 h-10 text-base";
  return (
    <div
      className={`${sz} rounded-full flex items-center justify-center font-extrabold flex-shrink-0 ${
        highlight
          ? "bg-primary text-white ring-4 ring-primary/20"
          : "bg-primary-fixed/80 text-primary"
      }`}
    >
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period: Period =
    raw === "week" ? "week" : raw === "month" ? "month" : "all";

  const supabase = await createClient();
  const user = await getCurrentUser(supabase);
  if (!user) redirect("/login");

  const [stats, { entries: rawEntries, position, debugError }, { data: profile }] = await Promise.all([
    getStats(),
    getLeaderboard(period),
    supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
  ]);

  // Only show users who have opted in with a display name
  const board = rawEntries.filter((e) => e.display_name);
  const hasDisplayName = !!(profile?.display_name);

  const userXP = xpForCompletions(stats?.totalCompletions ?? 0);
  const userStreak = stats?.streak ?? 0;
  const userLevel = levelForXp(userXP);
  const levelXP = xpInLevel(userXP);
  const levelPct = Math.round((levelXP / XP_PER_LEVEL) * 100);

  const userEntry = board.find((e) => e.is_current_user);
  const userRank = position?.rank ?? userEntry?.rank ?? null;
  const nextEntry = userRank && userRank > 1 ? board[userRank - 2] : null;
  // Compare period-scoped XP on both sides — nextEntry.xp is for the selected
  // period, so the gap must use the user's period XP, not all-time userXP.
  const userPeriodXP = position?.totalXp ?? userEntry?.xp ?? userXP;
  const xpToNext = nextEntry ? nextEntry.xp - userPeriodXP : null;
  const topPct =
    position?.percentileAhead !== null && position?.percentileAhead !== undefined
      ? Math.max(1, 100 - position.percentileAhead)
      : userRank && board.length > 0
      ? Math.max(1, Math.ceil((userRank / board.length) * 100))
      : null;

  const top3 = board.slice(0, 3);
  const rankMsg = userRank
    ? getRankShareMessage({ rank: userRank, streak: userStreak, topPct })
    : null;
  const rankCardUrl = userRank
    ? `/api/og/card?type=rank&rank=${userRank}&streak=${userStreak}&pct=${topPct ?? 50}`
    : null;
  const rankShareText = rankMsg
    ? `${rankMsg.tagline}\n\nJoin me on Lagan — lagan.health/leaderboard`
    : "";

  // Podium order: 2nd, 1st, 3rd
  const podiumOrder = [top3[1], top3[0], top3[2]];
  const podiumStyles = [
    { height: "h-24", bg: "from-[#2C2C36] to-[#1F1F27]", label: "2nd", labelColor: "text-on-surface-variant", ring: "ring-outline-variant" },
    { height: "h-32", bg: "from-tertiary-fixed to-[#2A1A03]", label: "1st", labelColor: "text-on-tertiary-container", ring: "ring-on-tertiary-container/40" },
    { height: "h-16", bg: "from-[#2A1208] to-[#1F0D05]", label: "3rd", labelColor: "text-primary", ring: "ring-primary/40" },
  ];

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 sm:p-6 lg:p-8 xl:flex-row xl:gap-8">

      {/* ── Main leaderboard column ──────────────────────────── */}
      <div className="app-stagger flex-1 min-w-0 space-y-6">

        {/* Header */}
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight text-on-background">
            Leaderboard
          </h1>
          <p className="text-on-surface-variant text-base mt-1">
            Compete with the community. Keep your streak alive.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-surface-container p-1 sm:w-fit">
          {TABS.map(({ label, period: p }) => (
            <Link
              key={p}
              href={`/leaderboard?period=${p}`}
              className={`px-5 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                period === p
                  ? "bg-surface text-primary shadow-sm"
                  : "text-on-surface-variant hover:text-on-background"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Opt-in banner */}
        {!hasDisplayName && (
          <Link
            href="/settings"
            className="flex items-center gap-4 bg-primary/8 border border-primary/20 rounded-2xl px-5 py-4 hover:bg-primary/12 transition-colors group"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <span
                className="material-symbols-outlined text-primary text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                emoji_events
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-on-background text-sm">Join the global leaderboard</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Set a display name in Settings to appear on the board and compete with others.
              </p>
            </div>
            <span className="material-symbols-outlined text-primary text-xl group-hover:translate-x-0.5 transition-transform">
              arrow_forward
            </span>
          </Link>
        )}

        {board.length > 0 ? (
          <div className="space-y-6">

            {/* Podium — top 3 */}
            {top3.length >= 2 && (
              <div className="bg-surface rounded-3xl p-5 border border-outline-variant sm:p-8">
                <div className="flex items-end justify-center gap-4">
                  {podiumOrder.map((entry, podiumIdx) => {
                    if (!entry) return <div key={podiumIdx} className="flex-1" />;
                    const style = podiumStyles[podiumIdx];
                    const isCenter = podiumIdx === 1;
                    return (
                      <div
                        key={entry.user_id}
                        className="flex-1 flex flex-col items-center gap-2"
                      >
                        {/* Avatar */}
                        <div className={`relative ${isCenter ? "mb-1" : ""}`}>
                          <div
                            className={`${isCenter ? "w-16 h-16 text-2xl" : "w-12 h-12 text-lg"} rounded-full flex items-center justify-center font-extrabold ring-4 ${style.ring} ${
                              entry.is_current_user
                                ? "bg-primary text-white"
                                : "bg-primary-fixed/80 text-primary"
                            }`}
                          >
                            {entry.display_name?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          {isCenter && (
                            <span
                              className="absolute -top-2 -right-2 material-symbols-outlined text-on-tertiary-container text-xl drop-shadow"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              emoji_events
                            </span>
                          )}
                        </div>

                        {/* Name + XP */}
                        <p className={`font-bold text-on-background text-center truncate w-full ${isCenter ? "text-base" : "text-sm"}`}>
                          {entry.display_name}
                          {entry.is_current_user && (
                            <span className="block text-xs text-primary font-normal">you</span>
                          )}
                        </p>
                        <p className="text-xs font-semibold text-on-surface-variant">
                          {entry.xp.toLocaleString()} XP
                        </p>

                        {/* Podium block */}
                        <div
                          className={`w-full ${style.height} rounded-t-2xl bg-gradient-to-t ${style.bg} flex items-center justify-center`}
                        >
                          <span className={`font-extrabold text-lg ${style.labelColor}`}>
                            {style.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Full table */}
              <div className="overflow-x-auto rounded-3xl bg-surface border border-outline-variant">
                {/* Column headers */}
              <div className="grid min-w-[560px] grid-cols-[48px_1fr_80px_100px] gap-3 px-6 py-3 bg-surface-container-high border-b border-outline-variant">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider text-center">#</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Player</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider text-center">Streak</span>
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider text-right">XP</span>
              </div>

              {/* All entries */}
              {board.map((entry, i) => {
                const rank = i + 1;
                const isTop3 = rank <= 3;
                const medalColors = ["text-on-tertiary-container", "text-on-surface-variant", "text-primary"];
                return (
                  <div
                    key={entry.user_id}
                    className={`grid min-w-[560px] grid-cols-[48px_1fr_80px_100px] gap-3 items-center px-6 py-3.5 border-b border-outline-variant/40 last:border-0 transition-colors ${
                      entry.is_current_user
                        ? "bg-primary/10"
                        : "hover:bg-surface-container-high"
                    }`}
                  >
                    {/* Rank */}
                    <div className="flex justify-center">
                      {isTop3 ? (
                        <span
                          className={`material-symbols-outlined text-xl ${medalColors[i]}`}
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          {i === 0 ? "emoji_events" : "military_tech"}
                        </span>
                      ) : (
                        <span className="font-bold text-on-surface-variant text-sm">
                          {rank}
                        </span>
                      )}
                    </div>

                    {/* Player */}
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={entry.display_name}
                        size="sm"
                        highlight={entry.is_current_user}
                      />
                      <div className="min-w-0">
                        <p
                          className={`font-bold text-sm truncate ${
                            entry.is_current_user ? "text-primary" : "text-on-background"
                          }`}
                        >
                          {entry.display_name}
                          {entry.is_current_user && (
                            <span className="ml-1.5 text-xs font-normal text-primary/60">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                          Level {entry.level}
                        </p>
                      </div>
                    </div>

                    {/* Streak */}
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className="material-symbols-outlined text-tertiary text-base"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        local_fire_department
                      </span>
                      <span className="text-sm font-bold text-on-background">
                        {entry.streak}
                      </span>
                    </div>

                    {/* XP */}
                    <p className="font-extrabold text-sm text-on-background text-right">
                      {entry.xp.toLocaleString()}
                      <span className="text-xs font-normal text-on-surface-variant ml-0.5">XP</span>
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Empty state */
          <div className="bg-surface rounded-3xl p-14 border border-outline-variant text-center space-y-4">
            <span
              className="material-symbols-outlined text-6xl text-on-surface-variant/30"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              leaderboard
            </span>
            <p className="font-bold text-on-background text-lg">
              No data yet for this period
            </p>
            <p className="text-on-surface-variant text-sm max-w-xs mx-auto leading-relaxed">
              Complete habits to earn XP and appear on the leaderboard.
            </p>
            {debugError && (
              <p className="text-xs font-mono bg-error-container text-on-error-container px-4 py-2 rounded-xl max-w-sm mx-auto text-left break-all">
                {debugError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Right stats sidebar ──────────────────────────────── */}
      <aside className="app-stagger w-full flex-shrink-0 space-y-4 xl:w-72 xl:pt-[68px]">

        {/* Your rank card */}
        <div className="hover-raise relative overflow-hidden rounded-3xl border border-primary/25 bg-[linear-gradient(145deg,#2A1208_0%,#3D1A08_55%,#1A1207_100%)] p-5 text-white shadow-[0_8px_32px_rgba(242,107,31,0.15)]">
          <div className="absolute -right-4 -bottom-4 opacity-10 pointer-events-none">
            <span
              className="material-symbols-outlined text-[100px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              leaderboard
            </span>
          </div>
          <div className="relative z-10 space-y-3">
            <p className="text-white/70 text-xs font-bold uppercase tracking-wider">
              Your Ranking
            </p>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-tight text-white">
                {userRank ? `#${userRank}` : "—"}
              </span>
              <span className="text-white/55 font-medium">globally</span>
            </div>
            {topPct && (
              <span className="inline-block bg-surface/20 text-white text-xs font-bold px-3 py-1 rounded-full">
                Top {topPct}%
              </span>
            )}
            {userRank && rankMsg && (
              <ShareButton
                shareText={rankShareText}
                shareUrl={`${SITE_URL}/leaderboard`}
                cardUrl={rankCardUrl ?? undefined}
                label="Share rank"
                className="text-white/80 hover:text-white"
              />
            )}
            <div className="pt-1 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">Level {userLevel} XP</span>
                <span className="text-white font-bold">{levelXP.toLocaleString()} / {XP_PER_LEVEL.toLocaleString()}</span>
              </div>
              <div className="w-full h-1.5 bg-surface/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-surface rounded-full"
                  style={{ width: `${levelPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Next rank progress */}
        {xpToNext !== null && xpToNext > 0 && nextEntry && (
          <div className="hover-raise bg-surface rounded-3xl p-5 border border-outline-variant space-y-3">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-primary text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                trending_up
              </span>
              <h3 className="font-bold text-on-background text-sm">Next Milestone</h3>
            </div>
            <div>
              <p className="font-display text-2xl font-bold tracking-tight text-primary">
                {xpToNext.toLocaleString()} XP
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                to overtake <span className="font-bold text-on-background">{nextEntry.display_name}</span> (Rank #{userRank! - 1})
              </p>
            </div>
          </div>
        )}

        {/* Your stats */}
        <div className="hover-raise bg-surface rounded-3xl p-5 border border-outline-variant space-y-4">
          <h3 className="font-bold text-on-background text-sm">Your Stats</h3>
          <div className="space-y-3">
            {[
              { icon: "bolt", label: "Total XP", val: `${userXP.toLocaleString()} XP`, color: "text-primary" },
              { icon: "local_fire_department", label: "Current Streak", val: `${userStreak} days`, color: "text-tertiary" },
              { icon: "workspace_premium", label: "Level", val: `Level ${userLevel}`, color: "text-secondary" },
            ].map(({ icon, label, val, color }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-surface-container flex items-center justify-center flex-shrink-0">
                  <span
                    className={`material-symbols-outlined text-base ${color}`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-on-surface-variant">{label}</p>
                  <p className="text-sm font-bold text-on-background">{val}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Active users */}
        <div className="bg-secondary-container/20 rounded-3xl p-5 border border-secondary-container/30 flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse flex-shrink-0" />
          <div>
            <p className="font-bold text-on-background text-sm">
              {board.length} {board.length === 1 ? "member" : "members"} ranked
            </p>
            <p className="text-xs text-on-surface-variant">Focused stillness</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
