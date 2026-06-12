// Server-side port of lib/coach/coach.ts for edge functions.
//
// Edge functions deliberately do not import from lib/ (different runtimes and
// bundlers); parity with the client engine is enforced by source/behavior
// assertions in tests/unit.test.mjs ("coach signal engine parity"). Keep the
// signal kinds, priorities, and message templates in sync with the client when
// editing either side.
//
// The one intentional difference: the client computes "local" time from the
// device clock, while this port receives the user's IANA timezone and derives
// the same local fields (today's date key, hour, minute, weekday) from it via
// `localTimeContext`. Date-key arithmetic happens on the YYYY-MM-DD strings in
// UTC so the math is independent of the server's own timezone.
//
// This module is dependency-free so the Node test runner can import it with
// --experimental-strip-types.

export type CoachTone = "friendly" | "motivational" | "calm" | "strict" | "military";

export type CoachSignalKind =
  | "behind_progress"
  | "usual_skip_window"
  | "streak_risk"
  | "burnout"
  | "easy_alternative"
  | "encouragement";

export type CoachSuggestedAction = "open_habit" | "log_value";

export type CoachSignal = {
  kind: CoachSignalKind;
  priority: number;
  habitId: string;
  habitName: string;
  message: string;
  suggestedAction: CoachSuggestedAction;
  suggestedValue?: number;
  tone: CoachTone;
  progressPct?: number;
  unit?: string | null;
  skipWindowLabel?: string;
};

export type CoachHabit = {
  id: string;
  name: string;
  target: number | null;
  unit: string | null;
  default_log_value: number | null;
  habit_type?: string | null;
  metric_type?: string | null;
};

export type CoachCompletion = {
  habit_id: string;
  completed_on: string;
  created_at: string;
  value: number | null;
};

export type LocalTimeContext = {
  todayKey: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  timezone: string;
};

type BuildCoachSignalsInput = {
  habits: CoachHabit[];
  completions: CoachCompletion[];
  local: LocalTimeContext;
  tone?: CoachTone | null;
};

const COACH_ACTIVE_START_HOUR = 8;
const COACH_ACTIVE_END_HOUR = 22;
const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

export function localTimeContext(now: Date, timezone: string): LocalTimeContext {
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: timezone }).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Some Intl implementations render midnight as "24" with hour12: false.
  const hour = parseInt(part("hour"), 10) % 24;
  const minute = parseInt(part("minute"), 10);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(part("weekday"));
  return { todayKey, hour, minute, dayOfWeek, timezone };
}

export function dateKeyDaysAgo(todayKey: string, daysAgo: number): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - daysAgo)).toISOString().slice(0, 10);
}

function hourInTimezone(isoTimestamp: string, timezone: string): number {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date(isoTimestamp))
    .find((p) => p.type === "hour")?.value;
  return parseInt(value ?? "0", 10) % 24;
}

