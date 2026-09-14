export function getBadgeShareMessage(
  badgeName: string,
  description: string,
): { tagline: string; subtitle: string } {
  return {
    tagline: `I unlocked the ${badgeName} badge on Lagan.`,
    subtitle: description,
  };
}

export function getRankShareMessage(rank: number): { tagline: string; subtitle: string } {
  return {
    tagline: `I'm ranked #${rank} on Lagan's global leaderboard. Can you beat me?`,
    subtitle: "All-time global rank",
  };
}
