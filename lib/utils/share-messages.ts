const BADGE_COPY: Record<string, { tagline: string }> = {
  "first-step": { tagline: "Every journey starts with one rep." },
  "habit-builder": { tagline: "Three habits in motion." },
  "early-bird": { tagline: "10 completions done. Keep the pace." },
  "seven-day": { tagline: "7 days straight. The week is yours." },
  consistent: { tagline: "50 completions. Discipline compounds." },
  "healthy-heart": { tagline: "100 habits logged. Still going." },
  "thirty-day": { tagline: "30 days of showing up. No excuses." },
  "water-master": { tagline: "200 habits done. Lagan Legend." },
  "gym-rat": { tagline: "5 habits running. You mean it." },
  "clean-slate": { tagline: "The first habit is the hardest." },
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
  if (topPct !== null && topPct <= 1) {
    tagline = "Top 1%. Built with daily reps.";
  } else if (topPct !== null && topPct <= 5) {
    tagline = "Top 5%. Earned one rep at a time.";
  } else if (topPct !== null && topPct <= 10) {
    tagline = "Top 10%. Discipline compounds.";
  } else if (streak >= 30) {
    tagline = `${streak} days of showing up.`;
  } else if (streak >= 7) {
    tagline = `No missed days. ${streak} in a row.`;
  } else {
    tagline = "Building discipline, one day at a time.";
  }

  return { tagline, subtitle: `Rank #${rank} · Lagan` };
}
