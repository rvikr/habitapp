type ExportRow = Record<string, unknown>;

type ExportUser = {
  id: string;
  email: string | null;
};

type BuildDataExportInput = {
  exportedAt?: string;
  user: ExportUser;
  profile: ExportRow | null;
  habits?: ExportRow[] | null;
  completions?: ExportRow[] | null;
  sleepEntries?: ExportRow[] | null;
  feedback?: ExportRow[] | null;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compareDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function compareAsc(a: string, b: string): number {
  return a.localeCompare(b);
}

function rowId(row: ExportRow): string {
  return stringValue(row.id);
}

function sortHabits(habits: ExportRow[]): ExportRow[] {
  return [...habits].sort((a, b) => {
    const created = compareAsc(stringValue(a.created_at), stringValue(b.created_at));
    if (created !== 0) return created;
    return compareAsc(rowId(a), rowId(b));
  });
}

function sortCompletions(completions: ExportRow[]): ExportRow[] {
  return [...completions].sort((a, b) => {
    const completedOn = compareDesc(stringValue(a.completed_on), stringValue(b.completed_on));
    if (completedOn !== 0) return completedOn;
    const created = compareDesc(stringValue(a.created_at), stringValue(b.created_at));
    if (created !== 0) return created;
    return compareAsc(rowId(a), rowId(b));
  });
}

function sortSleepEntries(sleepEntries: ExportRow[]): ExportRow[] {
  return [...sleepEntries].sort((a, b) => {
    const sleepDate = compareDesc(stringValue(a.sleep_date), stringValue(b.sleep_date));
    if (sleepDate !== 0) return sleepDate;
    return compareAsc(rowId(a), rowId(b));
  });
}

function sortFeedback(feedback: ExportRow[]): ExportRow[] {
  return [...feedback].sort((a, b) => {
    const created = compareDesc(stringValue(a.created_at), stringValue(b.created_at));
    if (created !== 0) return created;
    return compareAsc(rowId(a), rowId(b));
  });
}

function duplicateCompletionPeriods(completions: ExportRow[]) {
  const periods = new Map<
    string,
    { habit_id: string; completed_on: string; completion_ids: string[] }
  >();

  for (const completion of completions) {
    const habitId = stringValue(completion.habit_id);
    const completedOn = stringValue(completion.completed_on);
    if (!habitId || !completedOn) continue;

    const key = `${habitId}\u0000${completedOn}`;
    const period = periods.get(key) ?? {
      habit_id: habitId,
      completed_on: completedOn,
      completion_ids: [],
    };
    period.completion_ids.push(rowId(completion));
    periods.set(key, period);
  }

  return [...periods.values()]
    .filter((period) => period.completion_ids.length > 1)
    .map((period) => ({
      ...period,
      completion_ids: [...period.completion_ids].sort(compareAsc),
    }))
    .sort((a, b) => {
      const habit = compareAsc(a.habit_id, b.habit_id);
      if (habit !== 0) return habit;
      return compareDesc(a.completed_on, b.completed_on);
    });
}

function orphanCompletionIds(habits: ExportRow[], completions: ExportRow[]): string[] {
  const habitIds = new Set(habits.map((habit) => rowId(habit)).filter(Boolean));
  return completions
    .filter((completion) => !habitIds.has(stringValue(completion.habit_id)))
    .map((completion) => rowId(completion))
    .filter(Boolean)
    .sort(compareAsc);
}

export function buildDataExport(input: BuildDataExportInput) {
  const habits = sortHabits(input.habits ?? []);
  const completions = sortCompletions(input.completions ?? []);
  const sleepEntries = sortSleepEntries(input.sleepEntries ?? []);
  const feedback = sortFeedback(input.feedback ?? []);

  return {
    schema_version: 1,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    user: input.user,
    profile: input.profile ?? null,
    habits,
    completions,
    sleep_entries: sleepEntries,
    feedback,
    integrity: {
      counts: {
        profile: input.profile ? 1 : 0,
        habits: habits.length,
        completions: completions.length,
        sleep_entries: sleepEntries.length,
        feedback: feedback.length,
      },
      duplicate_completion_periods: duplicateCompletionPeriods(completions),
      orphan_completion_ids: orphanCompletionIds(habits, completions),
    },
  };
}
