import { Share } from "react-native";
import { getBadgeShareMessage, getRankShareMessage } from "./share-messages";

const APP_URL = "https://lagan.health";

export async function shareBadge(name: string, description: string, _badgeId?: string) {
  const { tagline, subtitle } = getBadgeShareMessage(name, description);
  try {
    await Share.share({
      message: `${tagline}\n${subtitle}\n\nBuild better habits at ${APP_URL}/achievements`,
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
  _streak: number,
  _topPct?: number,
) {
  const { tagline } = getRankShareMessage(rank);
  try {
    await Share.share({
      message: `${tagline}\n\nJoin me at ${APP_URL}/leaderboard`,
      title: `Rank #${rank} — Lagan`,
    });
  } catch {
    // user dismissed
  }
}
