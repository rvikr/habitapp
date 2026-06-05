export type SleepPermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "providerUpdateRequired"
  | "unavailable";
export type SleepSource = "healthConnect" | "healthKit" | "manual" | "unsupported";

export type SleepStageMinutes = {
  awake?: number;
  asleep?: number;
  core?: number;
  deep?: number;
  rem?: number;
  outOfBed?: number;
};

export type NormalizedSleepEntry = {
  sleepDate: string;
  durationMinutes: number;
  startTime: string | null;
  endTime: string | null;
  stageMinutes: SleepStageMinutes | null;
  sourceMetadata: Record<string, unknown>;
};

export type SleepWindow = {
  sleepDate: string;
  operator: "between";
  startTime: string;
  endTime: string;
};

export type SleepScoreRecentEntry = {
  startMinutes?: number | null;
  endMinutes?: number | null;
};

export type SleepScoreInput = {
  durationMinutes: number;
  targetMinutes?: number | null;
  startMinutes?: number | null;
  endMinutes?: number | null;
  recentEntries?: SleepScoreRecentEntry[];
  stageMinutes?: SleepStageMinutes | null;
};

export type SleepTrendRange = 7 | 30;

type SleepRangeEntry = {
  sleep_date: string;
  score?: number | null;
  duration_minutes?: number | null;
};

export type SleepRangeSummary<T extends SleepRangeEntry> = {
  entries: T[];
  trendEntries: T[];
  count: number;
  averageScore: number | null;
  averageDurationMinutes: number;
};

type HealthConnectSleepStage = {
  startTime?: string;
  endTime?: string;
  stage?: number;
};

type HealthConnectSleepSession = {
  startTime?: string;
  endTime?: string;
  stages?: HealthConnectSleepStage[];
  metadata?: unknown;
};

type HealthKitSleepSample = {
  startDate?: string | Date;
  endDate?: string | Date;
  startTime?: string | Date;
  endTime?: string | Date;
  value?: number;
  uuid?: string;
};

const DEFAULT_SLEEP_TARGET_MINUTES = 8 * 60;
const SLEEP_DAY_CUTOFF_HOUR = 18;
const DEFAULT_SLEEP_LOOKBACK_DAYS = 7;
export const SLEEP_ENTRIES_SETUP_MESSAGE =
  "Sleep tracking storage is not set up yet. Apply the sleep_entries migration and grant authenticated users access, then try again.";

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function sleepDateForWakeTime(wakeTime = new Date()): string {
  const date = new Date(wakeTime);
  if (date.getHours() >= SLEEP_DAY_CUTOFF_HOUR) {
    return dateKey(addDays(date, 1));
  }
  return dateKey(date);
}

export function sleepWindowForDate(sleepDate: string): Omit<SleepWindow, "sleepDate"> {
  const [year, month, day] = sleepDate.split("-").map(Number);
  const end = new Date(year, month - 1, day, SLEEP_DAY_CUTOFF_HOUR, 0, 0, 0);
  const start = addDays(end, -1);
  return { operator: "between", startTime: start.toISOString(), endTime: end.toISOString() };
}

export function lastNightSleepWindow(now = new Date()): SleepWindow {
  const sleepDate = sleepDateForWakeTime(now);
  return { sleepDate, ...sleepWindowForDate(sleepDate) };
}

export function sleepLookbackWindows(
  days = DEFAULT_SLEEP_LOOKBACK_DAYS,
  now = new Date(),
): SleepWindow[] {
  const count = Math.max(1, Math.floor(days));
  const [year, month, day] = sleepDateForWakeTime(now).split("-").map(Number);
  const firstSleepDate = new Date(year, month - 1, day, 12, 0, 0, 0);

  return Array.from({ length: count }, (_, index) => {
    const sleepDate = dateKey(addDays(firstSleepDate, -index));
    return { sleepDate, ...sleepWindowForDate(sleepDate) };
  });
}

export function sleepNoDataMessage(
  provider: "Health Connect" | "Apple Health" | string,
  windows: SleepWindow[],
): string {
  const newest = windows[0]?.sleepDate;
  const oldest = windows[windows.length - 1]?.sleepDate;
  const range =
    newest && oldest
      ? newest === oldest
        ? newest
        : `${oldest} through ${newest}`
      : "the recent sleep window";
  return `No sleep data was found in ${provider} for ${range}. ${provider} only returns sleep sessions recorded by a sleep app or wearable; confirm sleep tracking is enabled there, or log it manually.`;
}

