const BADGE_COPY: Record<string, { tagline: string }> = {
  momentum: { tagline: "30 days of consistency." },
  "perfect-week": { tagline: "No missed days this week." },
  "early-bird": { tagline: "The early reps are the hardest." },
  hydration: { tagline: "Hydration is discipline, too." },
  century: { tagline: "100 habits logged. Still going." },
  "marathon-mind": { tagline: "50 sessions completed. No shortcuts." },
  "zen-master": { tagline: "100 meditations. The mind trains too." },
  bookworm: { tagline: "30 days of reading. Compounding knowledge." },
  polyglot: { tagline: "14 days of language practice. Consistent." },
  "mind-palace": { tagline: "365 habit days. A full year of showing up." },
  diamond: { tagline: "500 habits done. Lagan Legend." },
  "week-1": { tagline: "Week one complete. The hardest one." },
};

export function getBadgeShareMessage(
  badgeId: string,
  badgeName: string,
): { tagline: string; subtitle: string } {
  const copy = BADGE_COPY[badgeId];
  return {
    tagline: copy?.tagline ?? "Showing up, one day at a time.",
    subtitle: `${badgeName} · Lagan`,
  };
}

export function getRankShareMessage(params: {
  rank: number;
  streak: number;
  topPct: number | null;
}): { tagline: string; subtitle: string } {
  const { rank, streak, topPct } = params;

  let tagline: string;
  if (topPct !== null && topPct <= 1) tagline = "Top 1%. Built with daily reps.";
  else if (topPct !== null && topPct <= 5) tagline = "Top 5%. Earned one rep at a time.";
  else if (topPct !== null && topPct <= 10) tagline = "Top 10%. Discipline compounds.";
  else if (streak >= 30) tagline = `${streak} days of showing up.`;
  else if (streak >= 7) tagline = `No missed days. ${streak} in a row.`;
  else tagline = "Building discipline, one day at a time.";

  return { tagline, subtitle: `Rank #${rank} · Lagan` };
}