function dayOfWeekForDateKey(dateKey: string): number {
  // Anchored at UTC noon so the weekday of the calendar date is unambiguous.
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

export function normalizeCoachTone(tone: string | null | undefined): CoachTone {
  if (
    tone === "motivational" ||
    tone === "calm" ||
    tone === "strict" ||
    tone === "military" ||
    tone === "friendly"
  )
    return tone;
  return "friendly";
}

export function buildCoachSignals({
  habits,
  completions,
  local,
  tone,
}: BuildCoachSignalsInput): CoachSignal[] {
  const normalizedTone = normalizeCoachTone(tone);
  const signals: CoachSignal[] = [];
  const todayKey = local.todayKey;
  const completionsByHabit = groupByHabit(completions);
  const burnout = detectBurnout(completions, todayKey);

  if (
    burnout &&
    habits.some((habit) => !progressFor(habit, completionsByHabit.get(habit.id), todayKey).isDone)
  ) {
    const firstOpenHabit = habits.find(
      (habit) => !progressFor(habit, completionsByHabit.get(habit.id), todayKey).isDone,
    );
    if (firstOpenHabit) {
      signals.push(
        withMessage({
          kind: "burnout",
          priority: 95,
          habitId: firstOpenHabit.id,
          habitName: firstOpenHabit.name,
          suggestedAction: "open_habit",
          tone: "calm",
        }),
      );
    }
  }

  for (const habit of habits) {
    const history = completionsByHabit.get(habit.id) ?? [];
    const progress = progressFor(habit, history, todayKey);
    if (progress.isDone) continue;

    const suggestedValue = suggestedLogValue(habit, progress.current);
    const progressPct = Math.round(progress.ratio * 100);

    if (habit.target && habit.target > 0 && isBehindExpectedProgress(progress.ratio, local)) {
      signals.push(
        withMessage({
          kind: "behind_progress",
          priority:
            70 + Math.max(0, Math.round((expectedProgressForDay(local) - progress.ratio) * 20)),
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          progressPct,
          unit: habit.unit,
        }),
      );
    }

    if (detectLateSkipWindow(history, local)) {
      signals.push(
        withMessage({
          kind: "usual_skip_window",
          priority: 82,
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          unit: habit.unit,
          skipWindowLabel: `${DAY_NAMES[local.dayOfWeek]} after 8 PM`,
        }),
      );
    }

    const streak = currentStreak(history, todayKey);
    if (streak > 1) {
      signals.push(
        withMessage({
          kind: "streak_risk",
          priority: 60 + Math.min(streak, 10),
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: suggestedValue ? "log_value" : "open_habit",
          suggestedValue: suggestedValue ?? undefined,
          tone: normalizedTone,
          unit: habit.unit,
        }),
      );
    }

    if (suggestedValue && local.hour >= 18) {
      signals.push(
        withMessage({
          kind: "easy_alternative",
          priority: 50,
          habitId: habit.id,
          habitName: habit.name,
          suggestedAction: "log_value",
          suggestedValue,
          tone: normalizedTone,
          unit: habit.unit,
        }),
      );
    }
  }

  if (signals.length === 0 && habits.length > 0) {
    signals.push(
      withMessage({
        kind: "encouragement",
        priority: 10,
        habitId: habits[0].id,
        habitName: habits[0].name,
        suggestedAction: "open_habit",
        tone: normalizedTone,
      }),
    );
  }

  return signals.sort((a, b) => b.priority - a.priority);
}

export function chooseTopCoachSignal(signals: CoachSignal[]): CoachSignal | null {
  return [...signals].sort((a, b) => b.priority - a.priority)[0] ?? null;
}

export function formatCoachMessage(
  signal: Omit<CoachSignal, "message"> & { message?: string },
): string {
  if (signal.message?.trim()) return signal.message.trim();
  if (signal.kind === "burnout") {
    return "You have been pushing unevenly lately. Choose one smaller step today and rebuild without forcing it.";
  }

  const action = actionText(signal);
  if (signal.kind === "behind_progress") {
    const progress = signal.progressPct ?? 0;
    if (signal.tone === "military")
      return `Mission update: ${signal.habitName} is only ${progress}% complete. ${action}.`;
    if (signal.tone === "strict")
      return `You're only ${progress}% through ${signal.habitName}. ${action} before the day gets away.`;
    if (signal.tone === "calm")
      return `You're at ${progress}% for ${signal.habitName}. A small reset now is enough: ${action.toLowerCase()}.`;
    if (signal.tone === "motivational")
      return `Momentum check: ${signal.habitName} is ${progress}% done. ${action} and keep the day moving.`;
    return `You've only completed ${progress}% of ${signal.habitName} today. ${action} so you don't fall behind.`;
  }

  if (signal.kind === "usual_skip_window") {
    const window = signal.skipWindowLabel ?? "this time";
    if (signal.tone === "military")
      return `Mission risk: you usually miss ${signal.habitName} on ${window}. Do the shorter ${versionText(signal)} now.`;
    if (signal.tone === "strict")
      return `This is your usual skip window for ${signal.habitName}. Do the shorter ${versionText(signal)} now.`;
    if (signal.tone === "calm")
      return `${signal.habitName} is harder for you around ${window}. Want to do the gentler version today?`;
    if (signal.tone === "motivational")
      return `You can beat the ${window} pattern for ${signal.habitName}. Want to do a shorter ${versionText(signal)} today?`;
    return `You usually skip ${signal.habitName} on ${window}. Want to do a shorter ${versionText(signal)} today?`;
  }

  if (signal.kind === "streak_risk") {
    if (signal.tone === "military") return `Protect the streak: ${action}.`;
    if (signal.tone === "strict") return `Do not let the streak drop today. ${action}.`;
    if (signal.tone === "calm") return `Your streak only needs one small step. ${action}.`;
    if (signal.tone === "motivational") return `Keep your momentum alive. ${action}.`;
    return `Only a moment to keep your ${signal.habitName} streak alive. ${action}.`;
  }

  if (signal.kind === "easy_alternative") {
    if (signal.tone === "military")
      return `Fallback mission: complete ${valueText(signal)} of ${signal.habitName}.`;
    if (signal.tone === "strict")
      return `Lower the target, not the standard. Complete ${valueText(signal)} now.`;
    if (signal.tone === "calm")
      return `A smaller version counts. Try ${valueText(signal)} of ${signal.habitName}.`;
    if (signal.tone === "motivational")
      return `Keep the chain alive with ${valueText(signal)} of ${signal.habitName}.`;
    return `Want to make this easier? Do ${valueText(signal)} of ${signal.habitName} today.`;
  }

  if (signal.tone === "military") return `Mission: complete ${signal.habitName}. Begin now.`;
  if (signal.tone === "strict") return `Commit to ${signal.habitName} now.`;
  if (signal.tone === "calm") return `Take one small step toward ${signal.habitName}.`;
  if (signal.tone === "motivational") return `Build momentum with ${signal.habitName} today.`;
  return `You can still make progress on ${signal.habitName} today.`;
}

function withMessage(signal: Omit<CoachSignal, "message">): CoachSignal {
  return { ...signal, message: formatCoachMessage(signal) };
}

function groupByHabit(completions: CoachCompletion[]): Map<string, CoachCompletion[]> {
  const byHabit = new Map<string, CoachCompletion[]>();
  for (const completion of completions) {
    if (!byHabit.has(completion.habit_id)) byHabit.set(completion.habit_id, []);
    byHabit.get(completion.habit_id)!.push(completion);
  }
  return byHabit;
}

function progressFor(habit: CoachHabit, history: CoachCompletion[] | undefined, todayKey: string) {
  const completion = history?.find((item) => item.completed_on === todayKey);
  const current = Number(completion?.value ?? (completion ? 1 : 0));
  const target = habit.target == null ? null : Number(habit.target);
  const ratio =
    target && target > 0 ? Math.min(Math.max(current / target, 0), 1) : completion ? 1 : 0;
  return { current, ratio, isDone: target && target > 0 ? current >= target : !!completion };
}

function expectedProgressForDay(local: LocalTimeContext): number {
  const hour = local.hour + local.minute / 60;
  return Math.min(
    Math.max(
      (hour - COACH_ACTIVE_START_HOUR) / (COACH_ACTIVE_END_HOUR - COACH_ACTIVE_START_HOUR),
      0,
    ),
    1,
  );
}

function isBehindExpectedProgress(ratio: number, local: LocalTimeContext): boolean {
  const expected = expectedProgressForDay(local);
  return expected >= 0.3 && ratio + 0.15 < expected;
}

function suggestedLogValue(habit: CoachHabit, current: number): number | null {
  const remaining = habit.target == null ? null : Math.max(Number(habit.target) - current, 0);
  const defaultValue = Number(habit.default_log_value ?? 0);
  if (!Number.isFinite(defaultValue) || defaultValue <= 0) return null;
  const multiplier =
    habit.habit_type === "water_intake" || habit.metric_type === "volume_ml" ? 2 : 1;
  const value = Math.max(1, Math.floor(defaultValue * multiplier));
  return remaining == null || remaining <= 0 ? value : Math.min(value, Math.floor(remaining));
}

function detectLateSkipWindow(history: CoachCompletion[], local: LocalTimeContext): boolean {
  if (local.hour < 20) return false;
  const sameWeekday = history.filter(
    (completion) =>
      dayOfWeekForDateKey(completion.completed_on) === local.dayOfWeek &&
      completion.completed_on !== local.todayKey,
  );
  if (sameWeekday.length < 2) return false;
  return sameWeekday.every(
    (completion) => hourInTimezone(completion.created_at, local.timezone) < 20,
  );
}

function detectBurnout(completions: CoachCompletion[], todayKey: string): boolean {
  const uniqueDates = new Set(completions.map((completion) => completion.completed_on));
  const recentMisses = [0, 1, 2].every(
    (daysAgo) => !uniqueDates.has(dateKeyDaysAgo(todayKey, daysAgo)),
  );
  if (!recentMisses) return false;
  let priorWeekCount = 0;
  for (let daysAgo = 3; daysAgo <= 10; daysAgo++) {
    if (uniqueDates.has(dateKeyDaysAgo(todayKey, daysAgo))) priorWeekCount++;
  }
  return priorWeekCount >= 4;
}

function currentStreak(history: CoachCompletion[], todayKey: string): number {
  const dates = new Set(history.map((completion) => completion.completed_on));
  let streak = 0;
  for (let daysAgo = 1; daysAgo <= 60; daysAgo++) {
    if (!dates.has(dateKeyDaysAgo(todayKey, daysAgo))) break;
    streak++;
  }
  return streak;
}

function actionText(signal: Pick<CoachSignal, "suggestedValue" | "unit" | "habitName">): string {
  if (!signal.suggestedValue) return `Open ${signal.habitName}`;
  return `Do ${valueText(signal)} now`;
}

function valueText(signal: Pick<CoachSignal, "suggestedValue" | "unit">): string {
  if (!signal.suggestedValue) return "a small version";
  const unit = signal.unit ? ` ${signal.unit}` : "";
  return `${formatAmount(signal.suggestedValue)}${unit}`;
}

function versionText(signal: Pick<CoachSignal, "suggestedValue" | "unit">): string {
  if (
    signal.suggestedValue &&
    (signal.unit === "min" || signal.unit === "minute" || signal.unit === "minutes")
  ) {
    return `${formatAmount(signal.suggestedValue)}-minute version`;
  }
  return `${valueText(signal)} version`;
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}