export function summarizeSleepRange<T extends SleepRangeEntry>(
  entries: T[],
  range: SleepTrendRange,
  now = new Date(),
): SleepRangeSummary<T> {
  const sleepDates = new Set(sleepLookbackWindows(range, now).map((window) => window.sleepDate));
  const rangeEntries = entries
    .filter((entry) => sleepDates.has(entry.sleep_date))
    .sort((a, b) => b.sleep_date.localeCompare(a.sleep_date));
  const count = rangeEntries.length;

  if (count === 0) {
    return {
      entries: [],
      trendEntries: [],
      count: 0,
      averageScore: null,
      averageDurationMinutes: 0,
    };
  }

  const scoreTotal = rangeEntries.reduce((sum, entry) => sum + Number(entry.score ?? 0), 0);
  const durationTotal = rangeEntries.reduce(
    (sum, entry) => sum + Number(entry.duration_minutes ?? 0),
    0,
  );

  return {
    entries: rangeEntries,
    trendEntries: [...rangeEntries].reverse(),
    count,
    averageScore: Math.round(scoreTotal / count),
    averageDurationMinutes: durationTotal / count,
  };
}

export function isSleepEntriesSetupError(message: string | null | undefined): boolean {
  const text = String(message ?? "").toLowerCase();
  if (!text.includes("sleep_entries")) return false;
  return (
    text.includes("schema cache") ||
    text.includes("does not exist") ||
    text.includes("permission denied") ||
    text.includes("grant")
  );
}

function minutesBetween(start: Date, end: Date): number {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
}

function parseDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addStageMinutes(stages: SleepStageMinutes, key: keyof SleepStageMinutes, minutes: number) {
  if (minutes <= 0) return;
  stages[key] = Math.round((stages[key] ?? 0) + minutes);
}

function hasStageMinutes(stages: SleepStageMinutes): boolean {
  return Object.values(stages).some((value) => typeof value === "number" && value > 0);
}

function stageMinutesFromHealthConnect(
  stages: HealthConnectSleepStage[] | undefined,
): SleepStageMinutes | null {
  const totals: SleepStageMinutes = {};
  for (const stage of stages ?? []) {
    const start = parseDate(stage.startTime);
    const end = parseDate(stage.endTime);
    if (!start || !end) continue;
    const minutes = minutesBetween(start, end);
    switch (stage.stage) {
      case 3:
        addStageMinutes(totals, "outOfBed", minutes);
        break;
      case 4:
        addStageMinutes(totals, "deep", minutes);
        break;
      case 5:
        addStageMinutes(totals, "rem", minutes);
        break;
      case 6:
        addStageMinutes(totals, "awake", minutes);
        break;
      case 1:
      case 2:
      default:
        addStageMinutes(totals, "asleep", minutes);
        break;
    }
  }
  return hasStageMinutes(totals) ? totals : null;
}

export function normalizeHealthConnectSleepSessions(
  sessions: unknown,
): NormalizedSleepEntry | null {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;

  let earliest: Date | null = null;
  let latest: Date | null = null;
  let durationMinutes = 0;
  const stageTotals: SleepStageMinutes = {};

  for (const session of sessions as HealthConnectSleepSession[]) {
    const start = parseDate(session.startTime);
    const end = parseDate(session.endTime);
    if (!start || !end) continue;
    earliest = !earliest || start.getTime() < earliest.getTime() ? start : earliest;
    latest = !latest || end.getTime() > latest.getTime() ? end : latest;
    durationMinutes += minutesBetween(start, end);

    const stageMinutes = stageMinutesFromHealthConnect(session.stages);
    for (const [key, value] of Object.entries(stageMinutes ?? {}) as [
      keyof SleepStageMinutes,
      number,
    ][]) {
      addStageMinutes(stageTotals, key, value);
    }
  }

  if (!latest || durationMinutes <= 0) return null;
  return {
    sleepDate: sleepDateForWakeTime(latest),
    durationMinutes,
    startTime: earliest?.toISOString() ?? null,
    endTime: latest.toISOString(),
    stageMinutes: hasStageMinutes(stageTotals) ? stageTotals : null,
    sourceMetadata: { recordCount: sessions.length },
  };
}

