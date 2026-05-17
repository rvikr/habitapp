export function normalizeStepCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Math.max(0, Math.floor(Number.isFinite(numeric) ? numeric : 0));
}

export function healthConnectTodayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    operator: "between" as const,
    startTime: start.toISOString(),
    endTime: now.toISOString(),
  };
}

export function normalizeHealthConnectStepAggregate(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const total = (result as { COUNT_TOTAL?: unknown }).COUNT_TOTAL;
  if (total == null) return 0;
  return normalizeStepCount(total);
}
