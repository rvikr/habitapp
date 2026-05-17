import { Share } from "react-native";
import { getBadgeShareMessage, getRankShareMessage } from "./share-messages";

const APP_URL = "https://lagan.health";

export async function shareBadge(name: string, description: string, badgeId?: string) {
  const { tagline } = getBadgeShareMessage(badgeId ?? "", name);
  try {
    await Share.share({
      message: `${tagline}\n\nTrack your habits at ${APP_URL}`,
      title: `${name} Badge — Lagan`,
    });
  } catch {
    // user dismissed
  }
}

export async function shareRank(
  rank: number,
  _xp: number,
  _level: number,
  streak: number,
  topPct?: number,
) {
  const { tagline } = getRankShareMessage({ rank, streak, topPct: topPct ?? null });
  try {
    await Share.share({
      message: `${tagline}\n\nJoin me at ${APP_URL}/leaderboard`,
      title: `Rank #${rank} — Lagan`,
    });
  } catch {
    // user dismissed
  }
}