function sleepStageKeyFromHealthKitValue(
  value: number | undefined,
): keyof SleepStageMinutes | null {
  switch (value) {
    case 2:
      return "awake";
    case 3:
      return "core";
    case 4:
      return "deep";
    case 5:
      return "rem";
    case 1:
      return "asleep";
    default:
      return null;
  }
}

export function normalizeHealthKitSleepSamples(samples: unknown): NormalizedSleepEntry | null {
  if (!Array.isArray(samples) || samples.length === 0) return null;

  let earliest: Date | null = null;
  let latest: Date | null = null;
  let durationMinutes = 0;
  const stageTotals: SleepStageMinutes = {};

  for (const sample of samples as HealthKitSleepSample[]) {
    const start = parseDate(sample.startDate ?? sample.startTime);
    const end = parseDate(sample.endDate ?? sample.endTime);
    if (!start || !end) continue;
    earliest = !earliest || start.getTime() < earliest.getTime() ? start : earliest;
    latest = !latest || end.getTime() > latest.getTime() ? end : latest;

    const minutes = minutesBetween(start, end);
    const stageKey = sleepStageKeyFromHealthKitValue(sample.value);
    if (stageKey === "awake") {
      addStageMinutes(stageTotals, "awake", minutes);
      continue;
    }
    if (!stageKey) continue;

    durationMinutes += minutes;
    addStageMinutes(stageTotals, stageKey, minutes);
  }

  if (!latest || durationMinutes <= 0) return null;
  return {
    sleepDate: sleepDateForWakeTime(latest),
    durationMinutes,
    startTime: earliest?.toISOString() ?? null,
    endTime: latest.toISOString(),
    stageMinutes: hasStageMinutes(stageTotals) ? stageTotals : null,
    sourceMetadata: { sampleCount: samples.length },
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function circularMinuteDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1440;
  return Math.min(diff, 1440 - diff);
}

function consistencyPoints(input: SleepScoreInput): number {
  const recent = input.recentEntries ?? [];
  const starts = recent
    .map((entry) => entry.startMinutes)
    .filter((value): value is number => typeof value === "number");
  const ends = recent
    .map((entry) => entry.endMinutes)
    .filter((value): value is number => typeof value === "number");
  if (
    starts.length < 3 ||
    ends.length < 3 ||
    input.startMinutes == null ||
    input.endMinutes == null
  )
    return 10;

  const medianStart = median(starts);
  const medianEnd = median(ends);
  if (medianStart == null || medianEnd == null) return 10;

  const drift =
    (circularMinuteDistance(input.startMinutes, medianStart) +
      circularMinuteDistance(input.endMinutes, medianEnd)) /
    2;
  return Math.round(Math.max(0, 10 - drift / 18));
}

function stageQualityPoints(
  stageMinutes: SleepStageMinutes | null | undefined,
  durationMinutes: number,
): number {
  if (!stageMinutes || !hasStageMinutes(stageMinutes)) return 5;
  if (durationMinutes <= 0) return 0;
  const restorative = (stageMinutes.deep ?? 0) + (stageMinutes.rem ?? 0);
  const awake = stageMinutes.awake ?? 0;
  const restorativeRatio = restorative / durationMinutes;
  const awakeRatio = awake / Math.max(durationMinutes + awake, 1);
  const restorativePoints = Math.min(restorativeRatio / 0.25, 1) * 5;
  const awakePenalty = Math.min(awakeRatio / 0.18, 1) * 2;
  return Math.round(Math.max(0, Math.min(5, restorativePoints - awakePenalty)));
}

export function computeSleepScore(input: SleepScoreInput): number {
  const targetMinutes =
    input.targetMinutes && input.targetMinutes > 0
      ? input.targetMinutes
      : DEFAULT_SLEEP_TARGET_MINUTES;
  const durationMinutes = Math.max(0, input.durationMinutes);
  const durationPoints = Math.min(durationMinutes / targetMinutes, 1) * 85;
  const score =
    durationPoints +
    consistencyPoints(input) +
    stageQualityPoints(input.stageMinutes, durationMinutes);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function minutesOfDay(value: string | Date | null | undefined): number | null {
  const date = parseDate(value ?? undefined);
  if (!date) return null;
  return date.getHours() * 60 + date.getMinutes();
}

export function buildSleepCompletionValue(durationMinutes: number): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  return Math.round((durationMinutes / 60) * 10) / 10;
}
