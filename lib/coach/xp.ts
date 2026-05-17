export const XP_PER_COMPLETION = 10;
export const XP_PER_LEVEL = 500;

export function xpForCompletions(completions: number): number {
  return completions * XP_PER_COMPLETION;
}

export function levelForXp(totalXp: number): number {
  return Math.floor(totalXp / XP_PER_LEVEL) + 1;
}

export function xpInLevel(totalXp: number): number {
  return totalXp % XP_PER_LEVEL;
}
